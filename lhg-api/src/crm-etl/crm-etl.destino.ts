/**
 * Destino do job do CRM. O Pg grava no Supabase do CRM; o de memória é o
 * destino FALSO dos testes (e do modo de conferência), com a MESMA semântica.
 *
 * Cada lote de uma unidade é UMA transação: as 6 tabelas e a linha de
 * etl_runs entram juntas ou nada entra — a marca d'água só avança com os
 * dados gravados.
 */
import { Pool } from 'pg';
import { LoteRaw } from './crm-etl.transformar';
import { ORDEM_GRAVACAO, TABELAS_RAW, TabelaRaw } from './crm-etl.raw';

export interface ExecucaoEtl {
  id: string;
  unidade: string;
  modo: 'incremental' | 'backfill';
  /** Janela de check-out, hora local da unidade (sem fuso). */
  desde: string;
  ate: string;
  iniciadoEm: Date;
}

export type Contagens = Record<(typeof ORDEM_GRAVACAO)[number], number>;

export interface DestinoCrm {
  /** `ate` da última execução ok da unidade (hora local), ou null se nunca rodou. */
  marcaDagua(unidade: string): Promise<string | null>;
  gravar(exec: ExecucaoEtl, lote: LoteRaw): Promise<Contagens>;
  registrarErro(exec: ExecucaoEtl, erro: string): Promise<void>;
  fechar(): Promise<void>;
}

export const contar = (lote: LoteRaw): Contagens => ({
  estadias: lote.estadias.length,
  clientes: lote.clientes.length,
  pessoas: lote.pessoas.length,
  itens: lote.itens.length,
  pacotes: lote.pacotes.length,
  reservas: lote.reservas.length,
});

const LOTE_SQL = 1000;

/**
 * Conexão com o CRM. Com o certificado raiz (CRM_ETL_DB_CA), o servidor é
 * VERIFICADO (cadeia + nome do host): os parâmetros de SSL da URL saem, porque
 * o driver (pg 8.x) os aplicaria por cima do `ssl` explícito. Sem o
 * certificado, vale a URL como está (ex.: sslmode=require&uselibpqcompat=true:
 * criptografa sem verificar, como o libpq).
 */
export function opcoesConexao(url: string, ca: string | null): { connectionString: string; ssl?: object } {
  if (!ca) return { connectionString: url };
  const u = new URL(url);
  for (const p of ['sslmode', 'uselibpqcompat', 'sslrootcert', 'sslcert', 'sslkey', 'ssl']) u.searchParams.delete(p);
  return { connectionString: u.toString(), ssl: { ca, rejectUnauthorized: true, servername: u.hostname } };
}

// ── Pg ─────────────────────────────────────────────────────────────────────
export class DestinoPg implements DestinoCrm {
  private pool: Pool;

  constructor(
    url: string,
    private readonly schema: string,
    ca: string | null = null,
  ) {
    this.pool = new Pool({ ...opcoesConexao(url, ca), max: 2, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000 });
    this.pool.on('error', () => undefined);
  }

  private t(nome: string) {
    return `"${this.schema}"."${nome}"`;
  }

  async marcaDagua(unidade: string): Promise<string | null> {
    const r = await this.pool.query(
      `SELECT to_char(max(ate), 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS ate FROM ${this.t('etl_runs')} WHERE unidade = $1 AND status = 'ok'`,
      [unidade],
    );
    return r.rows[0]?.ate ?? null;
  }

  /** INSERT … SELECT FROM jsonb_to_recordset: um parâmetro por bloco, sem limite de parâmetros. */
  private sqlUpsert(t: TabelaRaw): string {
    const cols = t.colunas.map((c) => c.nome);
    const tipos = t.colunas.map((c) => `${c.nome} ${c.tipo}`).join(', ');
    const set = t.colunas
      .filter((c) => !t.chave.includes(c.nome))
      .map((c) =>
        c.manterSeNulo
          ? `${c.nome} = COALESCE(EXCLUDED.${c.nome}, ${this.t(t.nome)}.${c.nome})`
          : `${c.nome} = EXCLUDED.${c.nome}`,
      );
    set.push('atualizado_em = now()');
    return (
      `INSERT INTO ${this.t(t.nome)} (${cols.join(', ')}) ` +
      `SELECT ${cols.join(', ')} FROM jsonb_to_recordset($1::jsonb) AS x(${tipos}) ` +
      `ON CONFLICT (${t.chave.join(', ')}) DO UPDATE SET ${set.join(', ')}`
    );
  }

  async gravar(exec: ExecucaoEtl, lote: LoteRaw): Promise<Contagens> {
    const cli = await this.pool.connect();
    try {
      await cli.query('BEGIN');
      // Um gravador por unidade de cada vez (outra instância ou execução manual).
      const trava = await cli.query('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS ok', [`crm_etl:${exec.unidade}`]);
      if (!trava.rows[0]?.ok) throw new Error('crm_etl: outra gravação da unidade em andamento');

      const ids = lote.estadias.map((e) => e.id_estadia);
      for (const k of ORDEM_GRAVACAO) {
        const t = TABELAS_RAW[k];
        const linhas = lote[k] as object[];
        if (t.modo === 'filhos' && ids.length) {
          await cli.query(`DELETE FROM ${this.t(t.nome)} WHERE unidade = $1 AND id_estadia = ANY($2::bigint[])`, [
            exec.unidade,
            ids,
          ]);
        }
        const sql = this.sqlUpsert(t);
        for (let i = 0; i < linhas.length; i += LOTE_SQL) {
          await cli.query(sql, [JSON.stringify(linhas.slice(i, i + LOTE_SQL))]);
        }
      }
      const contagens = contar(lote);
      await cli.query(
        `INSERT INTO ${this.t('etl_runs')} (id, unidade, modo, desde, ate, iniciado_em, terminado_em, status, contagens, checksums)
         VALUES ($1, $2, $3, $4::timestamp, $5::timestamp, $6, now(), 'ok', $7::jsonb, $8::jsonb)`,
        [
          exec.id,
          exec.unidade,
          exec.modo,
          exec.desde,
          exec.ate,
          exec.iniciadoEm,
          JSON.stringify(contagens),
          JSON.stringify(lote.checksums),
        ],
      );
      await cli.query('COMMIT');
      return contagens;
    } catch (e) {
      await cli.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      cli.release();
    }
  }

  async registrarErro(exec: ExecucaoEtl, erro: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.t('etl_runs')} (id, unidade, modo, desde, ate, iniciado_em, terminado_em, status, erro)
       VALUES ($1, $2, $3, $4::timestamp, $5::timestamp, $6, now(), 'erro', $7)`,
      [exec.id, exec.unidade, exec.modo, exec.desde, exec.ate, exec.iniciadoEm, erro.slice(0, 200)],
    );
  }

  async fechar(): Promise<void> {
    await this.pool.end();
  }
}

// ── Memória (destino falso) ────────────────────────────────────────────────
export interface RunMemoria extends ExecucaoEtl {
  status: 'ok' | 'erro';
  contagens?: Contagens;
  checksums?: LoteRaw['checksums'];
  erro?: string;
}

export class DestinoMemoria implements DestinoCrm {
  readonly tabelas = new Map<string, Map<string, Record<string, unknown>>>();
  readonly runs: RunMemoria[] = [];
  /** Para testar a atomicidade: falha a gravação da tabela com este nome. */
  falharEm: string | null = null;

  linhas(nome: string): Record<string, unknown>[] {
    return [...(this.tabelas.get(nome)?.values() ?? [])];
  }

  async marcaDagua(unidade: string): Promise<string | null> {
    const ok = this.runs.filter((r) => r.unidade === unidade && r.status === 'ok').map((r) => r.ate);
    return ok.length ? ok.sort()[ok.length - 1] : null;
  }

  async gravar(exec: ExecucaoEtl, lote: LoteRaw): Promise<Contagens> {
    // Copia, grava na cópia e só troca no fim: tudo ou nada, como a transação do Pg.
    const copia = new Map([...this.tabelas].map(([k, v]) => [k, new Map(v)]));
    const ids = new Set(lote.estadias.map((e) => e.id_estadia));
    for (const k of ORDEM_GRAVACAO) {
      const t = TABELAS_RAW[k];
      if (this.falharEm === t.nome) throw new Error(`falha simulada em ${t.nome}`);
      const tab = copia.get(t.nome) ?? new Map<string, Record<string, unknown>>();
      if (t.modo === 'filhos') {
        for (const [chave, l] of tab) if (l.unidade === exec.unidade && ids.has(l.id_estadia as string)) tab.delete(chave);
      }
      for (const linha of lote[k] as unknown as Record<string, unknown>[]) {
        const chave = t.chave.map((c) => String(linha[c])).join('|');
        const antes = tab.get(chave);
        const nova = { ...linha };
        if (antes) for (const c of t.colunas) if (c.manterSeNulo && nova[c.nome] == null) nova[c.nome] = antes[c.nome];
        tab.set(chave, nova);
      }
      copia.set(t.nome, tab);
    }
    for (const [k, v] of copia) this.tabelas.set(k, v);
    const contagens = contar(lote);
    this.runs.push({ ...exec, status: 'ok', contagens, checksums: lote.checksums });
    return contagens;
  }

  async registrarErro(exec: ExecucaoEtl, erro: string): Promise<void> {
    this.runs.push({ ...exec, status: 'erro', erro });
  }

  async fechar(): Promise<void> {}
}

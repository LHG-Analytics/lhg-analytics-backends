/**
 * Consultas do NPS na réplica do Automo (só leitura).
 * Nenhuma query usa now()/current_timestamp: o relógio do servidor da réplica
 * está adiantado; as janelas chegam prontas como parâmetro (ver nps-estadia.ts).
 * Só o Endpoint C devolve um dado pessoal (o celular), e só para o escopo
 * 'contato'; o B diz apenas se ele existe (tem_contato), calculado no banco.
 */
import { Injectable } from '@nestjs/common';
import { TenantPoolService } from '../database/tenant-pool.service';
import { TenantConfig } from '../tenant/tenant.interfaces';
import { NpsTentativasService, SituacaoTentativas } from './nps-tentativas.service';
import {
  CELULAR_BR_DIGITOS,
  ConsultaCheckouts,
  ConsultaConfirmarCpf,
  ConsultaHospede,
  ConsultaContato,
  ConsultaEstadia,
  celularE164,
  deLocalAutomo,
} from './nps-estadia';

export type EstadoEstadia = 'ativa' | 'finalizada_recente' | 'nenhuma';

export interface RespostaEstadia {
  unidade: string;
  suite: number;
  estado: EstadoEstadia;
  /** id_apartamentostate da raiz da cadeia (sobe por id_locacaoorigem): a chave da estadia. */
  locacao_raiz_ref: string | null;
  /** id_apartamentostate da locação desta suíte. */
  locacao_ref: string | null;
  inicio: string | null;
  fim: string | null;
  tem_reserva: boolean;
  /**
   * A estadia tem CPF válido (e não genérico) ligado: o NPS pode pedir os 3
   * primeiros dígitos (Endpoint D). false → ir direto ao C4. Sem expor nada.
   */
  tem_cpf: boolean;
}

export type ResultadoConfirmarCpf =
  | { ok: true }
  | { ok: false; tentativas_restantes: number }
  | { ok: false; bloqueado: true; retry_after: number }
  | { ok: false; sem_cpf: true }
  | { ok: false; sem_estadia: true };

export interface SuiteNps {
  suite: number;
  categoria_id: number;
  /** categoriaapartamento.nomeexibicao (ex.: "Lush Spa"), ou a descricao se vazia. */
  categoria_nome: string;
  categoria_sigla: string | null;
}

export interface RespostaSuites {
  unidade: string;
  suites: SuiteNps[];
}

export type PapelHospede = 'reserva' | 'acompanhante' | 'hospede';

export type ResultadoHospede =
  | { ok: true; pessoas: { nome: string; papel: PapelHospede }[] }
  | { ok: false; motivo: 'nao_encontrada' | 'fora_da_janela' };

/** Cache do Endpoint E (por unidade, por processo). */
export const SUITES_CACHE_MS = 3600_000;

export interface CheckoutNps {
  locacao_raiz_ref: string;
  /** A locação FINALIZADA (a última da cadeia, com o check-out). */
  locacao_ref: string;
  unidade: string;
  /** Suíte final. */
  suite: number;
  inicio: string | null;
  /** Com milissegundos: é a marca d'água da paginação. */
  fim: string | null;
  fim_tipo: 'FINALIZADA';
  /** tipo_origem_reserva, ou BALCAO quando não houve reserva. */
  origem_reserva: string;
  /** RESERVA_API → id_reservaexterna; GUIA_DE_MOTEIS → id_reservaguiamoteis; senão null. */
  reserva_canal_ref: string | null;
  /** O Automo tem celular válido para a reserva (sem o número). */
  tem_contato: boolean;
}

export interface RespostaCheckouts {
  unidade: string;
  itens: CheckoutNps[];
  /** Próxima página (mesma consulta com desde e apos_ref), ou null. */
  proximo: { desde: string; apos_ref: string } | null;
}

export type ResultadoContato =
  | { ok: true; celular: string; origem_reserva: string }
  | { ok: false; motivo: 'sem_contato' | 'fora_da_janela' | 'nao_encontrada' };

/** Horas como texto local (sem fuso) — não depende do TZ do processo. */
const LOCAL = `'YYYY-MM-DD"T"HH24:MI:SS.MS'`;
/** Só dígitos de um campo de telefone. */
const DIGITOS = (col: string) => `regexp_replace(coalesce(${col}, ''), '\\D', '', 'g')`;

// Suíte = apartamento ativo de uma categoria de suíte da unidade.
export const SQL_SUITE = `
  SELECT a.id FROM apartamento a
  WHERE a.numero = $1 AND a.dataexclusao IS NULL AND a.id_categoriaapartamento = ANY($2::int[])
  ORDER BY a.id LIMIT 1`;

// Troca de suíte: desce pela cadeia (id_locacaoorigem é único) até a locação
// mais nova e devolve a suíte dela, a suíte ATUAL da estadia.
export const SQL_SUITE_ATUAL_DA_CADEIA = `
  WITH RECURSIVE d AS (
    SELECT id_apartamentostate, 0 AS n FROM locacaoapartamento WHERE id_apartamentostate = $1
    UNION ALL
    SELECT l.id_apartamentostate, d.n + 1
    FROM locacaoapartamento l JOIN d ON l.id_locacaoorigem = d.id_apartamentostate
    WHERE d.n < 50
  )
  SELECT a.numero FROM d
  JOIN apartamentostate s ON s.id = d.id_apartamentostate
  JOIN apartamento a ON a.id = s.id_apartamento
  ORDER BY d.n DESC LIMIT 1`;

// No máximo 1 state aberto por suíte (uq_apartamentostate); é locação se houver
// locacaoapartamento com o mesmo id ainda sem fim.
export const SQL_ATIVA = `
  SELECT la.id_apartamentostate::text AS ref,
         to_char(la.datainicialdaocupacao, ${LOCAL}) AS inicio
  FROM apartamentostate s
  JOIN locacaoapartamento la ON la.id_apartamentostate = s.id
  WHERE s.id_apartamento = $1 AND s.datafim IS NULL AND la.datafinaldaocupacao IS NULL
  LIMIT 1`;

// Última FINALIZADA da suíte (índice id_apartamento, id DESC); a janela é o $2.
export const SQL_ULTIMA_FINALIZADA = `
  SELECT la.id_apartamentostate::text AS ref,
         to_char(la.datainicialdaocupacao, ${LOCAL}) AS inicio,
         to_char(la.datafinaldaocupacao, ${LOCAL}) AS fim,
         la.datafinaldaocupacao >= $2::timestamp AS na_janela
  FROM apartamentostate s
  JOIN locacaoapartamento la ON la.id_apartamentostate = s.id
  WHERE s.id_apartamento = $1 AND la.fimocupacaotipo = 'FINALIZADA'
  ORDER BY s.id DESC LIMIT 1`;

// Sobe por id_locacaoorigem até a raiz (trava de profundidade contra ciclo).
// A reserva acompanha a locação mais nova da cadeia: procura em toda ela.
export const SQL_CADEIA = `
  WITH RECURSIVE c AS (
    SELECT id_apartamentostate, id_locacaoorigem, 0 AS n
    FROM locacaoapartamento WHERE id_apartamentostate = $1
    UNION ALL
    SELECT l.id_apartamentostate, l.id_locacaoorigem, c.n + 1
    FROM locacaoapartamento l JOIN c ON l.id_apartamentostate = c.id_locacaoorigem
    WHERE c.n < 50
  )
  SELECT (SELECT id_apartamentostate::text FROM c ORDER BY n DESC LIMIT 1) AS raiz,
         EXISTS (
           SELECT 1 FROM reserva r
           WHERE r.id_locacaoapartamento IN (SELECT id_apartamentostate FROM c) AND r.cancelada IS NULL
         ) AS tem_reserva`;

// CPFs da ESTADIA (cadeia a partir da raiz $1, que precisa ser raiz), só no
// banco: pessoas ligadas à cadeia (col_locacaoapartamento_cliente → pessoapapel
// → pessoa.identificador), CPF com dígitos verificadores válidos e SEM dígitos
// repetidos. "Genérico" = a mesma pessoa em estadias SIMULTÂNEAS de cadeias
// diferentes desde $2 (CPF da recepção): não vale. Entrada pelo índice de
// datainicialdaocupacao (não há índice em col_locacaoapartamento_cliente.id_cliente).
// 0 CPFs em mais de um cadastro (levantamento de 07/11/2026): pessoa = CPF.
const CPF_CTES = `
  cadeia AS (
    SELECT id_apartamentostate AS id, 0 AS n FROM locacaoapartamento
    WHERE id_apartamentostate = $1::int AND id_locacaoorigem IS NULL
    UNION ALL
    SELECT l.id_apartamentostate, c.n + 1 FROM locacaoapartamento l JOIN cadeia c ON l.id_locacaoorigem = c.id
    WHERE c.n < 50
  ), pessoas AS (
    SELECT DISTINCT pp.id_pessoa, regexp_replace(coalesce(pe.identificador, ''), '[^0-9]', '', 'g') AS cpf
    FROM cadeia c
    JOIN col_locacaoapartamento_cliente lc ON lc.id_locacaoapartamento = c.id
    JOIN pessoapapel pp ON pp.id = lc.id_cliente
    JOIN pessoa pe ON pe.id = pp.id_pessoa
  ), validos AS (
    SELECT p.id_pessoa, p.cpf FROM pessoas p
    WHERE p.cpf ~ '^[0-9]{11}$' AND p.cpf !~ '^([0-9])\\1{10}$'
      AND ((SELECT sum(substr(p.cpf, i, 1)::int * (11 - i)) FROM generate_series(1, 9) i) * 10 % 11) % 10
          = substr(p.cpf, 10, 1)::int
      AND ((SELECT sum(substr(p.cpf, i, 1)::int * (12 - i)) FROM generate_series(1, 10) i) * 10 % 11) % 10
          = substr(p.cpf, 11, 1)::int
  ), usos AS (
    SELECT pp.id_pessoa, la.id_apartamentostate AS loc, la.id_locacaoorigem AS origem,
           la.datainicialdaocupacao AS ini, coalesce(la.datafinaldaocupacao, 'infinity'::timestamp) AS fim
    FROM locacaoapartamento la
    JOIN col_locacaoapartamento_cliente lc ON lc.id_locacaoapartamento = la.id_apartamentostate
    JOIN pessoapapel pp ON pp.id = lc.id_cliente
    WHERE la.datainicialdaocupacao >= $2::timestamp AND coalesce(la.fimocupacaotipo, '') <> 'CANCELADA'
      AND pp.id_pessoa IN (SELECT id_pessoa FROM validos)
  ), sobe AS (
    SELECT id_pessoa, loc, loc AS atual, origem, ini, fim, 0 AS n FROM usos
    UNION ALL
    SELECT s.id_pessoa, s.loc, l.id_apartamentostate, l.id_locacaoorigem, s.ini, s.fim, s.n + 1
    FROM sobe s JOIN locacaoapartamento l ON l.id_apartamentostate = s.origem
    WHERE s.n < 50
  ), usos_raiz AS (
    SELECT DISTINCT ON (id_pessoa, loc) id_pessoa, atual AS raiz, ini, fim FROM sobe ORDER BY id_pessoa, loc, n DESC
  ), genericos AS (
    SELECT DISTINCT a.id_pessoa FROM usos_raiz a
    JOIN usos_raiz b ON b.id_pessoa = a.id_pessoa AND a.raiz < b.raiz AND a.ini < b.fim AND b.ini < a.fim
  ), aceitos AS (
    SELECT v.cpf FROM validos v WHERE v.id_pessoa NOT IN (SELECT id_pessoa FROM genericos)
  )`;

/** tem_cpf da estadia (Endpoint A). $1 = raiz, $2 = início da busca de genéricos. */
export const SQL_TEM_CPF = `WITH RECURSIVE ${CPF_CTES}
  SELECT EXISTS (SELECT 1 FROM aceitos) AS tem_cpf`;

/** Endpoint D: confere os 3 primeiros dígitos ($3) SÓ no banco; devolve booleanos. */
export const SQL_CONFIRMAR_CPF = `WITH RECURSIVE ${CPF_CTES}
  SELECT EXISTS (SELECT 1 FROM aceitos) AS tem_cpf,
         EXISTS (SELECT 1 FROM aceitos WHERE left(cpf, 3) = $3::text) AS confere`;

// Endpoint E: suítes ATIVAS das categorias de suíte da unidade, com a categoria.
export const SQL_SUITES = `
  SELECT a.numero AS suite, ca.id AS categoria_id,
         coalesce(nullif(trim(ca.nomeexibicao), ''), ca.descricao) AS categoria_nome,
         nullif(trim(ca.sigla), '') AS categoria_sigla
  FROM apartamento a
  JOIN categoriaapartamento ca ON ca.id = a.id_categoriaapartamento
  WHERE a.dataexclusao IS NULL AND a.id_categoriaapartamento = ANY($1::int[])
  ORDER BY a.numero`;

// Endpoint F: nomes das pessoas da ESTADIA (cadeia a partir da raiz $1, que
// precisa ser raiz). Liberado se a cadeia ainda está aberta ou terminou a partir
// de $2 (180 dias); fora disso, o nome nem é lido. Papel: com reserva na
// cadeia, o cliente da reserva é 'reserva' e os demais 'acompanhante'; sem
// reserva (balcão), todos 'hospede' (a coluna ordem NÃO indica o titular).
export const SQL_HOSPEDE = `
  WITH RECURSIVE cadeia AS (
    SELECT id_apartamentostate AS id, 0 AS n FROM locacaoapartamento
    WHERE id_apartamentostate = $1::int AND id_locacaoorigem IS NULL
    UNION ALL
    SELECT l.id_apartamentostate, c.n + 1 FROM locacaoapartamento l JOIN cadeia c ON l.id_locacaoorigem = c.id
    WHERE c.n < 50
  ), situacao AS (
    SELECT count(*) > 0 AS existe,
           coalesce(bool_or(l.datafinaldaocupacao IS NULL) OR max(l.datafinaldaocupacao) >= $2::timestamp, false)
             AS liberada
    FROM cadeia c JOIN locacaoapartamento l ON l.id_apartamentostate = c.id
  ), res AS (
    SELECT DISTINCT pp.id_pessoa FROM cadeia c
    JOIN reserva r ON r.id_locacaoapartamento = c.id AND r.cancelada IS NULL
    JOIN pessoapapel pp ON pp.id = r.id_cliente
  ), todas AS (
    SELECT id_pessoa, min(ordem) AS ordem FROM (
      SELECT pp.id_pessoa, lc.ordem FROM cadeia c
      JOIN col_locacaoapartamento_cliente lc ON lc.id_locacaoapartamento = c.id
      JOIN pessoapapel pp ON pp.id = lc.id_cliente
      UNION ALL
      SELECT id_pessoa, -1 FROM res
    ) z GROUP BY id_pessoa
  )
  SELECT s.existe, s.liberada, x.nome, x.papel
  FROM situacao s
  LEFT JOIN LATERAL (
    SELECT trim(pe.nome) AS nome,
           CASE WHEN NOT EXISTS (SELECT 1 FROM res) THEN 'hospede'
                WHEN t.id_pessoa IN (SELECT id_pessoa FROM res) THEN 'reserva'
                ELSE 'acompanhante' END AS papel,
           t.ordem
    FROM todas t JOIN pessoa pe ON pe.id = t.id_pessoa
    WHERE s.liberada AND coalesce(trim(pe.nome), '') <> ''
  ) x ON true
  ORDER BY (x.papel = 'reserva') DESC, x.ordem`;

// Endpoint B. Página por (fim, ref) > ($1, $2) — com $2 = -1 vale fim >= $1.
// Só FINALIZADA (a TRANSFERIDA não tem check-out) e só suítes da unidade.
// A reserva é a da cadeia, de preferência a ligada à locação final. O telefone
// NÃO sai do banco: tem_contato é calculado aqui, com o padrão $5.
export const SQL_CHECKOUTS = `
  WITH RECURSIVE pagina AS (
    SELECT la.id_apartamentostate AS ref, la.datainicialdaocupacao AS inicio,
           la.datafinaldaocupacao AS fim, a.numero AS suite
    FROM locacaoapartamento la
    JOIN apartamentostate s ON s.id = la.id_apartamentostate
    JOIN apartamento a ON a.id = s.id_apartamento
    WHERE la.fimocupacaotipo = 'FINALIZADA'
      AND a.id_categoriaapartamento = ANY($4::int[])
      AND la.datafinaldaocupacao >= $1::timestamp
      AND (la.datafinaldaocupacao > $1::timestamp OR la.id_apartamentostate > $2::int)
    ORDER BY la.datafinaldaocupacao, la.id_apartamentostate
    LIMIT $3
  ), cadeia AS (
    SELECT p.ref AS final, l.id_apartamentostate AS id, l.id_locacaoorigem AS origem, 0 AS n
    FROM pagina p JOIN locacaoapartamento l ON l.id_apartamentostate = p.ref
    UNION ALL
    SELECT c.final, l.id_apartamentostate, l.id_locacaoorigem, c.n + 1
    FROM cadeia c JOIN locacaoapartamento l ON l.id_apartamentostate = c.origem
    WHERE c.n < 50
  )
  SELECT p.ref::text AS ref, p.suite,
         to_char(p.inicio, ${LOCAL}) AS inicio,
         to_char(p.fim, ${LOCAL}) AS fim,
         (SELECT c.id::text FROM cadeia c WHERE c.final = p.ref ORDER BY c.n DESC LIMIT 1) AS raiz,
         r.tipo_origem,
         CASE r.tipo_origem
           WHEN 'RESERVA_API' THEN r.id_reservaexterna
           WHEN 'GUIA_DE_MOTEIS' THEN r.id_reservaguiamoteis::text
         END AS reserva_canal_ref,
         (${DIGITOS('pe.celular')} ~ $5 OR ${DIGITOS('pe.telefone1')} ~ $5 OR ${DIGITOS('pe.telefone2')} ~ $5)
           AS tem_contato
  FROM pagina p
  LEFT JOIN LATERAL (
    SELECT t.tipo_origem, r.id_reservaexterna, r.id_reservaguiamoteis, r.id_cliente
    FROM reserva r LEFT JOIN tipo_origem_reserva t ON t.id = r.id_tipoorigemreserva
    WHERE r.id_locacaoapartamento IN (SELECT c.id FROM cadeia c WHERE c.final = p.ref)
      AND r.cancelada IS NULL
    ORDER BY (r.id_locacaoapartamento = p.ref) DESC, r.id DESC
    LIMIT 1
  ) r ON true
  LEFT JOIN pessoapapel pp ON pp.id = r.id_cliente
  LEFT JOIN pessoa pe ON pe.id = pp.id_pessoa
  ORDER BY p.fim, p.ref`;

// Endpoint C. Locação FINALIZADA de uma suíte da unidade, com check-out a
// partir de $3. Fora disso o telefone nem é lido (CASE). Caminho do telefone:
// reserva.id_cliente → pessoapapel.id → pessoapapel.id_pessoa → pessoa.
export const SQL_CONTATO = `
  WITH RECURSIVE c AS (
    SELECT id_apartamentostate AS id, id_locacaoorigem AS origem, 0 AS n
    FROM locacaoapartamento WHERE id_apartamentostate = $1::int
    UNION ALL
    SELECT l.id_apartamentostate, l.id_locacaoorigem, c.n + 1
    FROM locacaoapartamento l JOIN c ON l.id_apartamentostate = c.origem
    WHERE c.n < 50
  ), alvo AS (
    SELECT la.id_apartamentostate AS ref,
           la.fimocupacaotipo = 'FINALIZADA' AS finalizada,
           la.fimocupacaotipo = 'FINALIZADA' AND la.datafinaldaocupacao >= $3::timestamp AS liberada
    FROM locacaoapartamento la
    JOIN apartamentostate s ON s.id = la.id_apartamentostate
    JOIN apartamento a ON a.id = s.id_apartamento
    WHERE la.id_apartamentostate = $1::int AND a.id_categoriaapartamento = ANY($2::int[])
  )
  SELECT alvo.finalizada, alvo.liberada, r.tipo_origem,
         CASE WHEN alvo.liberada THEN pe.celular END AS celular,
         CASE WHEN alvo.liberada THEN pe.telefone1 END AS telefone1,
         CASE WHEN alvo.liberada THEN pe.telefone2 END AS telefone2
  FROM alvo
  LEFT JOIN LATERAL (
    SELECT t.tipo_origem, r.id_cliente
    FROM reserva r LEFT JOIN tipo_origem_reserva t ON t.id = r.id_tipoorigemreserva
    WHERE r.id_locacaoapartamento IN (SELECT id FROM c) AND r.cancelada IS NULL
    ORDER BY (r.id_locacaoapartamento = alvo.ref) DESC, r.id DESC
    LIMIT 1
  ) r ON true
  LEFT JOIN pessoapapel pp ON pp.id = r.id_cliente
  LEFT JOIN pessoa pe ON pe.id = pp.id_pessoa`;

@Injectable()
export class NpsService {
  private suitesCache = new Map<string, { ate: number; resposta: RespostaSuites }>();
  /** Relógio do cache (substituível nos testes). */
  agora = () => Date.now();

  constructor(
    private readonly pool: TenantPoolService,
    private readonly tentativas: NpsTentativasService,
  ) {}

  /** null = a suíte (ou a cadeia da raiz) não existe nesta unidade. */
  async estadia(c: ConsultaEstadia): Promise<RespostaEstadia | null> {
    const slug = c.tenant.slug;
    let numero = c.suite;
    if (c.raiz !== null) {
      const [atual] = await this.pool.queryWithParams<{ numero: number }>(slug, SQL_SUITE_ATUAL_DA_CADEIA, [
        c.raiz,
      ]);
      if (!atual) return null;
      numero = Number(atual.numero);
    }
    const [suite] = await this.pool.queryWithParams<{ id: number }>(slug, SQL_SUITE, [
      numero,
      c.tenant.suiteCategoryIds,
    ]);
    if (!suite || numero === null) return null;

    const base = { unidade: slug, suite: numero };
    const [ativa] = await this.pool.queryWithParams<{ ref: string; inicio: string }>(slug, SQL_ATIVA, [
      suite.id,
    ]);
    let estado: EstadoEstadia;
    let loc: { ref: string; inicio: string; fim: string | null };
    if (ativa) {
      estado = 'ativa';
      loc = { ...ativa, fim: null };
    } else {
      const [ultima] = await this.pool.queryWithParams<{
        ref: string;
        inicio: string;
        fim: string;
        na_janela: boolean;
      }>(slug, SQL_ULTIMA_FINALIZADA, [suite.id, c.limiteLocal]);
      if (!ultima?.na_janela) {
        return {
          ...base,
          estado: 'nenhuma',
          locacao_raiz_ref: null,
          locacao_ref: null,
          inicio: null,
          fim: null,
          tem_reserva: false,
          tem_cpf: false,
        };
      }
      estado = 'finalizada_recente';
      loc = ultima;
    }

    const [cadeia] = await this.pool.queryWithParams<{ raiz: string | null; tem_reserva: boolean }>(
      slug,
      SQL_CADEIA,
      [loc.ref],
    );
    const raiz = cadeia?.raiz ?? loc.ref;
    const [cpf] = await this.pool.queryWithParams<{ tem_cpf: boolean }>(slug, SQL_TEM_CPF, [
      raiz,
      c.limiteGenericoLocal,
    ]);
    return {
      ...base,
      estado,
      locacao_raiz_ref: raiz,
      locacao_ref: loc.ref,
      inicio: deLocalAutomo(loc.inicio),
      fim: deLocalAutomo(loc.fim),
      tem_reserva: !!cadeia?.tem_reserva,
      tem_cpf: !!cpf?.tem_cpf,
    };
  }

  /**
   * Endpoint D. Ordem: bloqueio da raiz → estadia ainda vale (regra do A, pela
   * suíte ATUAL da cadeia, com a MESMA raiz) → conferência no banco. Só conta
   * tentativa quando há CPF para conferir e o prefixo não bate.
   */
  async confirmarCpf(c: ConsultaConfirmarCpf): Promise<ResultadoConfirmarCpf> {
    const chave = `${c.estadia.tenant.slug}:${c.estadia.raiz}`;
    const antes: SituacaoTentativas = await this.tentativas.situacao(chave);
    if (antes.bloqueado) return { ok: false, bloqueado: true, retry_after: antes.retryAfter };

    const e = await this.estadia(c.estadia);
    if (!e || e.estado === 'nenhuma' || e.locacao_raiz_ref !== c.estadia.raiz) {
      return { ok: false, sem_estadia: true };
    }

    const [r] = await this.pool.queryWithParams<{ tem_cpf: boolean; confere: boolean }>(
      c.estadia.tenant.slug,
      SQL_CONFIRMAR_CPF,
      [c.estadia.raiz, c.estadia.limiteGenericoLocal, c.prefixo],
    );
    if (!r?.tem_cpf) return { ok: false, sem_cpf: true };
    if (r.confere) {
      await this.tentativas.limpar(chave);
      return { ok: true };
    }
    const depois = await this.tentativas.registrarErro(chave);
    return depois.bloqueado
      ? { ok: false, bloqueado: true, retry_after: depois.retryAfter }
      : { ok: false, tentativas_restantes: depois.restantes };
  }

  /** Endpoint E. Cache de 1h por unidade (as suítes quase nunca mudam). */
  async suites(tenant: TenantConfig): Promise<RespostaSuites & { cache: boolean }> {
    const guardado = this.suitesCache.get(tenant.slug);
    if (guardado && guardado.ate > this.agora()) return { ...guardado.resposta, cache: true };
    const linhas = await this.pool.queryWithParams<{
      suite: number;
      categoria_id: number;
      categoria_nome: string;
      categoria_sigla: string | null;
    }>(tenant.slug, SQL_SUITES, [tenant.suiteCategoryIds]);
    const resposta: RespostaSuites = {
      unidade: tenant.slug,
      suites: linhas.map((l) => ({
        suite: Number(l.suite),
        categoria_id: Number(l.categoria_id),
        categoria_nome: l.categoria_nome,
        categoria_sigla: l.categoria_sigla ?? null,
      })),
    };
    this.suitesCache.set(tenant.slug, { ate: this.agora() + SUITES_CACHE_MS, resposta });
    return { ...resposta, cache: false };
  }

  /** Endpoint F. Só nomes e papel; nada mais da pessoa sai do banco. */
  async hospede(c: ConsultaHospede): Promise<ResultadoHospede> {
    const linhas = await this.pool.queryWithParams<{
      existe: boolean;
      liberada: boolean;
      nome: string | null;
      papel: PapelHospede | null;
    }>(c.tenant.slug, SQL_HOSPEDE, [c.raiz, c.limiteLocal]);
    const s = linhas[0];
    if (!s?.existe) return { ok: false, motivo: 'nao_encontrada' };
    if (!s.liberada) return { ok: false, motivo: 'fora_da_janela' };
    return {
      ok: true,
      pessoas: linhas.filter((l) => l.nome && l.papel).map((l) => ({ nome: l.nome!, papel: l.papel! })),
    };
  }

  async checkouts(c: ConsultaCheckouts): Promise<RespostaCheckouts> {
    const slug = c.tenant.slug;
    const linhas = await this.pool.queryWithParams<{
      ref: string;
      suite: number;
      inicio: string;
      fim: string;
      raiz: string | null;
      tipo_origem: string | null;
      reserva_canal_ref: string | null;
      tem_contato: boolean | null;
    }>(slug, SQL_CHECKOUTS, [
      c.desdeLocal,
      c.aposRef ?? -1,
      c.limite,
      c.tenant.suiteCategoryIds,
      CELULAR_BR_DIGITOS,
    ]);
    const itens: CheckoutNps[] = linhas.map((l) => ({
      locacao_raiz_ref: l.raiz ?? l.ref,
      locacao_ref: l.ref,
      unidade: slug,
      suite: Number(l.suite),
      inicio: deLocalAutomo(l.inicio, true),
      fim: deLocalAutomo(l.fim, true),
      fim_tipo: 'FINALIZADA',
      origem_reserva: l.tipo_origem ?? 'BALCAO',
      reserva_canal_ref: l.reserva_canal_ref ?? null,
      tem_contato: l.tem_contato === true,
    }));
    const ultimo = itens[itens.length - 1];
    return {
      unidade: slug,
      itens,
      proximo:
        itens.length === c.limite && ultimo?.fim ? { desde: ultimo.fim, apos_ref: ultimo.locacao_ref } : null,
    };
  }

  async contato(c: ConsultaContato): Promise<ResultadoContato> {
    const [l] = await this.pool.queryWithParams<{
      finalizada: boolean;
      liberada: boolean;
      tipo_origem: string | null;
      celular: string | null;
      telefone1: string | null;
      telefone2: string | null;
    }>(c.tenant.slug, SQL_CONTATO, [c.locacao, c.tenant.suiteCategoryIds, c.limiteLocal]);
    if (!l || !l.finalizada) return { ok: false, motivo: 'nao_encontrada' };
    if (!l.liberada) return { ok: false, motivo: 'fora_da_janela' };
    // Mesma ordem do tem_contato do B: celular, telefone1, telefone2.
    const celular = celularE164(l.celular) ?? celularE164(l.telefone1) ?? celularE164(l.telefone2);
    if (!celular || !l.tipo_origem) return { ok: false, motivo: 'sem_contato' };
    return { ok: true, celular, origem_reserva: l.tipo_origem };
  }
}

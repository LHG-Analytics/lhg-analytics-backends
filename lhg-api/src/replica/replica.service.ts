/**
 * Vigia das réplicas do Automo: a cada 10 min mede o atraso de replicação de
 * cada unidade (no próprio banco) e:
 *  - guarda o status, que as telas leem em GET /api/replicas ("dados até…");
 *  - avisa por e-mail (Resend): um aviso de atraso por unidade por DIA e um
 *    de "voltou ao normal". O estado dos avisos fica no Redis do cache, então
 *    um deploy/reinício não repete o aviso do dia.
 *
 * Ambiente:
 *   REPLICA_ATRASO_MAX_MIN   atraso que conta como problema (padrão 120)
 *   ALERTA_REPLICA_PARA      destinatário (padrão danilo@lhgmoteis.com.br; vazio = sem e-mail)
 *   RESEND_API_KEY           a mesma chave do authentication (sem ela, sem e-mail)
 *   ALERTA_REPLICA_DESLIGADO true = não verifica nem avisa
 */
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { TenantPoolService } from '../database/tenant-pool.service';
import { allTenants } from '../tenant/tenant.registry';
import {
  ATRASO_MAX_MIN_PADRAO,
  EstadoAlerta,
  StatusReplica,
  avaliar,
  decidir,
  montarEmail,
} from './replica.regras';

export const REPLICA_INTERVALO_MS = 10 * 60_000;
/** Primeira verificação depois do boot (deixa o warmup começar). */
export const REPLICA_PRIMEIRA_MS = 60_000;
export const RESEND_URL = 'https://api.resend.com/emails';
export const REMETENTE_ALERTA = 'LHG Analytics <nao-responda@lhgmoteis.com.br>';
const ESTADO_TTL_S = 30 * 24 * 3600;

export const SQL_REPLICA = `
  SELECT pg_is_in_recovery() AS replica,
         to_char(pg_last_xact_replay_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ultimo,
         EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp()) AS atraso_s`;

@Injectable()
export class ReplicaService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ReplicaService.name);
  private status = new Map<string, StatusReplica>();
  private timers: NodeJS.Timeout[] = [];
  private rodando = false;
  readonly atrasoMaxMin = Number(process.env.REPLICA_ATRASO_MAX_MIN) > 0 ? Number(process.env.REPLICA_ATRASO_MAX_MIN) : ATRASO_MAX_MIN_PADRAO;
  readonly para = process.env.ALERTA_REPLICA_PARA ?? 'danilo@lhgmoteis.com.br';
  /** fetch do Resend (os testes trocam). */
  enviarHttp: typeof fetch = fetch;
  agora: () => Date = () => new Date();

  constructor(
    private readonly pools: TenantPoolService,
    private readonly cache: KpiCacheService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.ALERTA_REPLICA_DESLIGADO === 'true') {
      this.logger.log('réplicas: vigia DESLIGADA (ALERTA_REPLICA_DESLIGADO)');
      return;
    }
    const email = process.env.RESEND_API_KEY?.trim() && this.para.trim() ? 'com e-mail' : 'sem e-mail';
    this.logger.log(`réplicas: vigia ATIVA (atraso > ${this.atrasoMaxMin} min, ${email})`);
    const t1 = setTimeout(() => void this.verificar(), REPLICA_PRIMEIRA_MS);
    const t2 = setInterval(() => void this.verificar(), REPLICA_INTERVALO_MS);
    t1.unref();
    t2.unref();
    this.timers.push(t1, t2);
  }

  onModuleDestroy() {
    for (const t of this.timers) clearTimeout(t);
  }

  /** Último status conhecido de cada unidade (vazio antes da 1ª verificação). */
  listar(): StatusReplica[] {
    return allTenants()
      .map((t) => this.status.get(t.slug))
      .filter((s): s is StatusReplica => !!s);
  }

  /** Mede todas as unidades em paralelo e dispara os avisos. */
  async verificar(): Promise<StatusReplica[]> {
    if (this.rodando) return this.listar();
    this.rodando = true;
    try {
      const resultados = await Promise.all(
        allTenants().map(async (t) => {
          let linha: { replica: boolean; ultimo: string | null; atraso_s: number | null } | null = null;
          try {
            [linha] = await this.pools.query(t.slug, SQL_REPLICA);
          } catch {
            linha = null; // não conectou (ou env ausente): conta como fora
          }
          const s = avaliar(t, linha, this.atrasoMaxMin, this.agora());
          this.status.set(t.slug, s);
          return s;
        }),
      );
      const atrasadas = resultados.filter((s) => s.atrasada).map((s) => s.unidade);
      if (atrasadas.length) this.logger.warn(`réplicas atrasadas/fora: ${atrasadas.join(', ')}`);
      for (const s of resultados) await this.avisar(s);
      return resultados;
    } finally {
      this.rodando = false;
    }
  }

  private async avisar(s: StatusReplica) {
    const chave = `alerta-replica:${s.unidade}`;
    const anterior = await this.cache.lerEstado<EstadoAlerta>(chave);
    const hoje = moment(this.agora()).tz('America/Sao_Paulo').format('YYYY-MM-DD');
    const { aviso, novo } = decidir(anterior, s, hoje);
    if (aviso) {
      const ok = await this.enviar(montarEmail(aviso, s, this.cache.ambiente));
      // Sem envio, o estado não muda: tenta de novo no próximo ciclo.
      if (!ok) return;
      this.logger.log(`réplicas: aviso '${aviso}' enviado (${s.unidade})`);
    }
    if (!anterior || anterior.estado !== novo.estado || anterior.avisadoEm !== novo.avisadoEm) {
      await this.cache.gravarEstado(chave, novo, ESTADO_TTL_S);
    }
  }

  private async enviar(m: { assunto: string; texto: string; html: string }): Promise<boolean> {
    const chave = process.env.RESEND_API_KEY?.trim();
    const para = this.para.trim();
    if (!chave || !para) return false;
    try {
      const r = await this.enviarHttp(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: REMETENTE_ALERTA, to: [para], subject: m.assunto, text: m.texto, html: m.html }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) this.logger.warn(`réplicas: e-mail recusado pelo Resend (${r.status})`);
      return r.ok;
    } catch (e) {
      this.logger.warn(`réplicas: falha no envio do e-mail (${(e as Error)?.name ?? 'erro'})`);
      return false;
    }
  }
}

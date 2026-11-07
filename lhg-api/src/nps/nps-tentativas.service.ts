/**
 * Tentativas erradas do Endpoint D (confirmar CPF), por estadia (unidade + raiz):
 * NPS_CPF_MAX_ERROS erros dentro da janela bloqueiam aquela raiz por
 * NPS_CPF_BLOQUEIO_S. Com REDIS_URL, contador atômico no Redis (sobrevive a
 * deploys, mesmo namespace de ambiente do cache); sem ele, ou se o Redis cair,
 * Map em memória. Nunca guarda o prefixo nem o CPF: só a contagem.
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { resolveNamespace } from '../cache/kpi-cache.service';

export const NPS_CPF_MAX_ERROS = 3;
/** 4h: cobre a estadia típica + a janela do QR; quem errou 3 vezes vai ao C4. */
export const NPS_CPF_BLOQUEIO_S = 4 * 3600;

export interface SituacaoTentativas {
  bloqueado: boolean;
  /** Segundos até liberar (só quando bloqueado). */
  retryAfter: number;
  /** Erros que ainda cabem antes do bloqueio. */
  restantes: number;
}

@Injectable()
export class NpsTentativasService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('NpsTentativas');
  private readonly ns = resolveNamespace();
  private mem = new Map<string, { erros: number; ate: number; bloqueadoAte: number }>();
  private client: Redis | null = null;
  private redisReady = false;
  private avisado = false;
  /** Relógio (substituível nos testes). */
  agora = () => Date.now();

  onModuleInit(): void {
    const url = (process.env.REDIS_URL || '').trim();
    if (!url) return;
    try {
      this.client = new Redis(url, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 2,
        connectTimeout: 8000,
        retryStrategy: (times) => (times > 15 ? null : Math.min(times * 300, 3000)),
      });
      this.client.on('ready', () => (this.redisReady = true));
      this.client.on('end', () => (this.redisReady = false));
      this.client.on('error', (err) => this.falhou('conexão', err));
    } catch (err) {
      this.falhou('início', err);
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  private falhou(op: string, err: unknown) {
    this.redisReady = false;
    if (!this.avisado) {
      this.avisado = true;
      this.logger.warn(`Redis falhou em ${op} (${(err as Error)?.message ?? err}) — tentativas em memória.`);
    }
  }

  private usaRedis() {
    return !!this.client && this.redisReady;
  }

  private k(tipo: 'erros' | 'bloq', chave: string) {
    return `${this.ns}:nps:cpf:${tipo}:${chave}`;
  }

  /** Situação atual, sem registrar nada. */
  async situacao(chave: string): Promise<SituacaoTentativas> {
    if (this.usaRedis()) {
      try {
        const [ttl, erros] = await Promise.all([
          this.client!.ttl(this.k('bloq', chave)),
          this.client!.get(this.k('erros', chave)),
        ]);
        if (ttl > 0) return { bloqueado: true, retryAfter: ttl, restantes: 0 };
        return { bloqueado: false, retryAfter: 0, restantes: Math.max(0, NPS_CPF_MAX_ERROS - Number(erros ?? 0)) };
      } catch (err) {
        this.falhou('leitura', err);
      }
    }
    const m = this.memoria(chave);
    if (m.bloqueadoAte > this.agora()) {
      return { bloqueado: true, retryAfter: Math.ceil((m.bloqueadoAte - this.agora()) / 1000), restantes: 0 };
    }
    return { bloqueado: false, retryAfter: 0, restantes: Math.max(0, NPS_CPF_MAX_ERROS - m.erros) };
  }

  /** Registra um erro; no NPS_CPF_MAX_ERROS-ésimo, bloqueia a raiz. */
  async registrarErro(chave: string): Promise<SituacaoTentativas> {
    if (this.usaRedis()) {
      try {
        const erros = await this.client!.incr(this.k('erros', chave));
        if (erros === 1) await this.client!.expire(this.k('erros', chave), NPS_CPF_BLOQUEIO_S);
        if (erros >= NPS_CPF_MAX_ERROS) {
          await this.client!.set(this.k('bloq', chave), '1', 'EX', NPS_CPF_BLOQUEIO_S);
          await this.client!.del(this.k('erros', chave));
          return { bloqueado: true, retryAfter: NPS_CPF_BLOQUEIO_S, restantes: 0 };
        }
        return { bloqueado: false, retryAfter: 0, restantes: NPS_CPF_MAX_ERROS - erros };
      } catch (err) {
        this.falhou('escrita', err);
      }
    }
    const m = this.memoria(chave);
    m.erros++;
    if (m.erros >= NPS_CPF_MAX_ERROS) {
      m.erros = 0;
      m.bloqueadoAte = this.agora() + NPS_CPF_BLOQUEIO_S * 1000;
      return { bloqueado: true, retryAfter: NPS_CPF_BLOQUEIO_S, restantes: 0 };
    }
    return { bloqueado: false, retryAfter: 0, restantes: NPS_CPF_MAX_ERROS - m.erros };
  }

  /** Acerto: zera os erros da raiz (o bloqueio, se houver, não chega aqui). */
  async limpar(chave: string): Promise<void> {
    if (this.usaRedis()) {
      try {
        await this.client!.del(this.k('erros', chave));
        return;
      } catch (err) {
        this.falhou('limpeza', err);
      }
    }
    this.mem.delete(chave);
  }

  private memoria(chave: string) {
    const agora = this.agora();
    let m = this.mem.get(chave);
    // Erros valem por NPS_CPF_BLOQUEIO_S a partir do 1º; bloqueio vencido zera tudo.
    if (m && m.ate <= agora && m.bloqueadoAte <= agora) m = undefined;
    if (!m) {
      if (this.mem.size > 10_000) this.mem.clear(); // trava de memória
      m = { erros: 0, ate: agora + NPS_CPF_BLOQUEIO_S * 1000, bloqueadoAte: 0 };
      this.mem.set(chave, m);
    }
    return m;
  }
}

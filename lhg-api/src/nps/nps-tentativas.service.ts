/**
 * Tentativas erradas do Endpoint D (confirmar CPF), por estadia (unidade + raiz):
 * NPS_CPF_MAX_ERROS erros dentro da janela bloqueiam aquela raiz por
 * NPS_CPF_BLOQUEIO_S (env; padrão 15 erros / 4h). Com REDIS_URL, contador
 * atômico no Redis (sobrevive a deploys, mesmo namespace de ambiente do cache);
 * sem ele, ou se o Redis cair, Map em memória. Nunca guarda o prefixo nem o
 * CPF: só a contagem. Também guarda a cota por minuto do Endpoint G (por unidade).
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { resolveNamespace } from '../cache/kpi-cache.service';

export const NPS_CPF_MAX_ERROS_PADRAO = 15;
/** 4h: cobre a estadia típica + a janela do QR; quem esgotou os erros vai ao C4. */
export const NPS_CPF_BLOQUEIO_S_PADRAO = 4 * 3600;

export interface LimitesCpf {
  maxErros: number;
  bloqueioS: number;
}

/** Inteiro da env dentro da faixa; vazio, lixo ou fora da faixa → padrão. */
function inteiroEnv(v: string | undefined, padrao: number, min: number, max: number): number {
  const t = (v ?? '').trim();
  if (!/^\d{1,9}$/.test(t)) return padrao;
  const n = Number(t);
  return n >= min && n <= max ? n : padrao;
}

/** NPS_CPF_MAX_ERROS (1 a 1000) e NPS_CPF_BLOQUEIO_S (60 s a 7 dias). */
export function lerLimitesCpf(env: NodeJS.ProcessEnv = process.env): LimitesCpf {
  return {
    maxErros: inteiroEnv(env.NPS_CPF_MAX_ERROS, NPS_CPF_MAX_ERROS_PADRAO, 1, 1000),
    bloqueioS: inteiroEnv(env.NPS_CPF_BLOQUEIO_S, NPS_CPF_BLOQUEIO_S_PADRAO, 60, 7 * 86400),
  };
}

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
  /** Lidos da env na criação do serviço. */
  readonly limites = lerLimitesCpf();
  private mem = new Map<string, { erros: number; ate: number; bloqueadoAte: number }>();
  private cotas = new Map<string, { usos: number; ate: number }>();
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
    const { maxErros } = this.limites;
    if (this.usaRedis()) {
      try {
        const [ttl, erros] = await Promise.all([
          this.client!.ttl(this.k('bloq', chave)),
          this.client!.get(this.k('erros', chave)),
        ]);
        if (ttl > 0) return { bloqueado: true, retryAfter: ttl, restantes: 0 };
        return { bloqueado: false, retryAfter: 0, restantes: Math.max(0, maxErros - Number(erros ?? 0)) };
      } catch (err) {
        this.falhou('leitura', err);
      }
    }
    const m = this.memoria(chave);
    if (m.bloqueadoAte > this.agora()) {
      return { bloqueado: true, retryAfter: Math.ceil((m.bloqueadoAte - this.agora()) / 1000), restantes: 0 };
    }
    return { bloqueado: false, retryAfter: 0, restantes: Math.max(0, maxErros - m.erros) };
  }

  /** Registra um erro; no NPS_CPF_MAX_ERROS-ésimo, bloqueia a raiz. */
  async registrarErro(chave: string): Promise<SituacaoTentativas> {
    const { maxErros, bloqueioS } = this.limites;
    if (this.usaRedis()) {
      try {
        const erros = await this.client!.incr(this.k('erros', chave));
        if (erros === 1) await this.client!.expire(this.k('erros', chave), bloqueioS);
        if (erros >= maxErros) {
          await this.client!.set(this.k('bloq', chave), '1', 'EX', bloqueioS);
          await this.client!.del(this.k('erros', chave));
          return { bloqueado: true, retryAfter: bloqueioS, restantes: 0 };
        }
        return { bloqueado: false, retryAfter: 0, restantes: maxErros - erros };
      } catch (err) {
        this.falhou('escrita', err);
      }
    }
    const m = this.memoria(chave);
    m.erros++;
    if (m.erros >= maxErros) {
      m.erros = 0;
      m.bloqueadoAte = this.agora() + bloqueioS * 1000;
      return { bloqueado: true, retryAfter: bloqueioS, restantes: 0 };
    }
    return { bloqueado: false, retryAfter: 0, restantes: maxErros - m.erros };
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

  /**
   * Cota em janela fixa (Endpoint G: N pedidos por minuto por unidade). Conta
   * este pedido; acima do limite → { permitido: false, retryAfter }.
   */
  async usarCota(chave: string, limite: number, janelaS: number): Promise<{ permitido: boolean; retryAfter: number }> {
    if (this.usaRedis()) {
      try {
        const k = `${this.ns}:nps:cota:${chave}`;
        const usos = await this.client!.incr(k);
        if (usos === 1) await this.client!.expire(k, janelaS);
        if (usos <= limite) return { permitido: true, retryAfter: 0 };
        const ttl = await this.client!.ttl(k);
        return { permitido: false, retryAfter: ttl > 0 ? ttl : janelaS };
      } catch (err) {
        this.falhou('cota', err);
      }
    }
    const agora = this.agora();
    let c = this.cotas.get(chave);
    if (!c || c.ate <= agora) {
      if (this.cotas.size > 10_000) this.cotas.clear(); // trava de memória
      c = { usos: 0, ate: agora + janelaS * 1000 };
      this.cotas.set(chave, c);
    }
    c.usos++;
    return c.usos <= limite
      ? { permitido: true, retryAfter: 0 }
      : { permitido: false, retryAfter: Math.ceil((c.ate - agora) / 1000) };
  }

  private memoria(chave: string) {
    const agora = this.agora();
    let m = this.mem.get(chave);
    // Erros valem por NPS_CPF_BLOQUEIO_S a partir do 1º; bloqueio vencido zera tudo.
    if (m && m.ate <= agora && m.bloqueadoAte <= agora) m = undefined;
    if (!m) {
      if (this.mem.size > 10_000) this.mem.clear(); // trava de memória
      m = { erros: 0, ate: agora + this.limites.bloqueioS * 1000, bloqueadoAte: 0 };
      this.mem.set(chave, m);
    }
    return m;
  }
}

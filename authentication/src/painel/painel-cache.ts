import { Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Onde o Painel TV guarda os MESES FECHADOS do histórico, para não perdê-los
 * a cada deploy/reinício (o cache em memória zera). Usa o MESMO Redis do
 * cache de KPIs do lhg-api (REDIS_URL) e o MESMO prefixo de ambiente
 * (CACHE_PREFIX → ex. "prod"/"dev"), então produção e homologação não se
 * misturam. Sem REDIS_URL, ou com o Redis fora, o painel segue só com a
 * memória: o Redis NUNCA derruba o painel nem atrasa a resposta.
 */
export interface ItemPainelGuardado<T> {
  /** Quando foi calculado (ms). */
  em: number;
  /** Último dia do período calculado (dd/mm/aaaa): só vale para o mesmo período. */
  fim: string;
  valor: T;
}

export interface PainelStore<T> {
  /** Lê várias chaves de uma vez; as ausentes (ou com erro) ficam de fora. */
  ler(chaves: string[]): Promise<Map<string, ItemPainelGuardado<T>>>;
  /** Grava uma chave com expiração (segundos). Erros são engolidos. */
  gravar(
    chave: string,
    item: ItemPainelGuardado<T>,
    ttlS: number,
  ): Promise<void>;
}

/** Sem persistência (sem REDIS_URL): só a memória do processo. */
export const storeSoMemoria = <T>(): PainelStore<T> => ({
  ler: async () => new Map(),
  gravar: async () => undefined,
});

/** Prefixo de ambiente: igual ao do KpiCacheService do lhg-api. */
export function namespaceDoCache(env: NodeJS.ProcessEnv = process.env): string {
  const explicito = (env.CACHE_PREFIX || '').trim();
  if (explicito) return explicito.replace(/[^a-zA-Z0-9_-]/g, '_');
  const render = (env.RENDER_EXTERNAL_URL || '').trim();
  if (render) {
    try {
      return new URL(render).hostname
        .split('.')[0]
        .replace(/[^a-zA-Z0-9_-]/g, '_');
    } catch {
      /* URL malformada: cai no padrão */
    }
  }
  return 'local';
}

/** Chave física no Redis de um mês de uma unidade. */
export const chaveRedisDoPainel = (ns: string, chave: string) =>
  `${ns}:painel:v1:${chave}`;

/** Store no Redis (ioredis), com as mesmas opções do lhg-api: falha rápido. */
export function storeRedis<T>(url: string, ns: string): PainelStore<T> {
  const logger = new Logger('PainelTV');
  let pronto = false;
  let avisou = false;
  const client = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 2,
    connectTimeout: 8000,
    retryStrategy: (n) => (n > 15 ? null : Math.min(n * 300, 3000)),
  });
  client.on('ready', () => {
    pronto = true;
    avisou = false;
    logger.log(`painel: histórico persistente no Redis (namespace "${ns}")`);
  });
  client.on('end', () => (pronto = false));
  client.on('error', (e) => {
    pronto = false;
    if (!avisou) {
      avisou = true;
      logger.warn(`painel: Redis indisponível (${e?.message}) — só memória`);
    }
  });
  return {
    async ler(chaves) {
      const out = new Map<string, ItemPainelGuardado<T>>();
      if (!pronto || !chaves.length) return out;
      try {
        const vals = await client.mget(
          ...chaves.map((c) => chaveRedisDoPainel(ns, c)),
        );
        vals.forEach((v, i) => {
          if (!v) return;
          try {
            out.set(chaves[i], JSON.parse(v));
          } catch {
            /* valor corrompido: ignora (será recalculado) */
          }
        });
      } catch {
        /* Redis falhou: segue só com a memória */
      }
      return out;
    },
    async gravar(chave, item, ttlS) {
      if (!pronto) return;
      try {
        await client.set(
          chaveRedisDoPainel(ns, chave),
          JSON.stringify(item),
          'EX',
          ttlS,
        );
      } catch {
        /* Redis falhou: segue só com a memória */
      }
    },
  };
}

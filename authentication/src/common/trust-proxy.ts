import { INestApplication } from '@nestjs/common';

/**
 * Número de proxies entre o cliente e este serviço, contados a partir do Nest.
 * No Render são 4:
 *   1. borda do Render (Cloudflare), que anexa o IP do cliente ao
 *      X-Forwarded-For;
 *   2. e 3. duas camadas internas do Render (balanceamento), cada uma
 *      anexando o endereço da anterior;
 *   4. o proxy local (server.mjs, com xfwd), que anexa o da última camada.
 * Com N = 4, o Express usa como req.ip o IP que a borda viu, e o
 * rate limit (Throttler) passa a separar os usuários pelo IP REAL.
 * Medido na homologação: com N = 3 o req.ip variava a cada pedido (endereço
 * de uma camada interna) e o limite nunca disparava; com N = 4 o 429 vem no
 * pedido 101 e um X-Forwarded-For forjado não escapa.
 *
 * Nunca usar `true`: o Express confiaria em todo o X-Forwarded-For e o cliente
 * poderia forjar o próprio IP. Também não usar um N MAIOR que o real, pelo
 * mesmo motivo.
 */
export const DEFAULT_TRUST_PROXY_HOPS = 4;

/** Lê TRUST_PROXY_HOPS (inteiro >= 0); valor inválido cai no padrão. */
export function resolveTrustProxyHops(
  value: string | undefined = process.env.TRUST_PROXY_HOPS,
): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_TRUST_PROXY_HOPS;
  }
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : DEFAULT_TRUST_PROXY_HOPS;
}

/** Aplica `trust proxy` = número de saltos (nunca `true`). */
export function applyTrustProxy(
  app: INestApplication,
  hops: number = resolveTrustProxyHops(),
): void {
  app.getHttpAdapter().getInstance().set('trust proxy', hops);
}

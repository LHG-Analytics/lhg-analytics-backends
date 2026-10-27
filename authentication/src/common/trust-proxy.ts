import { INestApplication } from '@nestjs/common';

/**
 * Número de proxies entre o cliente e este serviço, contados a partir do Nest.
 * No Render são 3:
 *   1. borda do Render (Cloudflare), que anexa o IP do cliente ao
 *      X-Forwarded-For;
 *   2. balanceador interno do Render, que anexa o endereço da borda;
 *   3. o proxy local (server.mjs, com xfwd), que anexa o do balanceador.
 * Com N = 3, o Express usa como req.ip o IP que a borda viu, e o
 * rate limit (Throttler) passa a separar os usuários pelo IP REAL.
 *
 * Nunca usar `true`: o Express confiaria em todo o X-Forwarded-For e o cliente
 * poderia forjar o próprio IP. Também não usar um N MAIOR que o real, pelo
 * mesmo motivo.
 */
export const DEFAULT_TRUST_PROXY_HOPS = 3;

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

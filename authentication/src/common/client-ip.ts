import * as crypto from 'crypto';
import { isIP } from 'net';

/** Cabeçalhos que o proxy do HUB (Vercel) põe ao repassar /auth/oidc/*. */
export const HUB_CLIENT_IP = 'x-hub-client-ip';
export const HUB_PROXY_KEY = 'x-hub-proxy-key';
/** Tamanho mínimo do HUB_PROXY_KEY (abaixo disso, o cabeçalho é ignorado). */
const MIN_CHAVE = 32;

type ReqComIp = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

/** HUB_PROXY_KEY válida (≥ 32 caracteres) ou null. */
export function chaveDoProxy(
  raw: string | undefined = process.env.HUB_PROXY_KEY,
): string | null {
  const v = raw?.trim();
  return v && v.length >= MIN_CHAVE ? v : null;
}

/** Comparação em tempo constante (inclusive quando o tamanho difere). */
function igual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * IP REAL do cliente (spec-1d seção 7). O x-hub-client-ip SÓ vale quando o
 * x-hub-proxy-key confere com o HUB_PROXY_KEY (comparação em tempo
 * constante) e o valor é um IP válido. Sem o segredo, com o segredo errado
 * ou com um IP inválido, vale o req.ip de hoje (trust proxy do serviço,
 * TRUST_PROXY_HOPS). Vale para rate limit, bloqueio por IP e auditoria.
 */
export function clientIp(
  req: ReqComIp,
  chave: string | null = chaveDoProxy(),
): string | undefined {
  if (chave) {
    const enviada = um(req.headers?.[HUB_PROXY_KEY]);
    const ip = um(req.headers?.[HUB_CLIENT_IP])?.trim();
    if (enviada && ip && isIP(ip) && igual(enviada, chave)) return ip;
  }
  return req.ip;
}

/** Linha de conferência para o boot: SEM valores. */
export function resumoDoProxy(chave = chaveDoProxy()): string {
  return chave
    ? 'hub_proxy_key=ok(presente) → x-hub-client-ip aceito só com a chave'
    : 'hub_proxy_key=FALTA/CURTA → x-hub-client-ip IGNORADO (vale o req.ip)';
}

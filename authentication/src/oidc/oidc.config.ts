/** Partes PRIVADAS de uma chave RSA em JWK (nunca podem sair no JWKS). */
export const PARTES_PRIVADAS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'];

export interface OidcSettings {
  enabled: boolean;
  /** Issuer FIXO (de OIDC_ISSUER); nunca deduzido do host da requisição. */
  issuer: string;
  /** Chaves PRIVADAS RS256, cada uma com kid. A 1ª assina; as outras só publicam. */
  jwks: { keys: Record<string, unknown>[] };
  /** Chaves dos cookies do provedor (a 1ª assina; as outras ainda validam). */
  cookieKeys: string[];
  /** Linha de conferência para o log do boot: SEM valores. */
  resumo: string;
}

/** OIDC_ISSUER: https, sem query, sem fragmento e sem barra no fim. */
function lerIssuer(raw: string | undefined): string | null {
  const valor = raw?.trim();
  if (!valor || valor.endsWith('/')) return null;
  try {
    const u = new URL(valor);
    if (u.protocol !== 'https:' || u.search || u.hash || u.username)
      return null;
    return valor; // usado exatamente como configurado
  } catch {
    return null;
  }
}

/**
 * OIDC_JWKS: {"keys":[...]} com chaves RSA PRIVADAS, cada uma com um kid
 * único (e alg RS256, se vier). Qualquer item fora disso invalida o conjunto
 * (melhor desligar o OIDC do que publicar/assinar com uma chave errada).
 */
function lerJwks(
  raw: string | undefined,
): { keys: Record<string, unknown>[] } | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const keys = Array.isArray(j?.keys) ? j.keys : null;
    if (!keys?.length) return null;
    const kids = new Set<string>();
    for (const k of keys) {
      if (k?.kty !== 'RSA' || typeof k.kid !== 'string' || !k.kid) return null;
      if (!k.n || !k.e || !k.d || !k.p || !k.q) return null; // tem de ser privada
      if (k.alg && k.alg !== 'RS256') return null;
      if (k.use && k.use !== 'sig') return null;
      if (kids.has(k.kid)) return null;
      kids.add(k.kid);
    }
    return {
      keys: keys.map((k: Record<string, unknown>) => ({
        ...k,
        alg: 'RS256',
        use: 'sig',
      })),
    };
  } catch {
    return null;
  }
}

/** OIDC_COOKIE_KEYS: JSON ["…","…"] ou lista por vírgula; cada uma ≥ 32 caracteres. */
function lerCookieKeys(raw: string | undefined): string[] | null {
  if (!raw) return null;
  let lista: unknown;
  try {
    lista = raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split(',');
  } catch {
    return null;
  }
  if (!Array.isArray(lista)) return null;
  const chaves = lista.map((k) => String(k).trim()).filter(Boolean);
  return chaves.length && chaves.every((k) => k.length >= 32) ? chaves : null;
}

/**
 * Lê e confere as variáveis do OIDC. Se algo estiver errado, SÓ o OIDC fica
 * desligado (o login atual do Analytics continua). O resumo nunca traz
 * valores: só o estado de cada item e as contagens.
 */
export function readOidcSettings(
  get: (name: string) => string | undefined,
): OidcSettings {
  const issuer = lerIssuer(get('OIDC_ISSUER'));
  const jwks = lerJwks(get('OIDC_JWKS'));
  const cookieKeys = lerCookieKeys(get('OIDC_COOKIE_KEYS'));
  const enabled = !!(issuer && jwks && cookieKeys);
  const resumo =
    `oidc: issuer=${issuer ? 'ok(https, fixo)' : 'FALTA/INVÁLIDO'}` +
    ` jwks=${jwks ? `ok(${jwks.keys.length} chave(s) RSA privada(s) com kid)` : 'FALTA/INVÁLIDO'}` +
    ` cookie_keys=${cookieKeys ? `ok(${cookieKeys.length})` : 'FALTA/INVÁLIDO'}` +
    ` → ${enabled ? 'ATIVO' : 'DESLIGADO (só o OIDC; o login atual continua)'}`;
  return {
    enabled,
    issuer: issuer ?? '',
    jwks: jwks ?? { keys: [] },
    cookieKeys: cookieKeys ?? [],
    resumo,
  };
}

/** Versão PÚBLICA de uma chave (para conferir o JWKS publicado). */
export function chavePublica(k: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(k).filter(([campo]) => !PARTES_PRIVADAS.includes(campo)),
  );
}

import * as crypto from 'crypto';

/** Cookie que guarda o estado do fluxo OAuth entre o "start" e o callback. */
export const OAUTH_COOKIE = 'g_oauth';
export const OAUTH_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  /** SHA-256 do token do convite, quando o fluxo veio do link do convite. */
  invite?: string;
  /** uid da interação do login central, quando o fluxo veio do OIDC. */
  uid?: string;
  exp: number;
}

const b64 = (buf: Buffer) => buf.toString('base64url');
export const randomToken = () => b64(crypto.randomBytes(32));

/** code_challenge do PKCE (S256) para o verifier dado. */
export const pkceChallenge = (verifier: string) =>
  b64(crypto.createHash('sha256').update(verifier).digest());

/** Chave própria do cookie, derivada do JWT_SECRET (não reusa a do JWT). */
function chave(secret: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', secret, 'lhg', 'google-oauth-state', 32),
  );
}

/** Serializa e ASSINA (HMAC-SHA256) o estado: o cliente não consegue forjá-lo. */
export function signState(s: OAuthState, secret: string): string {
  const corpo = b64(Buffer.from(JSON.stringify(s), 'utf8'));
  const mac = b64(
    crypto.createHmac('sha256', chave(secret)).update(corpo).digest(),
  );
  return `${corpo}.${mac}`;
}

/** Confere a assinatura e a validade; devolve null se não servir. */
export function verifyState(
  raw: string | undefined,
  secret: string,
  agora = Date.now(),
): OAuthState | null {
  if (!raw || !raw.includes('.')) return null;
  const [corpo, mac] = raw.split('.');
  const esperado = crypto
    .createHmac('sha256', chave(secret))
    .update(corpo)
    .digest();
  const recebido = Buffer.from(mac ?? '', 'base64url');
  if (
    recebido.length !== esperado.length ||
    !crypto.timingSafeEqual(recebido, esperado)
  ) {
    return null;
  }
  try {
    const s = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    return typeof s?.exp === 'number' && s.exp > agora
      ? (s as OAuthState)
      : null;
  } catch {
    return null;
  }
}

/** Comparação de strings em tempo constante. */
export function sameString(a: string | undefined, b: string | undefined) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

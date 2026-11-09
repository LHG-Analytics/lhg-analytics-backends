import * as crypto from 'crypto';
import {
  CompactEncrypt,
  JSONWebKeySet,
  JWTPayload,
  compactDecrypt,
  createLocalJWKSet,
  errors,
  jwtVerify,
} from 'jose';
import { HubClientSettings } from './hub-client.settings';

/** fetch injetável (os testes apontam o issuer para o app local). */
export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

export interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

/** Tolerância de relógio (s) nas validações de token. */
export const TOLERANCIA_S = 30;
/** Timeout das chamadas ao provedor. */
const TIMEOUT_MS = 10000;
/** A saída no servidor segura o clique em "Sair": tempo curto, depois a reserva. */
export const SAIR_TIMEOUT_MS = 3000;
/** Intervalo mínimo entre duas buscas do JWKS por "kid desconhecido". */
const JWKS_RETRY_MS = 30000;
export const EVENTO_BACKCHANNEL =
  'http://schemas.openid.net/event/backchannel-logout';

const b64u = (b: Buffer) => b.toString('base64url');
export const aleatorio = () => b64u(crypto.randomBytes(32));
export const desafioPkce = (verifier: string) =>
  b64u(crypto.createHash('sha256').update(verifier).digest());

/** Erro de validação de token (o motivo vai só para auditoria/log). */
export class TokenInvalido extends Error {}

/**
 * Cliente OIDC do HUB, com jose + fetch: discovery e JWKS em cache, troca do
 * code (client_secret_basic + PKCE) e validação explícita do id_token e do
 * logout token. Não registra nenhum token.
 */
export class HubOidc {
  private discovery: Promise<Discovery> | null = null;
  private jwks: {
    conj: ReturnType<typeof createLocalJWKSet>;
    em: number;
  } | null = null;

  constructor(
    private readonly s: HubClientSettings,
    private readonly buscar: Buscar = fetch,
  ) {}

  private async json(url: string, init?: RequestInit): Promise<any> {
    const r = await this.buscar(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = await r.json().catch(() => ({}));
    return { status: r.status, corpo };
  }

  /** Discovery em cache; uma falha limpa o cache. */
  async descobrir(): Promise<Discovery> {
    if (!this.discovery) {
      this.discovery = (async () => {
        const { status, corpo } = await this.json(
          `${this.s.issuer}/.well-known/openid-configuration`,
        );
        if (
          status !== 200 ||
          corpo?.issuer !== this.s.issuer ||
          !corpo.authorization_endpoint ||
          !corpo.token_endpoint ||
          !corpo.jwks_uri
        ) {
          throw new Error('discovery inválido');
        }
        return corpo as Discovery;
      })();
      this.discovery.catch(() => (this.discovery = null));
    }
    return this.discovery;
  }

  private async conjunto(forcar = false) {
    const agora = Date.now();
    if (!this.jwks || (forcar && agora - this.jwks.em > JWKS_RETRY_MS)) {
      const d = await this.descobrir();
      const { status, corpo } = await this.json(d.jwks_uri);
      if (status !== 200 || !Array.isArray(corpo?.keys)) {
        throw new Error('jwks indisponível');
      }
      this.jwks = {
        conj: createLocalJWKSet(corpo as JSONWebKeySet),
        em: agora,
      };
    }
    return this.jwks.conj;
  }

  /** jwtVerify com o JWKS do provedor; "kid desconhecido" → busca o JWKS de novo. */
  private async verificar(
    token: string,
    opcoes: Parameters<typeof jwtVerify>[2],
  ) {
    try {
      return await jwtVerify(token, await this.conjunto(), opcoes);
    } catch (e) {
      if (e instanceof errors.JWKSNoMatchingKey) {
        return jwtVerify(token, await this.conjunto(true), opcoes);
      }
      throw e;
    }
  }

  async urlDeAutorizacao(p: {
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<string> {
    const d = await this.descobrir();
    const u = new URL(d.authorization_endpoint);
    u.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.s.clientId,
      redirect_uri: this.s.redirectUri,
      scope: 'openid email profile',
      state: p.state,
      nonce: p.nonce,
      code_challenge: desafioPkce(p.codeVerifier),
      code_challenge_method: 'S256',
    }).toString();
    return u.toString();
  }

  /** Troca o code (client_secret_basic + code_verifier, MESMO redirect_uri). */
  async trocarCode(code: string, codeVerifier: string): Promise<string> {
    const d = await this.descobrir();
    const basic = Buffer.from(
      `${encodeURIComponent(this.s.clientId)}:${encodeURIComponent(this.s.clientSecret)}`,
    ).toString('base64');
    const { status, corpo } = await this.json(d.token_endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.s.redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });
    if (status !== 200 || typeof corpo?.id_token !== 'string') {
      throw new TokenInvalido(
        `token_endpoint ${status}${corpo?.error ? ` ${String(corpo.error).slice(0, 40)}` : ''}`,
      );
    }
    return corpo.id_token;
  }

  /** id_token: RS256 pelo JWKS, iss, aud (e azp), nonce, exp/iat (±30 s), sub. */
  async validarIdToken(idToken: string, nonce: string): Promise<JWTPayload> {
    let payload: JWTPayload;
    try {
      ({ payload } = await this.verificar(idToken, {
        algorithms: ['RS256'],
        issuer: this.s.issuer,
        audience: this.s.clientId,
        clockTolerance: TOLERANCIA_S,
        requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
      }));
    } catch (e) {
      throw new TokenInvalido(`id_token: ${(e as Error)?.name ?? 'erro'}`);
    }
    if (payload.nonce !== nonce) throw new TokenInvalido('id_token: nonce');
    if (payload.azp !== undefined && payload.azp !== this.s.clientId) {
      throw new TokenInvalido('id_token: azp');
    }
    if (
      typeof payload.iat === 'number' &&
      payload.iat > Date.now() / 1000 + TOLERANCIA_S
    ) {
      throw new TokenInvalido('id_token: iat no futuro');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new TokenInvalido('id_token: sub');
    }
    return payload;
  }

  /** Logout token (back-channel): RS256, iss, aud, typ, 2 min, events, sem nonce. */
  async validarLogoutToken(token: string): Promise<JWTPayload> {
    let payload: JWTPayload;
    try {
      ({ payload } = await this.verificar(token, {
        algorithms: ['RS256'],
        issuer: this.s.issuer,
        audience: this.s.clientId,
        typ: 'logout+jwt',
        clockTolerance: TOLERANCIA_S,
        maxTokenAge: '2m',
        requiredClaims: ['iat', 'jti', 'sub', 'events'],
      }));
    } catch (e) {
      throw new TokenInvalido(`logout_token: ${(e as Error)?.name ?? 'erro'}`);
    }
    const ev = payload.events as Record<string, unknown> | undefined;
    if (!ev || typeof ev !== 'object' || !(EVENTO_BACKCHANNEL in ev)) {
      throw new TokenInvalido('logout_token: events');
    }
    if ('nonce' in payload) throw new TokenInvalido('logout_token: nonce');
    return payload;
  }

  /**
   * Saída no SERVIDOR do login central (POST {issuer}/cliente/sair,
   * client_secret_basic + id_token_hint): encerra a sessão SSO sem página no
   * navegador. true só com 204; qualquer outra resposta, timeout ou erro de
   * rede → false (quem chama cai no end_session, a reserva).
   */
  async sairNoServidor(idTokenHint: string): Promise<boolean> {
    const basic = Buffer.from(
      `${encodeURIComponent(this.s.clientId)}:${encodeURIComponent(this.s.clientSecret)}`,
    ).toString('base64');
    try {
      const r = await this.buscar(`${this.s.issuer}/cliente/sair`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ id_token_hint: idTokenHint }).toString(),
        signal: AbortSignal.timeout(SAIR_TIMEOUT_MS),
      });
      return r.status === 204;
    } catch {
      return false;
    }
  }

  /** end_session do HUB (client_id, post_logout_redirect_uri e o hint, se houver). */
  async urlDeSaida(idTokenHint: string | null): Promise<string | null> {
    const d = await this.descobrir();
    if (!d.end_session_endpoint) return null;
    const u = new URL(d.end_session_endpoint);
    u.searchParams.set('client_id', this.s.clientId);
    u.searchParams.set('post_logout_redirect_uri', this.s.portalUrl);
    if (idTokenHint) u.searchParams.set('id_token_hint', idTokenHint);
    return u.toString();
  }
}

// ── Cookies cifrados (JWE dir/A256GCM, chave derivada do segredo) ─────────
export const chaveDosCookies = (segredo: string) =>
  crypto
    .createHash('sha256')
    .update(`lhg-analytics:hub-cookie:${segredo}`)
    .digest();

export async function cifrar(
  dados: unknown,
  chave: Uint8Array,
): Promise<string> {
  return new CompactEncrypt(Buffer.from(JSON.stringify(dados), 'utf8'))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(chave);
}

/** Decifra; qualquer falha (cookie forjado, chave trocada) → null. */
export async function decifrar<T>(
  valor: unknown,
  chave: Uint8Array,
): Promise<T | null> {
  if (typeof valor !== 'string' || !valor || valor.length > 8192) return null;
  try {
    const { plaintext } = await compactDecrypt(valor, chave);
    return JSON.parse(Buffer.from(plaintext).toString('utf8')) as T;
  } catch {
    return null;
  }
}

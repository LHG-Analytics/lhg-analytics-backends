import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { GoogleSettings } from './google.config';

/** O que usamos do id_token do Google (já validado). */
export interface GoogleClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  hd?: string;
  name?: string;
  nonce?: string;
}

export interface AuthorizationParams {
  state: string;
  nonce: string;
  codeChallenge: string;
}

/**
 * Fronteira com o Google: monta a URL de autorização e troca o code pelo
 * id_token VALIDADO. As regras de quem pode entrar ficam no GoogleLoginService
 * (testadas com um provedor falso; só esta fronteira muda nos testes).
 */
export abstract class GoogleIdentityProvider {
  abstract authorizationUrl(s: GoogleSettings, p: AuthorizationParams): string;
  abstract exchangeCode(
    s: GoogleSettings,
    code: string,
    codeVerifier: string,
  ): Promise<GoogleClaims>;
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

@Injectable()
export class RealGoogleIdentityProvider extends GoogleIdentityProvider {
  authorizationUrl(s: GoogleSettings, p: AuthorizationParams): string {
    const u = new URL(AUTH_URL);
    u.search = new URLSearchParams({
      client_id: s.clientId,
      redirect_uri: s.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: p.state,
      nonce: p.nonce,
      code_challenge: p.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return u.toString();
  }

  /**
   * Troca o code (com o verifier do PKCE) e valida o id_token NO SERVIDOR:
   * assinatura pelas chaves públicas do Google, iss, aud = o nosso client_id
   * e exp. O nonce e o restante das regras são conferidos por quem chama.
   */
  async exchangeCode(
    s: GoogleSettings,
    code: string,
    codeVerifier: string,
  ): Promise<GoogleClaims> {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: s.clientId,
        client_secret: s.clientSecret,
        redirect_uri: s.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      // Só o status: a resposta do Google pode ecoar o code.
      throw new Error(`Google token endpoint respondeu ${resp.status}`);
    }
    const { id_token } = (await resp.json()) as { id_token?: string };
    if (!id_token) throw new Error('Google não devolveu id_token');

    const { payload } = await jwtVerify(id_token, JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: s.clientId,
    });
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ''),
      email_verified: payload.email_verified === true,
      hd: typeof payload.hd === 'string' ? payload.hd : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined,
    };
  }
}

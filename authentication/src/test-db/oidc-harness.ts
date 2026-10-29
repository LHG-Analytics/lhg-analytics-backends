// Apoio das suítes do login central (1d): sobe o authentication com a MESMA
// ordem do main.ts (cookie-parser → helmet → /oidc → CORS → body parser do
// Nest no init), para os testes valerem para a produção. Também traz um pote
// de cookies mínimo e o fluxo authorization code + PKCE de ponta a ponta.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { AccessService } from '../access/access.service';
import { LoginLockService } from '../access/login-lock.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { buildCorsOptions, helmetMiddleware } from '../common/http-setup';
import { GoogleSettings } from '../google/google.config';
import {
  AuthorizationParams,
  GoogleClaims,
  GoogleIdentityProvider,
} from '../google/google-identity.provider';
import { GoogleLoginService } from '../google/google-login.service';
import { OidcLogoutService } from '../oidc/oidc-logout.service';
import { mountOidc } from '../oidc/oidc.mount';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

export const JWT_TESTE = 'segredo-de-teste-local';

/** Google falso: guarda o nonce pedido e devolve as claims de cada code. */
export class GoogleFalso extends GoogleIdentityProvider {
  claims = new Map<string, Partial<GoogleClaims>>();
  ultimoNonce = '';
  ultimoState = '';
  authorizationUrl(_s: GoogleSettings, p: AuthorizationParams) {
    this.ultimoNonce = p.nonce;
    this.ultimoState = p.state;
    return `https://accounts.google.test/auth?state=${p.state}`;
  }
  async exchangeCode(_s: GoogleSettings, code: string): Promise<GoogleClaims> {
    const c = this.claims.get(code);
    if (!c) throw new Error('code desconhecido');
    return {
      email_verified: true,
      nonce: this.ultimoNonce,
      ...c,
    } as GoogleClaims;
  }
}

/** Sobe o app como o main.ts, com as variáveis de agora. */
export async function subirComoMain(
  google: GoogleIdentityProvider = new GoogleFalso(),
  extras: { imports?: any[]; providers?: any[]; limitarTaxa?: boolean } = {},
): Promise<{ app: INestApplication; provider: any }> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ JWT_SECRET: JWT_TESTE })],
      }),
      JwtModule.register({ secret: JWT_TESTE }),
      ...(extras.imports ?? []),
    ],
    controllers: [AuthController],
    providers: [
      AuthService,
      AccessService,
      LoginLockService,
      PrismaService,
      GoogleLoginService,
      OidcLogoutService,
      UsersService,
      { provide: GoogleIdentityProvider, useValue: google },
      ...(extras.providers ?? []),
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.use(helmetMiddleware());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const provider = await mountOidc(app, {
    iniciarOutbox: false,
    // Rate limit só na suíte que o testa (D4).
    limitarTaxa: extras.limitarTaxa ?? false,
  });
  app.enableCors(buildCorsOptions({}));
  await app.init();
  return { app, provider };
}

/** Pote de cookies mínimo (nome=valor; ignora path e domínio de propósito). */
export class Pote {
  private c = new Map<string, string>();
  guardar(res: request.Response) {
    const linhas = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    for (const l of linhas) {
      const [par, ...attrs] = l.split(';');
      const i = par.indexOf('=');
      const nome = par.slice(0, i).trim();
      const valor = par.slice(i + 1).trim();
      const expirou = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a));
      if (expirou || !valor) this.c.delete(nome);
      else this.c.set(nome, valor);
    }
    return res;
  }
  tem(nome: string) {
    return this.c.has(nome);
  }
  apagar(nome: string) {
    this.c.delete(nome);
    this.c.delete(`${nome}.sig`);
  }
  header() {
    return [...this.c].map(([n, v]) => `${n}=${v}`).join('; ');
  }
}

export const b64url = (b: Buffer) => b.toString('base64url');

/** Parâmetros de uma autorização com PKCE (S256). */
export function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  return {
    verifier,
    challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
    state: b64url(crypto.randomBytes(8)),
    nonce: b64url(crypto.randomBytes(8)),
  };
}

/** Partes de um JWT (sem validar: só para ler cabeçalho e claims). */
export function lerJwt(jwt: string) {
  const [h, p] = jwt.split('.');
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(p, 'base64url').toString('utf8')),
  };
}

/** Caminho local (o /auth que o proxy tira) de uma URL do issuer. */
export function local(issuer: string, url: string): string {
  if (url.startsWith(issuer)) return '/oidc' + url.slice(issuer.length);
  if (url.startsWith('/auth/oidc')) return url.slice('/auth'.length);
  return url;
}

export interface ClienteDeTeste {
  segredo: string;
  redirect: string;
}

/**
 * Fluxo authorization code + PKCE completo contra o app de teste: autorizar,
 * login por senha na interação, seguir os redirects e trocar o code.
 */
export function fluxo(
  srv: any,
  issuer: string,
  clientes: Record<string, ClienteDeTeste>,
) {
  const uidDa = (location: string) =>
    /\/interaction\/([^/?]+)/.exec(location)![1];

  const autorizar = (pote: Pote, clientId: string, p = pkce()) =>
    request(srv)
      .get('/oidc/auth')
      .set('Cookie', pote.header())
      .query({
        client_id: clientId,
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: clientes[clientId].redirect,
        code_challenge: p.challenge,
        code_challenge_method: 'S256',
        state: p.state,
        nonce: p.nonce,
      })
      .then((r) => pote.guardar(r));

  async function ateOCliente(pote: Pote, location: string) {
    let loc = location;
    for (let i = 0; i < 5 && loc.startsWith(issuer); i++) {
      const r = pote.guardar(
        await request(srv).get(local(issuer, loc)).set('Cookie', pote.header()),
      );
      loc = r.headers.location;
    }
    return new URL(loc);
  }

  const trocar = (clientId: string, corpo: Record<string, string>) =>
    request(srv)
      .post('/oidc/token')
      .auth(clientId, clientes[clientId].segredo)
      .type('form')
      .send(corpo);

  /** Login (com senha, ou SSO se o pote já tem sessão) e troca do code. */
  async function entrar(
    pote: Pote,
    clientId: string,
    email: string,
    senha: string,
  ) {
    const p = pkce();
    const a = await autorizar(pote, clientId, p);
    let final: URL;
    if (/\/interaction\//.test(a.headers.location)) {
      const uid = uidDa(a.headers.location);
      const l = pote.guardar(
        await request(srv)
          .post(`/oidc/interaction/${uid}/login`)
          .set('Cookie', pote.header())
          .type('form')
          .send({ email, password: senha }),
      );
      final = await ateOCliente(pote, l.headers.location);
    } else {
      final = new URL(a.headers.location);
    }
    const code = final.searchParams.get('code');
    if (!code) return { final, tokens: null as any };
    const t = await trocar(clientId, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: clientes[clientId].redirect,
      code_verifier: p.verifier,
    });
    return { final, tokens: t.body };
  }

  const refresh = (clientId: string, refreshToken: string) =>
    trocar(clientId, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

  return { autorizar, entrar, refresh, trocar, uidDa, ateOCliente };
}

/** Valor do cookie hub_sso (o id da sessão SSO) de um pote. */
export function sessaoDo(pote: Pote): string | undefined {
  const par = pote
    .header()
    .split('; ')
    .find((c) => c.startsWith('hub_sso='));
  return par?.slice('hub_sso='.length);
}

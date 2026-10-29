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
import { mountOidc } from '../oidc/oidc.mount';
import { PrismaService } from '../prisma/prisma.service';

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
): Promise<{ app: INestApplication; provider: any }> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ JWT_SECRET: JWT_TESTE })],
      }),
      JwtModule.register({ secret: JWT_TESTE }),
    ],
    controllers: [AuthController],
    providers: [
      AuthService,
      AccessService,
      LoginLockService,
      PrismaService,
      GoogleLoginService,
      { provide: GoogleIdentityProvider, useValue: google },
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
  const provider = await mountOidc(app);
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

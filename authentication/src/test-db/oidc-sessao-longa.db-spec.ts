// Sessão LONGA e DESLIZANTE só para o painel-tv (a TV fica sempre logada):
// refresh token e grant valem 90 dias e renovam a cada refresh. Os outros
// clientes continuam com 7 e 7 dias. Status e flag conferidos em todo
// refresh. No banco migrado de verdade, com o app montado como o main.ts.
// Chaves e segredos de TESTE gerados aqui, na hora.
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JWK } from 'jose';
import * as request from 'supertest';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { Pote, fluxo, pkce, subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const DIA = 24 * 60 * 60 * 1000;
const jwk = (kid: string) =>
  ({
    ...crypto
      .generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ format: 'jwk' }),
    kid,
  }) as JWK & { kid: string };
const segredo = () => crypto.randomBytes(32).toString('hex');
const CLIENTES = {
  'painel-tv': {
    segredo: segredo(),
    redirect: 'https://painel.exemplo.invalid/auth/callback',
  },
  hub: { segredo: segredo(), redirect: 'https://hub.exemplo.invalid/cb' },
};

describe('Sessão longa e deslizante do painel-tv (90 dias); os outros 7/7', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let f: ReturnType<typeof fluxo>;
  let n = 0;

  const pessoa = (flags = ['painel-tv']) =>
    db.user.create({
      data: {
        email: `tv-${++n}@example.invalid`,
        name: `TV ${n}`,
        password: bcrypt.hashSync(SENHA, 4),
        systemAccesses: { create: flags.map((systemKey) => ({ systemKey })) },
      },
    });
  /** Dias até vencer (a partir de agora), de um registro do OidcPayload. */
  const diasAte = (d: Date | null) =>
    d ? (d.getTime() - Date.now()) / DIA : -1;
  const registro = (type: string, accountId: string) =>
    db.oidcPayload.findFirst({
      where: { type, accountId },
      orderBy: { expiresAt: 'desc' },
    });
  const grantDe = (clientId: string, accountId: string) =>
    db.oidcPayload.findFirst({
      where: {
        type: 'Grant',
        accountId,
        payload: { path: ['clientId'], equals: clientId },
      },
    });
  /** O grant é renovado logo depois do refresh (evento): espera até mudar. */
  async function esperar<T>(fn: () => Promise<T>, ok: (v: T) => boolean) {
    for (let i = 0; i < 40; i++) {
      const v = await fn();
      if (ok(v)) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    return fn();
  }

  beforeAll(async () => {
    url = novoSchema('tsessaolonga');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.system.upsert({
      where: { key: 'painel-tv' },
      create: { key: 'painel-tv', name: 'Painel TV', active: true },
      update: {},
    });
    await db.oidcClient.createMany({
      data: [
        {
          clientId: 'painel-tv',
          name: 'Painel TV',
          systemKey: 'painel-tv',
          redirectUris: [CLIENTES['painel-tv'].redirect],
        },
        { clientId: 'hub', name: 'HUB', redirectUris: [CLIENTES.hub.redirect] },
      ],
    });
    Object.assign(process.env, {
      OIDC_ISSUER: ISSUER,
      OIDC_JWKS: JSON.stringify({ keys: [jwk('k1')] }),
      OIDC_COOKIE_KEYS: [segredo(), segredo()].join(','),
      OIDC_CLIENT_SECRET_PAINEL_TV: CLIENTES['painel-tv'].segredo,
      OIDC_CLIENT_SECRET_HUB: CLIENTES.hub.segredo,
      OIDC_MINIMAL_LOGIN_PAGE: 'true',
    });
    ({ app } = await subirComoMain());
    srv = app.getHttpServer();
    f = fluxo(srv, ISSUER, CLIENTES);
  });

  afterAll(async () => {
    await app?.close();
    for (const k of [
      'OIDC_ISSUER',
      'OIDC_JWKS',
      'OIDC_COOKIE_KEYS',
      'OIDC_CLIENT_SECRET_PAINEL_TV',
      'OIDC_CLIENT_SECRET_HUB',
      'OIDC_MINIMAL_LOGIN_PAGE',
    ]) {
      delete process.env[k];
    }
    await db.$disconnect();
    await apagarSchema(url);
  });

  it('painel-tv: refresh e grant vencem em ~90 dias; depois de um refresh, os dois voltam a ~agora + 90 dias (deslizante)', async () => {
    const u = await pessoa();
    const { tokens } = await f.entrar(new Pote(), 'painel-tv', u.email, SENHA);
    expect(tokens.refresh_token).toBeTruthy();
    const rt = await registro('RefreshToken', u.publicId);
    expect(diasAte(rt!.expiresAt)).toBeGreaterThan(89.9);
    expect(diasAte(rt!.expiresAt)).toBeLessThan(90.1);
    const g = await grantDe('painel-tv', u.publicId);
    expect(diasAte(g!.expiresAt)).toBeGreaterThan(89.9);

    // A TV "envelheceu": o grant vence amanhã (simulado no banco).
    const amanha = new Date(Date.now() + DIA);
    await db.oidcPayload.update({
      where: { id_type: { id: g!.id, type: 'Grant' } },
      data: {
        expiresAt: amanha,
        payload: {
          ...(g!.payload as any),
          exp: Math.floor(amanha.getTime() / 1000),
        },
      },
    });
    const r = await f.refresh('painel-tv', tokens.refresh_token);
    expect(r.status).toBe(200);
    expect(r.body.refresh_token).toBeTruthy();
    const g2 = await esperar(
      () => grantDe('painel-tv', u.publicId),
      (x) => diasAte(x!.expiresAt) > 89,
    );
    expect(diasAte(g2!.expiresAt)).toBeGreaterThan(89.9);
    const rt2 = await registro('RefreshToken', u.publicId);
    expect(diasAte(rt2!.expiresAt)).toBeGreaterThan(89.9);
    // e o novo refresh segue funcionando
    expect((await f.refresh('painel-tv', r.body.refresh_token)).status).toBe(
      200,
    );
  });

  it('os outros clientes (hub) continuam com 7 e 7 dias, e o grant deles NÃO desliza', async () => {
    const u = await pessoa(['painel-tv']);
    const { tokens } = await f.entrar(new Pote(), 'hub', u.email, SENHA);
    const rt = await registro('RefreshToken', u.publicId);
    expect(diasAte(rt!.expiresAt)).toBeGreaterThan(6.9);
    expect(diasAte(rt!.expiresAt)).toBeLessThan(7.1);
    const g = await grantDe('hub', u.publicId);
    expect(diasAte(g!.expiresAt)).toBeLessThan(7.1);
    const antes = g!.expiresAt!.getTime();
    expect((await f.refresh('hub', tokens.refresh_token)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    const g2 = await grantDe('hub', u.publicId);
    expect(g2!.expiresAt!.getTime()).toBe(antes);
  });

  it('o corte continua pela conta: sem a flag painel-tv → o refresh dá invalid_grant', async () => {
    const u = await pessoa();
    const { tokens } = await f.entrar(new Pote(), 'painel-tv', u.email, SENHA);
    await db.systemAccess.updateMany({
      where: { userId: u.id, systemKey: 'painel-tv' },
      data: { revokedAt: new Date() },
    });
    const r = await f.refresh('painel-tv', tokens.refresh_token);
    expect(r.body.error).toBe('invalid_grant');
  });

  it('conta inativa → o refresh dá invalid_grant', async () => {
    const u = await pessoa();
    const { tokens } = await f.entrar(new Pote(), 'painel-tv', u.email, SENHA);
    await db.user.update({
      where: { id: u.id },
      data: { status: 'INACTIVE' as any },
    });
    const r = await f.refresh('painel-tv', tokens.refresh_token);
    expect(r.body.error).toBe('invalid_grant');
  });

  it('prompt=consent continua recusado (contrato do provedor: sem tela de consentimento)', async () => {
    const p = pkce();
    const a = await request(srv).get('/oidc/auth').query({
      client_id: 'painel-tv',
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: CLIENTES['painel-tv'].redirect,
      code_challenge: p.challenge,
      code_challenge_method: 'S256',
      state: p.state,
      prompt: 'consent',
    });
    const loc = new URL(a.headers.location);
    expect(loc.searchParams.get('error')).toBe('invalid_request');
  });
});

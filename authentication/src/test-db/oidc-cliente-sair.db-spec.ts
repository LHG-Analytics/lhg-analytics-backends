// "Sair" de um cliente servidor → servidor: POST /oidc/cliente/sair
// (client_secret_basic + id_token_hint). Encerra a sessão SSO (escopo sid ou
// todas), revoga os grants (inclusive o do portal) e avisa os OUTROS
// clientes, sem página no navegador. Banco migrado de verdade, app montado
// como o main.ts. Chaves e segredos de TESTE gerados aqui, na hora.
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JWK, SignJWT, importJWK } from 'jose';
import * as request from 'supertest';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { Pote, fluxo, lerJwt, subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const jwk = (kid: string) =>
  ({
    ...crypto
      .generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ format: 'jwk' }),
    kid,
  }) as JWK & { kid: string };
const K1 = jwk('chave-nova');
const FALSA = jwk('chave-nova'); // mesmo kid, outra chave: assinatura falsa
const segredo = () => crypto.randomBytes(32).toString('hex');
const CHAVE = segredo();
const CLIENTES = {
  hub: {
    segredo: segredo(),
    redirect: 'https://hub.exemplo.invalid/api/auth/callback',
  },
  cms: { segredo: segredo(), redirect: 'https://cms.exemplo.invalid/cb' },
};
const BC_CMS = 'https://cms.exemplo.invalid/backchannel';
const VARS = {
  OIDC_ISSUER: ISSUER,
  OIDC_JWKS: JSON.stringify({ keys: [K1] }),
  OIDC_COOKIE_KEYS: [segredo(), segredo()].join(','),
  OIDC_CLIENT_SECRET_HUB: CLIENTES.hub.segredo,
  OIDC_CLIENT_SECRET_CMS: CLIENTES.cms.segredo,
  OIDC_MINIMAL_LOGIN_PAGE: 'true',
  HUB_PROXY_KEY: CHAVE,
};

const basic = (id: string, seg: string) =>
  `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(seg)}`).toString('base64')}`;

async function assinar(
  claims: Record<string, unknown>,
  chave: JWK & { kid: string } = K1,
) {
  const agora = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: 'sid-x', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: chave.kid })
    .setIssuer((claims.iss as string) ?? ISSUER)
    .setAudience((claims.aud as string) ?? 'cms')
    .setSubject((claims.sub as string) ?? 'x')
    .setIssuedAt((claims.iat as number) ?? agora)
    .setExpirationTime((claims.exp as number) ?? agora + 600)
    .sign(await importJWK(chave, 'RS256'));
}

/** Sobe o app (escopo sid ou todas) num schema novo; devolve os ajudantes. */
function preparar(nome: string, escopo?: 'todas') {
  const ctx = { logs: [] as string[] } as {
    url: string;
    db: ReturnType<typeof cliente>;
    app: INestApplication;
    srv: any;
    f: ReturnType<typeof fluxo>;
    logs: string[];
  };
  const espioes: jest.SpyInstance[] = [];
  beforeAll(async () => {
    ctx.url = novoSchema(nome);
    expect(migrar(ctx.url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = ctx.url;
    ctx.db = cliente(ctx.url);
    await ctx.db.oidcClient.createMany({
      data: [
        {
          clientId: 'hub',
          name: 'HUB',
          redirectUris: [CLIENTES.hub.redirect],
          postLogoutRedirectUris: ['https://hub.exemplo.invalid/'],
        },
        {
          clientId: 'cms',
          name: 'CMS',
          systemKey: 'cms',
          redirectUris: [CLIENTES.cms.redirect],
          backchannelLogoutUri: BC_CMS,
        },
      ],
    });
    const guardar = (...a: unknown[]) => {
      ctx.logs.push(
        a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '),
      );
    };
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      espioes.push(
        jest.spyOn(Logger.prototype, m).mockImplementation(guardar as any),
      );
    }
    for (const m of ['log', 'warn', 'error', 'info'] as const) {
      espioes.push(jest.spyOn(console, m).mockImplementation(guardar as any));
    }
    Object.assign(process.env, VARS);
    if (escopo) process.env.OIDC_CLIENTE_SAIR_ESCOPO = escopo;
    ({ app: ctx.app } = await subirComoMain());
    ctx.srv = ctx.app.getHttpServer();
    ctx.f = fluxo(ctx.srv, ISSUER, CLIENTES);
  });
  afterAll(async () => {
    await ctx.app?.close();
    espioes.forEach((e) => e.mockRestore());
    for (const k of [...Object.keys(VARS), 'OIDC_CLIENTE_SAIR_ESCOPO']) {
      delete process.env[k];
    }
    await ctx.db.$disconnect();
    await apagarSchema(ctx.url);
  });

  let n = 0;
  const pessoa = () =>
    ctx.db.user.create({
      data: {
        email: `csair-${nome}-${++n}@example.invalid`,
        name: `Pessoa ${n}`,
        password: bcrypt.hashSync(SENHA, 4),
        systemAccesses: { create: [{ systemKey: 'cms' }] },
      },
    });
  const sair = (
    corpo: unknown,
    auth: string | null = basic('cms', CLIENTES.cms.segredo),
    tipo: 'json' | 'form' = 'form',
  ) => {
    let r = request(ctx.srv).post('/oidc/cliente/sair');
    if (auth) r = r.set('Authorization', auth);
    r = r.set('x-hub-client-ip', '203.0.113.9');
    return tipo === 'form'
      ? r.type('form').send(corpo as object)
      : r.send(corpo as object);
  };
  const sessoes = (publicId: string) =>
    ctx.db.oidcPayload.count({
      where: { type: 'Session', accountId: publicId },
    });
  return { ctx, pessoa, sair, sessoes };
}

describe('POST /oidc/cliente/sair (Sair de um cliente, servidor → servidor) — escopo sid', () => {
  const { ctx, pessoa, sair, sessoes } = preparar('tcsair');

  it('cms sai: 204 no-store; a sessão SSO some; os grants do cms E do PORTAL (hub) caem; sem aviso para o próprio cms; o próximo login pede senha', async () => {
    const u = await pessoa();
    const pote = new Pote();
    const hub = await ctx.f.entrar(pote, 'hub', u.email, SENHA);
    const cms = await ctx.f.entrar(pote, 'cms', u.email, SENHA);
    expect(await sessoes(u.publicId)).toBe(1);

    const r = await sair({ id_token_hint: cms.tokens.id_token });
    expect(r.status).toBe(204);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(await sessoes(u.publicId)).toBe(0);
    // O grant do PORTAL cai junto (o /?saiu=1 não deixa o portal logado).
    expect(
      (await ctx.f.refresh('hub', hub.tokens.refresh_token)).body.error,
    ).toBe('invalid_grant');
    expect(
      (await ctx.f.refresh('cms', cms.tokens.refresh_token)).body.error,
    ).toBe('invalid_grant');
    // Quem pediu a saída não recebe back-channel.
    expect(await ctx.db.outbox.count({ where: { sub: u.publicId } })).toBe(0);

    const [ev] = await ctx.db.auditEvent.findMany({
      where: { action: 'cliente.sair', targetUserId: u.id },
    });
    expect(ev.ip).toBeTruthy(); // o IP do servidor que chamou
    expect(ev.metadata).toEqual({
      clientId: 'cms',
      escopo: 'sid',
      sessoes: 1,
      grants: 2,
    });
    const texto =
      JSON.stringify({ ...ev, id: String(ev.id) }) + ctx.logs.join('\n');
    expect(texto).not.toContain(cms.tokens.id_token);
    expect(texto).not.toContain(CLIENTES.cms.segredo);

    // O cookie de sessão do navegador ficou, mas não vale: pede login (sem SSO).
    const a = await ctx.f.autorizar(pote, 'cms');
    expect(a.headers.location).toMatch(/\/interaction\//);
    const h = await ctx.f.autorizar(pote, 'hub');
    expect(h.headers.location).toMatch(/\/interaction\//);
  });

  it('o portal (hub) sai pela mesma rota, corpo JSON: o cms (OUTRO cliente) recebe o back-channel', async () => {
    const u = await pessoa();
    const pote = new Pote();
    const hub = await ctx.f.entrar(pote, 'hub', u.email, SENHA);
    const cms = await ctx.f.entrar(pote, 'cms', u.email, SENHA);
    const r = await sair(
      { id_token_hint: hub.tokens.id_token },
      basic('hub', CLIENTES.hub.segredo),
      'json',
    );
    expect(r.status).toBe(204);
    const fila = await ctx.db.outbox.findMany({ where: { sub: u.publicId } });
    expect(fila.map((o) => [o.clientId, o.event])).toEqual([['cms', 'logout']]);
    expect(fila[0].sid).toBe(lerJwt(cms.tokens.id_token).payload.sid);
  });

  it('idempotente: de novo (sessão já inexistente) → 204, sessoes: 0 na auditoria', async () => {
    const u = await pessoa();
    const { tokens } = await ctx.f.entrar(new Pote(), 'cms', u.email, SENHA);
    expect((await sair({ id_token_hint: tokens.id_token })).status).toBe(204);
    expect((await sair({ id_token_hint: tokens.id_token })).status).toBe(204);
    const evs = await ctx.db.auditEvent.findMany({
      where: { action: 'cliente.sair', targetUserId: u.id },
      orderBy: { id: 'asc' },
    });
    expect(evs.map((e) => (e.metadata as any).sessoes)).toEqual([1, 0]);
  });

  it('só derruba o sid do token: a sessão de outro navegador continua', async () => {
    const u = await pessoa();
    const a = await ctx.f.entrar(new Pote(), 'cms', u.email, SENHA);
    const b = await ctx.f.entrar(new Pote(), 'cms', u.email, SENHA);
    expect(await sessoes(u.publicId)).toBe(2);
    expect((await sair({ id_token_hint: a.tokens.id_token })).status).toBe(204);
    expect(await sessoes(u.publicId)).toBe(1);
    expect((await ctx.f.refresh('cms', b.tokens.refresh_token)).status).toBe(
      200,
    );
  });

  it('id_token VENCIDO (exp no passado) é aceito', async () => {
    const u = await pessoa();
    const { tokens } = await ctx.f.entrar(new Pote(), 'cms', u.email, SENHA);
    const agora = Math.floor(Date.now() / 1000);
    const vencido = await assinar({
      sub: u.publicId,
      sid: lerJwt(tokens.id_token).payload.sid,
      iat: agora - 3600,
      exp: agora - 3000,
    });
    expect((await sair({ id_token_hint: vencido })).status).toBe(204);
    expect(await sessoes(u.publicId)).toBe(0);
  });

  it('id_token inválido → 400 INVALID_ID_TOKEN_HINT e a sessão continua', async () => {
    const u = await pessoa();
    const pote = new Pote();
    const { tokens } = await ctx.f.entrar(pote, 'cms', u.email, SENHA);
    const sid = lerJwt(tokens.id_token).payload.sid;
    const agora = Math.floor(Date.now() / 1000);
    const base = { sub: u.publicId, sid };
    const casos = [
      await assinar({
        ...base,
        iat: agora - 8 * 24 * 3600,
        exp: agora - 8 * 24 * 3600 + 600,
      }),
      await assinar(base, FALSA),
      await assinar({ ...base, aud: 'hub' }),
      await assinar({ ...base, iss: 'https://outro.exemplo.invalid/oidc' }),
      await assinar({ ...base, sid: '' }),
      'nao-e-um-jwt',
    ];
    for (const t of casos) {
      const r = await sair({ id_token_hint: t });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('INVALID_ID_TOKEN_HINT');
    }
    // id_token de verdade do hub, com as credenciais do cms: não serve.
    const hub = await ctx.f.entrar(pote, 'hub', u.email, SENHA);
    expect((await sair({ id_token_hint: hub.tokens.id_token })).status).toBe(
      400,
    );
    expect(await sessoes(u.publicId)).toBe(1);
  });

  it('cliente não autenticado → 401 invalid_client (sem Basic, segredo errado, cliente inexistente, só a x-hub-proxy-key); corpo inválido → 400', async () => {
    const u = await pessoa();
    const { tokens } = await ctx.f.entrar(new Pote(), 'cms', u.email, SENHA);
    const corpo = { id_token_hint: tokens.id_token };
    for (const auth of [
      null,
      basic('cms', segredo()),
      basic('nao-existe', CLIENTES.cms.segredo),
      basic('cms', CLIENTES.hub.segredo),
      'Bearer x',
    ]) {
      const r = await sair(corpo, auth);
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('invalid_client');
      expect(r.headers['www-authenticate']).toMatch(/^Basic/);
    }
    const proxy = await request(ctx.srv)
      .post('/oidc/cliente/sair')
      .set('x-hub-proxy-key', CHAVE)
      .type('form')
      .send(corpo);
    expect(proxy.status).toBe(401);
    expect((await sair({})).status).toBe(400);
    expect((await sair({ ...corpo, extra: '1' })).status).toBe(400);
    expect(await sessoes(u.publicId)).toBe(1);
  });
});

describe('POST /oidc/cliente/sair — escopo todas (OIDC_CLIENTE_SAIR_ESCOPO=todas)', () => {
  const { ctx, pessoa, sair, sessoes } = preparar('tcsairt', 'todas');

  it('derruba TODAS as sessões e TODOS os grants da pessoa, inclusive os soltos de sessões antigas', async () => {
    const u = await pessoa();
    const a = await ctx.f.entrar(new Pote(), 'cms', u.email, SENHA);
    const b = await ctx.f.entrar(new Pote(), 'hub', u.email, SENHA);
    // grant solto: a sessão antiga já sumiu, o refresh continua vivo
    const velho = await ctx.f.entrar(new Pote(), 'hub', u.email, SENHA);
    await ctx.db.oidcPayload.deleteMany({
      where: {
        type: 'Session',
        accountId: u.publicId,
        payload: {
          path: ['authorizations', 'hub', 'sid'],
          equals: lerJwt(velho.tokens.id_token).payload.sid,
        },
      },
    });
    expect(await sessoes(u.publicId)).toBe(2);
    expect((await sair({ id_token_hint: a.tokens.id_token })).status).toBe(204);
    expect(await sessoes(u.publicId)).toBe(0);
    for (const [c, t] of [
      ['cms', a],
      ['hub', b],
      ['hub', velho],
    ] as const) {
      expect((await ctx.f.refresh(c, t.tokens.refresh_token)).body.error).toBe(
        'invalid_grant',
      );
    }
    const [ev] = await ctx.db.auditEvent.findMany({
      where: { action: 'cliente.sair', targetUserId: u.id },
    });
    expect(ev.metadata).toMatchObject({
      escopo: 'todas',
      sessoes: 2,
      grants: 3,
    });
  });
});

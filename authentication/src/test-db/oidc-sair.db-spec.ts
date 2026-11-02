// "Sair" do portal servidor → servidor: POST /oidc/hub/sair (x-hub-proxy-key +
// id_token do hub). Encerra a sessão SSO, revoga os grants de todos os
// clientes dela e enfileira o back-channel, sem a página do end_session. No
// banco migrado de verdade, com o app montado como o main.ts. Chaves e
// segredos de TESTE gerados aqui, na hora.
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

describe('POST /oidc/hub/sair (Sair do portal, servidor → servidor)', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let f: ReturnType<typeof fluxo>;
  const logs: string[] = [];
  const espioes: jest.SpyInstance[] = [];
  let n = 0;

  const pessoa = () =>
    db.user.create({
      data: {
        email: `sair-${++n}@example.invalid`,
        name: `Pessoa ${n}`,
        password: bcrypt.hashSync(SENHA, 4),
        systemAccesses: { create: [{ systemKey: 'cms' }] },
      },
    });
  const sair = (corpo: unknown, chave: string | null = CHAVE) => {
    let r = request(srv).post('/oidc/hub/sair');
    if (chave) r = r.set('x-hub-proxy-key', chave);
    return r.set('x-hub-client-ip', '203.0.113.9').send(corpo as object);
  };
  /** id_token assinado aqui (para os casos de vencido, iat velho e chave falsa). */
  async function assinar(
    claims: Record<string, unknown>,
    chave: JWK & { kid: string } = K1,
  ) {
    const agora = Math.floor(Date.now() / 1000);
    return new SignJWT({ sid: 'sid-x', ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: chave.kid })
      .setIssuer((claims.iss as string) ?? ISSUER)
      .setAudience((claims.aud as string) ?? 'hub')
      .setSubject((claims.sub as string) ?? 'x')
      .setIssuedAt((claims.iat as number) ?? agora)
      .setExpirationTime((claims.exp as number) ?? agora + 600)
      .sign(await importJWK(chave, 'RS256'));
  }
  const sessoes = (publicId: string) =>
    db.oidcPayload.count({ where: { type: 'Session', accountId: publicId } });

  beforeAll(async () => {
    url = novoSchema('tsair');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.oidcClient.createMany({
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
      logs.push(
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
    ({ app } = await subirComoMain());
    srv = app.getHttpServer();
    f = fluxo(srv, ISSUER, CLIENTES);
  });

  afterAll(async () => {
    await app?.close();
    espioes.forEach((e) => e.mockRestore());
    for (const k of Object.keys(VARS)) delete process.env[k];
    await db.$disconnect();
    await apagarSchema(url);
  });

  it('sessão com hub + cms: 204 no-store; a sessão SSO some, os grants dos DOIS caem, 1 aviso na outbox para o cms; auditoria sem tokens', async () => {
    const u = await pessoa();
    const pote = new Pote();
    const hub = await f.entrar(pote, 'hub', u.email, SENHA);
    const cms = await f.entrar(pote, 'cms', u.email, SENHA);
    expect(await sessoes(u.publicId)).toBe(1);

    const r = await sair({
      id_token: hub.tokens.id_token,
      refresh_token: hub.tokens.refresh_token,
    });
    expect(r.status).toBe(204);
    expect(r.headers['cache-control']).toBe('no-store');

    expect(await sessoes(u.publicId)).toBe(0);
    expect((await f.refresh('hub', hub.tokens.refresh_token)).body.error).toBe(
      'invalid_grant',
    );
    expect((await f.refresh('cms', cms.tokens.refresh_token)).body.error).toBe(
      'invalid_grant',
    );
    const fila = await db.outbox.findMany({ where: { sub: u.publicId } });
    expect(fila.map((o) => [o.clientId, o.event])).toEqual([['cms', 'logout']]);
    expect(fila[0].sid).toBe(lerJwt(cms.tokens.id_token).payload.sid);

    const [ev] = await db.auditEvent.findMany({
      where: { action: 'oidc.logout', targetUserId: u.id },
    });
    expect(ev.ip).toBe('203.0.113.9');
    expect(ev.metadata).toEqual({
      clientId: 'hub',
      via: 'hub/sair',
      sessao: true,
      // O refresh do hub caiu junto com o grant da sessão.
      refresh: false,
    });
    const texto =
      JSON.stringify({ ...ev, id: String(ev.id) }) + logs.join('\n');
    expect(texto).not.toContain(hub.tokens.id_token);
    expect(texto).not.toContain(hub.tokens.refresh_token);

    // O cookie de sessão do navegador não vale mais: o próximo authorize pede login.
    const a = await f.autorizar(pote, 'hub');
    expect(a.headers.location).toMatch(/\/interaction\//);
  });

  it('sessão SSO já vencida, mas refresh do hub ainda vivo: o grant dele cai (refresh: true)', async () => {
    const u = await pessoa();
    const { tokens } = await f.entrar(new Pote(), 'hub', u.email, SENHA);
    await db.oidcPayload.deleteMany({
      where: { type: 'Session', accountId: u.publicId },
    });
    expect((await f.refresh('hub', tokens.refresh_token)).status).toBe(200);
    const novo = (await f.refresh('hub', tokens.refresh_token)).body;
    expect(novo.error).toBe('invalid_grant'); // reuso do rotacionado derruba o grant
    const t2 = (await f.entrar(new Pote(), 'hub', u.email, SENHA)).tokens;
    await db.oidcPayload.deleteMany({
      where: { type: 'Session', accountId: u.publicId },
    });
    const r = await sair({
      id_token: t2.id_token,
      refresh_token: t2.refresh_token,
    });
    expect(r.status).toBe(204);
    expect((await f.refresh('hub', t2.refresh_token)).body.error).toBe(
      'invalid_grant',
    );
    const [ev] = await db.auditEvent.findMany({
      where: { action: 'oidc.logout', targetUserId: u.id },
      orderBy: { id: 'desc' },
    });
    expect(ev.metadata).toMatchObject({ sessao: false, refresh: true });
  });

  it('idempotente: de novo (sessão já inexistente) → 204 igual, sem nova auditoria', async () => {
    const u = await pessoa();
    const { tokens } = await f.entrar(new Pote(), 'hub', u.email, SENHA);
    expect((await sair({ id_token: tokens.id_token })).status).toBe(204);
    expect((await sair({ id_token: tokens.id_token })).status).toBe(204);
    expect(
      await db.auditEvent.count({
        where: { action: 'oidc.logout', targetUserId: u.id },
      }),
    ).toBe(1);
  });

  it('sid inexistente (token válido) → 204 sem mexer em nada', async () => {
    const u = await pessoa();
    const pote = new Pote();
    await f.entrar(pote, 'hub', u.email, SENHA);
    const t = await assinar({ sub: u.publicId, sid: 'nao-existe' });
    expect((await sair({ id_token: t })).status).toBe(204);
    expect(await sessoes(u.publicId)).toBe(1);
  });

  it('id_token VENCIDO (exp no passado) é aceito', async () => {
    const u = await pessoa();
    const pote = new Pote();
    const { tokens } = await f.entrar(pote, 'hub', u.email, SENHA);
    const agora = Math.floor(Date.now() / 1000);
    const vencido = await assinar({
      sub: u.publicId,
      sid: lerJwt(tokens.id_token).payload.sid,
      iat: agora - 3600,
      exp: agora - 3000,
    });
    expect((await sair({ id_token: vencido })).status).toBe(204);
    expect(await sessoes(u.publicId)).toBe(0);
  });

  it('iat com mais de 7 dias, assinatura falsa, aud de outro cliente, iss errado, sem sid → 401 e a sessão continua', async () => {
    const u = await pessoa();
    const pote = new Pote();
    const { tokens } = await f.entrar(pote, 'hub', u.email, SENHA);
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
      await assinar({ ...base, aud: 'cms' }),
      await assinar({ ...base, iss: 'https://outro.exemplo.invalid/oidc' }),
      await assinar({ ...base, sid: '' }),
      'nao-e-um-jwt',
    ];
    for (const t of casos) {
      const r = await sair({ id_token: t });
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ message: 'Não autorizado' });
    }
    // id_token de verdade do cms (aud = cms) também não serve.
    const cms = await f.entrar(pote, 'cms', u.email, SENHA);
    expect((await sair({ id_token: cms.tokens.id_token })).status).toBe(401);
    expect(await sessoes(u.publicId)).toBe(1);
  });

  it('x-hub-proxy-key ausente ou errada → 401 sem detalhes (antes de ler o corpo); corpo inválido → 400', async () => {
    const u = await pessoa();
    const { tokens } = await f.entrar(new Pote(), 'hub', u.email, SENHA);
    for (const chave of [null, segredo()]) {
      const r = await sair({ id_token: tokens.id_token }, chave);
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ message: 'Não autorizado' });
    }
    const quebrado = await request(srv)
      .post('/oidc/hub/sair')
      .set('Content-Type', 'application/json')
      .send('{x');
    expect(quebrado.status).toBe(401);
    expect((await sair({})).status).toBe(400);
    expect((await sair({ id_token: tokens.id_token, extra: 1 })).status).toBe(
      400,
    );
    const q = await request(srv)
      .post('/oidc/hub/sair')
      .set('x-hub-proxy-key', CHAVE)
      .set('Content-Type', 'application/json')
      .send('{x');
    expect(q.status).toBe(400);
    expect(await sessoes(u.publicId)).toBe(1);
  });

  it('refresh_token de OUTRA pessoa é ignorado (o grant dela continua)', async () => {
    const a = await pessoa();
    const b = await pessoa();
    const ta = (await f.entrar(new Pote(), 'hub', a.email, SENHA)).tokens;
    const tb = (await f.entrar(new Pote(), 'hub', b.email, SENHA)).tokens;
    const r = await sair({
      id_token: ta.id_token,
      refresh_token: tb.refresh_token,
    });
    expect(r.status).toBe(204);
    expect(await sessoes(a.publicId)).toBe(0);
    expect(await sessoes(b.publicId)).toBe(1);
    const rb = await f.refresh('hub', tb.refresh_token);
    expect(rb.status).toBe(200);
    expect(rb.body.access_token).toBeTruthy();
  });
});

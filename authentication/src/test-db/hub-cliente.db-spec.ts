// O Analytics como CLIENTE do HUB: /api/hub/login, /callback, /logout e
// /backchannel-logout, contra o provedor REAL (o mesmo app, como em produção)
// e o cliente 'analytics' fictício. O fetch do cliente aponta o issuer para o
// app local. Chaves e segredos de TESTE gerados aqui, na hora.
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { JWK, SignJWT, importJWK } from 'jose';
import * as request from 'supertest';
import { AccessService } from '../access/access.service';
import { GoogleController } from '../google/google.controller';
import {
  COOKIE_FLUXO,
  COOKIE_IDT,
  HUB_CLIENT_BUSCAR,
  HubClientController,
} from '../hub-client/hub-client.controller';
import { EVENTO_BACKCHANNEL } from '../hub-client/hub-oidc';
import { InvitationsService } from '../invitations/invitations.service';
import { OutboxWorker } from '../oidc/oidc-outbox';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import {
  JWT_TESTE,
  Pote,
  fluxo,
  lerJwt,
  local,
  subirComoMain,
} from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const PUBLICO = 'https://analytics.exemplo.invalid';
const CALLBACK = `${PUBLICO}/auth/api/hub/callback`;
const PORTAL = 'https://hub.exemplo.invalid/';
const BC = `${PUBLICO}/auth/api/hub/backchannel-logout`;
const SENHA = 'senha-de-teste-123';
const segredo = () => crypto.randomBytes(32).toString('hex');
const SEG = segredo();
const K1 = {
  ...crypto
    .generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'jwk' }),
  kid: 'chave-nova',
} as JWK & { kid: string };
const VARS: Record<string, string> = {
  OIDC_ISSUER: ISSUER,
  OIDC_JWKS: JSON.stringify({ keys: [K1] }),
  OIDC_COOKIE_KEYS: [segredo(), segredo()].join(','),
  OIDC_CLIENT_SECRET_ANALYTICS: SEG,
  OIDC_MINIMAL_LOGIN_PAGE: 'true',
  HUB_OIDC_ISSUER: ISSUER,
  HUB_OIDC_CLIENT_ID: 'analytics',
  HUB_OIDC_CLIENT_SECRET: SEG,
  ANALYTICS_PUBLIC_URL: PUBLICO,
  HUB_PORTAL_URL: PORTAL,
};

describe('Analytics como cliente do HUB (/api/hub/*)', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let base: string;
  let f: ReturnType<typeof fluxo>;
  const logs: string[] = [];
  const espioes: jest.SpyInstance[] = [];
  /** Valores que NUNCA podem aparecer em log (teste 17). */
  const sensiveis = new Set<string>([SEG]);
  let n = 0;

  // O cliente fala com o issuer público; aqui ele é o próprio app local.
  const buscar = (u: string, init?: RequestInit) =>
    fetch(
      u.startsWith(ISSUER) ? `${base}/oidc${u.slice(ISSUER.length)}` : u,
      init,
    );

  async function pessoa(
    d: { role?: any; unit?: any; systems?: string[]; status?: any } = {},
  ) {
    return db.user.create({
      data: {
        email: `hub-cli-${++n}@example.invalid`,
        name: `Pessoa ${n}`,
        password: bcrypt.hashSync(SENHA, 4),
        role: d.role === undefined ? 'GERENTE_GERAL' : d.role,
        unit: d.unit === undefined ? 'TOUT' : d.unit,
        status: d.status ?? 'ACTIVE',
        systemAccesses: {
          create: (d.systems ?? ['analytics']).map((systemKey) => ({
            systemKey,
          })),
        },
      },
    });
  }
  const setCookies = (r: request.Response): string[] =>
    ([] as string[]).concat(r.headers['set-cookie'] ?? []);
  const cookie = (r: request.Response, nome: string) =>
    setCookies(r).find((c) => c.startsWith(`${nome}=`));
  const valor = (c?: string) => c?.split(';')[0].split('=').slice(1).join('=');
  const atributos = (c?: string) =>
    (c ?? '')
      .split(';')
      .slice(1)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => !x.startsWith('expires='))
      .sort();

  /** Login completo pelo HUB: /api/hub/login → provedor (senha) → /api/hub/callback. */
  async function entrarPeloHub(pote: Pote, email: string, returnTo?: string) {
    const ini = pote.guardar(
      await request(srv)
        .get('/api/hub/login')
        .query(returnTo ? { returnTo } : {})
        .set('Cookie', pote.header()),
    );
    expect(ini.status).toBe(302);
    const a = pote.guardar(
      await request(srv)
        .get(local(ISSUER, ini.headers.location))
        .set('Cookie', pote.header()),
    );
    let final: URL;
    if (/\/interaction\//.test(a.headers.location)) {
      const uid = f.uidDa(a.headers.location);
      const l = pote.guardar(
        await request(srv)
          .post(`/oidc/interaction/${uid}/login`)
          .set('Cookie', pote.header())
          .type('form')
          .send({ email, password: SENHA }),
      );
      final = await f.ateOCliente(pote, l.headers.location);
    } else {
      final = new URL(a.headers.location);
    }
    expect(final.origin + final.pathname).toBe(CALLBACK);
    const code = final.searchParams.get('code');
    if (code) sensiveis.add(code);
    const cabecalho = pote.header();
    const cb = pote.guardar(
      await request(srv)
        .get(`/api/hub/callback${final.search}`)
        .set('Cookie', cabecalho),
    );
    for (const nome of [
      'access_token',
      'refresh_token',
      COOKIE_IDT,
      COOKIE_FLUXO,
    ]) {
      const v = valor(cookie(cb, nome));
      if (v) sensiveis.add(v);
    }
    return { ini, final, cb, cabecalho };
  }
  const hubErro = (r: request.Response) =>
    new URL(r.headers.location).searchParams.get('hub_error');
  const refresh = (pote: Pote) =>
    request(srv).post('/api/refresh').set('Cookie', pote.header());

  /** Logout token assinado pela chave do provedor (para os casos do back-channel). */
  async function logoutToken(
    c: Record<string, unknown>,
    h: Record<string, unknown> = {},
  ) {
    const agora = Math.floor(Date.now() / 1000);
    const { iat, exp, aud, ...resto } = c;
    const t = await new SignJWT({
      events: { [EVENTO_BACKCHANNEL]: {} },
      jti: crypto.randomUUID(),
      ...resto,
    })
      .setProtectedHeader({
        alg: 'RS256',
        kid: K1.kid,
        typ: 'logout+jwt',
        ...h,
      })
      .setIssuer(ISSUER)
      .setAudience((aud as string) ?? 'analytics')
      .setIssuedAt((iat as number) ?? agora)
      .setExpirationTime((exp as number) ?? agora + 120)
      .sign(await importJWK(K1, 'RS256'));
    sensiveis.add(t);
    return t;
  }
  const backchannel = (token: string) =>
    request(srv)
      .post('/api/hub/backchannel-logout')
      .type('form')
      .send({ logout_token: token });

  beforeAll(async () => {
    url = novoSchema('thubcli');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.oidcClient.create({
      data: {
        clientId: 'analytics',
        name: 'LHG Analytics',
        systemKey: 'analytics',
        redirectUris: [CALLBACK],
        postLogoutRedirectUris: [PORTAL],
        backchannelLogoutUri: BC,
      },
    });
    const guardar = (...a: unknown[]) =>
      logs.push(
        a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '),
      );
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      espioes.push(
        jest.spyOn(Logger.prototype, m).mockImplementation(guardar as any),
      );
    }
    for (const m of ['log', 'warn', 'error', 'info'] as const) {
      espioes.push(jest.spyOn(console, m).mockImplementation(guardar as any));
    }
    Object.assign(process.env, VARS);
    ({ app } = await subirComoMain(undefined, {
      controllers: [HubClientController, GoogleController],
      providers: [
        InvitationsService,
        { provide: HUB_CLIENT_BUSCAR, useValue: buscar },
      ],
    }));
    await app.listen(0, '127.0.0.1');
    srv = app.getHttpServer();
    base = `http://127.0.0.1:${srv.address().port}`;
    f = fluxo(srv, ISSUER, { analytics: { segredo: SEG, redirect: CALLBACK } });
  });

  afterAll(async () => {
    await app?.close();
    espioes.forEach((e) => e.mockRestore());
    for (const k of Object.keys(VARS)) delete process.env[k];
    delete process.env.ANALYTICS_LOGIN_LOCAL;
    await db.$disconnect();
    await apagarSchema(url);
  });

  it('boot: linha "hub-cliente: ATIVO" sem valores', () => {
    expect(
      logs.some((l) => l.includes('hub-cliente: ATIVO (client_id=analytics')),
    ).toBe(true);
  });

  it('1. login completo: cookies access_token/refresh_token com os MESMOS atributos do POST /api/login; access_token passa no jwt.verify do lhg-api', async () => {
    const u = await pessoa();
    const { cb } = await entrarPeloHub(new Pote(), u.email, '/relatorios');
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe(`${PUBLICO}/relatorios`);
    expect(cb.headers['cache-control']).toBe('no-store');
    const senha = await request(srv)
      .post('/api/login')
      .send({ email: u.email, password: SENHA })
      .expect(200);
    for (const nome of ['access_token', 'refresh_token']) {
      expect(atributos(cookie(cb, nome))).toEqual(
        atributos(cookie(senha, nome)),
      );
    }
    const p = jwt.verify(valor(cookie(cb, 'access_token'))!, JWT_TESTE) as any;
    expect(p).toMatchObject({
      id: u.id,
      email: u.email,
      name: u.name,
      unit: 'TOUT',
      role: 'GERENTE_GERAL',
    });
    // id_token guardado cifrado, no caminho público do cliente.
    const idt = cookie(cb, COOKIE_IDT)!;
    expect(atributos(idt)).toEqual(
      expect.arrayContaining([
        'path=/auth/api/hub',
        'httponly',
        'samesite=lax',
        'secure',
      ]),
    );
    expect(valor(idt)!.split('.')).toHaveLength(5);
    const [ev] = await db.auditEvent.findMany({
      where: { action: 'hub.login', targetUserId: u.id },
    });
    expect(ev.systemKey).toBe('analytics');
  });

  it('2. redirect_uri = ANALYTICS_PUBLIC_URL + /auth/api/hub/callback, mesmo com Host/X-Forwarded-Host forjados', async () => {
    const r = await request(srv)
      .get('/api/hub/login')
      .set('Host', 'atacante.invalid')
      .set('X-Forwarded-Host', 'atacante.invalid')
      .set('X-Forwarded-Proto', 'http')
      .expect(302);
    const loc = new URL(r.headers.location);
    expect(loc.origin + loc.pathname).toBe(`${ISSUER}/auth`);
    expect(loc.searchParams.get('redirect_uri')).toBe(CALLBACK);
  });

  it('3. PKCE S256, state/nonce aleatórios; an_hub_flow cifrado, Path=/auth/api/hub, HttpOnly, SameSite=Lax', async () => {
    const [a, b] = [
      await request(srv).get('/api/hub/login'),
      await request(srv).get('/api/hub/login'),
    ];
    const qa = new URL(a.headers.location).searchParams;
    const qb = new URL(b.headers.location).searchParams;
    expect(qa.get('code_challenge_method')).toBe('S256');
    expect(qa.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(qa.get('response_type')).toBe('code');
    expect(qa.get('scope')).toBe('openid email profile');
    expect(qa.get('prompt')).toBeNull();
    expect(qa.get('state')).not.toBe(qb.get('state'));
    expect(qa.get('nonce')).not.toBe(qb.get('nonce'));
    expect(qa.get('state')!.length).toBeGreaterThanOrEqual(43);
    const fl = cookie(a, COOKIE_FLUXO)!;
    expect(atributos(fl)).toEqual(
      expect.arrayContaining([
        'path=/auth/api/hub',
        'httponly',
        'samesite=lax',
        'secure',
        'max-age=600',
      ]),
    );
    expect(valor(fl)!.split('.')).toHaveLength(5);
    expect(valor(fl)).not.toContain(qa.get('state')!);
    expect(a.headers['cache-control']).toBe('no-store');
  });

  it('4. returnTo: aceito só caminho relativo seguro (//x → /)', async () => {
    const u = await pessoa();
    expect(
      (await entrarPeloHub(new Pote(), u.email, '//x.invalid')).cb.headers
        .location,
    ).toBe(`${PUBLICO}/`);
    expect(
      (await entrarPeloHub(new Pote(), u.email, 'javascript:alert(1)')).cb
        .headers.location,
    ).toBe(`${PUBLICO}/`);
  });

  it('5. callback sem cookie de fluxo, com state errado ou com code reusado → hub_error=falha, sem cookies de sessão', async () => {
    const u = await pessoa();
    const pote = new Pote();
    const { final, cabecalho, cb } = await entrarPeloHub(pote, u.email);
    expect(cb.status).toBe(302);
    // code reusado (mesmo cookie de fluxo, repetido por um atacante)
    const de_novo = await request(srv)
      .get(`/api/hub/callback${final.search}`)
      .set('Cookie', cabecalho);
    expect(hubErro(de_novo)).toBe('falha');
    expect(cookie(de_novo, 'access_token')).toBeUndefined();
    // sem cookie de fluxo
    const sem = await request(srv).get(`/api/hub/callback${final.search}`);
    expect(hubErro(sem)).toBe('falha');
    // state errado
    const ini = await request(srv).get('/api/hub/login');
    const fl = cookie(ini, COOKIE_FLUXO)!.split(';')[0];
    const errado = await request(srv)
      .get('/api/hub/callback?code=x&state=outro')
      .set('Cookie', fl);
    expect(hubErro(errado)).toBe('falha');
    expect(cookie(errado, 'access_token')).toBeUndefined();
    const motivos = (
      await db.auditEvent.findMany({ where: { action: 'hub.login.failed' } })
    ).map((e) => (e.metadata as any)?.motivo);
    expect(motivos).toEqual(expect.arrayContaining(['fluxo_ausente', 'state']));
  });

  it('7. pessoa SEM a flag analytics: o provedor devolve access_denied → hub_error=access_denied', async () => {
    const u = await pessoa({ systems: ['cms'] });
    const { cb } = await entrarPeloHub(new Pote(), u.email);
    expect(hubErro(cb)).toBe('access_denied');
    expect(cookie(cb, 'access_token')).toBeUndefined();
  });

  it('8. com a flag e SEM perfil/unidade → analyticsDenial → access_denied (auditoria hub.login.denied.no_profile); inativa → inactive ou access_denied', async () => {
    const sem = await pessoa({ role: null, unit: null });
    const r = await entrarPeloHub(new Pote(), sem.email);
    expect(hubErro(r.cb)).toBe('access_denied');
    expect(
      await db.auditEvent.count({
        where: { action: 'hub.login.denied.no_profile', targetUserId: sem.id },
      }),
    ).toBe(1);
    const ina = await pessoa({ status: 'INACTIVE' });
    const ini = await request(srv).get('/api/hub/login');
    const pote = new Pote();
    pote.guardar(ini);
    const a = pote.guardar(
      await request(srv)
        .get(local(ISSUER, ini.headers.location))
        .set('Cookie', pote.header()),
    );
    const uid = f.uidDa(a.headers.location);
    const l = pote.guardar(
      await request(srv)
        .post(`/oidc/interaction/${uid}/login`)
        .set('Cookie', pote.header())
        .type('form')
        .send({ email: ina.email, password: SENHA }),
    );
    const destino = l.headers.location as string;
    if (destino.startsWith(ISSUER) && !/\/interaction\//.test(destino)) {
      const final = await f.ateOCliente(pote, destino);
      const cb = await request(srv)
        .get(`/api/hub/callback${final.search}`)
        .set('Cookie', pote.header());
      expect(['inactive', 'access_denied']).toContain(hubErro(cb));
    } else {
      // O provedor nem conclui o login de quem está inativo (volta à tela).
      expect(destino).toMatch(/\/interaction\//);
    }
  });

  it('9. logout: Origin certo → 303 ao end_session (id_token_hint, client_id, post_logout); cookies limpos e refresh revogado. Origin errado → 403', async () => {
    const u = await pessoa();
    const pote = new Pote();
    await entrarPeloHub(pote, u.email);
    const ruim = await request(srv)
      .post('/api/hub/logout')
      .set('Origin', 'https://atacante.invalid')
      .set('Cookie', pote.header());
    expect(ruim.status).toBe(403);
    const semNada = await request(srv)
      .post('/api/hub/logout')
      .set('Cookie', pote.header());
    expect(semNada.status).toBe(403);
    const cabecalho = pote.header();
    const r = pote.guardar(
      await request(srv)
        .post('/api/hub/logout')
        .set('Origin', PUBLICO)
        .set('Cookie', cabecalho),
    );
    expect(r.status).toBe(303);
    const loc = new URL(r.headers.location);
    expect(loc.origin + loc.pathname).toBe(`${ISSUER}/session/end`);
    expect(loc.searchParams.get('client_id')).toBe('analytics');
    expect(loc.searchParams.get('post_logout_redirect_uri')).toBe(PORTAL);
    expect(lerJwt(loc.searchParams.get('id_token_hint')!).payload.aud).toBe(
      'analytics',
    );
    for (const nome of ['access_token', 'refresh_token', COOKIE_IDT]) {
      expect(cookie(r, nome)).toMatch(/expires=Thu, 01 Jan 1970/i);
    }
    // o refresh antigo não vale mais
    expect(
      (await request(srv).post('/api/refresh').set('Cookie', cabecalho)).status,
    ).toBe(401);
    expect(
      await db.auditEvent.count({
        where: { action: 'hub.logout', targetUserId: u.id },
      }),
    ).toBe(1);
    // Referer da mesma origem (sem Origin) também vale
    const p2 = new Pote();
    await entrarPeloHub(p2, u.email);
    expect(
      (
        await request(srv)
          .post('/api/hub/logout')
          .set('Referer', `${PUBLICO}/relatorios`)
          .set('Cookie', p2.header())
      ).status,
    ).toBe(303);
  });

  it('10. logout com id_token VENCIDO como hint: o provedor aceita e a saída é direta (sem a tela de confirmação)', async () => {
    const u = await pessoa();
    const pote = new Pote();
    await entrarPeloHub(pote, u.email);
    const sessao = await db.oidcPayload.findFirstOrThrow({
      where: { type: 'Session', accountId: u.publicId },
    });
    const sid = (sessao.payload as any).authorizations?.analytics?.sid;
    const agora = Math.floor(Date.now() / 1000);
    const vencido = await new SignJWT({ sid })
      .setProtectedHeader({ alg: 'RS256', kid: K1.kid })
      .setIssuer(ISSUER)
      .setAudience('analytics')
      .setSubject(u.publicId)
      .setIssuedAt(agora - 3600)
      .setExpirationTime(agora - 3000)
      .sign(await importJWK(K1, 'RS256'));
    const pag = await request(srv)
      .get('/oidc/session/end')
      .set('Cookie', pote.header())
      .set('Accept', 'text/html')
      .query({
        client_id: 'analytics',
        id_token_hint: vencido,
        post_logout_redirect_uri: PORTAL,
      });
    expect(pag.status).toBe(200);
    expect(pag.text).toContain('Saindo do HUB LHG');
    expect(pag.text).not.toContain('Sair de todos os sistemas da LHG?');
  });

  it('11. back-channel válido → 200 e os refresh tokens da pessoa caem (POST /api/refresh dá 401); auditoria sem o token', async () => {
    const u = await pessoa();
    const pote = new Pote();
    await entrarPeloHub(pote, u.email);
    expect((await refresh(pote)).status).toBe(200);
    const p2 = new Pote(); // depois do refresh acima, o pote tem o refresh novo
    p2.guardar(await refresh(pote));
    const r = await backchannel(
      await logoutToken({ sub: u.publicId, sid: 'sid-x' }),
    );
    expect(r.status).toBe(200);
    expect(r.text).toBe('');
    expect(r.headers['cache-control']).toBe('no-store');
    expect((await refresh(p2)).status).toBe(401);
    const [ev] = await db.auditEvent.findMany({
      where: { action: 'hub.backchannel', targetUserId: u.id },
    });
    expect(ev.metadata).toEqual({ sid: 'sid-x' });
    // sem usuário → 200 (no_user)
    expect(
      (await backchannel(await logoutToken({ sub: crypto.randomUUID() })))
        .status,
    ).toBe(200);
  });

  it('12. back-channel com nonce, sem events, aud errado, vencido, typ errado ou jti repetido → 400', async () => {
    const u = await pessoa();
    const agora = Math.floor(Date.now() / 1000);
    const casos = [
      await logoutToken({ sub: u.publicId, nonce: 'x' }),
      await logoutToken({ sub: u.publicId, events: { outro: {} } }),
      await logoutToken({ sub: u.publicId, aud: 'hub' }),
      await logoutToken({
        sub: u.publicId,
        iat: agora - 600,
        exp: agora - 300,
      }),
      await logoutToken({ sub: u.publicId }, { typ: 'JWT' }),
      'nao-e-jwt',
    ];
    for (const t of casos) expect((await backchannel(t)).status).toBe(400);
    expect(
      (
        await request(srv)
          .post('/api/hub/backchannel-logout')
          .type('form')
          .send({})
      ).status,
    ).toBe(400);
    const t = await logoutToken({ sub: u.publicId });
    expect((await backchannel(t)).status).toBe(200);
    expect((await backchannel(t)).status).toBe(400);
  });

  it('13. ponta a ponta com o Outbox REAL: "sair de tudo" no HUB → o worker envia → o refresh no Analytics dá 401', async () => {
    const u = await pessoa();
    const pote = new Pote();
    await entrarPeloHub(pote, u.email);
    const sessaoAnalytics = new Pote();
    sessaoAnalytics.guardar(await refresh(pote)); // a sessão local do Analytics continua viva
    // "Sair de tudo" no provedor (end_session confirmado).
    const pag = pote.guardar(
      await request(srv)
        .get('/oidc/session/end')
        .set('Cookie', pote.header())
        .expect(200),
    );
    const xsrf = /name="xsrf" value="([^"]+)"/.exec(pag.text)![1];
    pote.guardar(
      await request(srv)
        .post('/oidc/session/end/confirm')
        .set('Cookie', pote.header())
        .type('form')
        .send({ xsrf, logout: 'yes' }),
    );
    await new Promise((ok) => setTimeout(ok, 200));
    const fila = await db.outbox.findMany({
      where: { sub: u.publicId, clientId: 'analytics' },
    });
    expect(fila).toHaveLength(1);
    const enviados: string[] = [];
    const worker = new OutboxWorker(
      db as any,
      app.get(AccessService),
      ISSUER,
      K1,
      24,
      {
        enviar: async (destino, corpo) => {
          enviados.push(destino);
          const r = await request(srv)
            .post('/api/hub/backchannel-logout')
            .type('form')
            .send(corpo);
          return r.status;
        },
        resolver: async () => ['203.0.113.10'],
      },
    );
    await worker.rodarUmaVez();
    expect(enviados).toEqual([BC]);
    expect(
      (await db.outbox.findUniqueOrThrow({ where: { id: fila[0].id } })).status,
    ).toBe('sent');
    expect((await refresh(sessaoAnalytics)).status).toBe(401);
    expect(
      await db.auditEvent.count({
        where: { action: 'hub.backchannel', targetUserId: u.id },
      }),
    ).toBe(1);
  });

  it('14. ANALYTICS_LOGIN_LOCAL=off: POST /api/login → 403 LOGIN_PELO_HUB sem contar no bloqueio; Google antigo recusado; refresh e logout seguem', async () => {
    const u = await pessoa();
    const pote = new Pote();
    await entrarPeloHub(pote, u.email);
    process.env.ANALYTICS_LOGIN_LOCAL = 'off';
    try {
      const antes = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      for (const senha of [SENHA, 'senha-errada-qualquer']) {
        const r = await request(srv)
          .post('/api/login')
          .send({ email: u.email, password: senha });
        expect(r.status).toBe(403);
        expect(r.body).toEqual({
          code: 'LOGIN_PELO_HUB',
          message: 'Entre pelo HUB LHG.',
        });
      }
      const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(depois.failedLoginCount).toBe(antes.failedLoginCount);
      expect(depois.lockedUntil).toEqual(antes.lockedUntil);
      expect(
        await db.auditEvent.count({ where: { action: 'login.blocked.hub' } }),
      ).toBeGreaterThanOrEqual(2);
      const g = await request(srv).get('/api/google/start');
      expect(g.status).toBe(302);
      expect(g.headers.location).toBe(`${PUBLICO}/login`);
      const gc = await request(srv).get('/api/google/callback?code=x&state=y');
      expect(gc.headers.location).toBe(`${PUBLICO}/login`);
      expect((await refresh(pote)).status).toBe(200);
      expect(
        (await request(srv).post('/api/logout').set('Cookie', pote.header()))
          .status,
      ).toBe(200);
    } finally {
      delete process.env.ANALYTICS_LOGIN_LOCAL;
    }
    expect(
      (
        await request(srv)
          .post('/api/login')
          .send({ email: u.email, password: SENHA })
      ).status,
    ).toBe(200);
  });

  it('15. ANALYTICS_LOGIN_LOCAL=off SEM o cliente configurado → tratado como on: o login antigo continua 200', async () => {
    const u = await pessoa();
    process.env.ANALYTICS_LOGIN_LOCAL = 'off';
    delete process.env.HUB_OIDC_CLIENT_SECRET;
    try {
      expect(
        (
          await request(srv)
            .post('/api/login')
            .send({ email: u.email, password: SENHA })
        ).status,
      ).toBe(200);
    } finally {
      process.env.HUB_OIDC_CLIENT_SECRET = SEG;
      delete process.env.ANALYTICS_LOGIN_LOCAL;
    }
  });

  it('16. sem as variáveis do cliente → /api/hub/* dá 404 (back-channel 503) e o resto segue igual', async () => {
    const u = await pessoa();
    delete process.env.HUB_OIDC_CLIENT_SECRET;
    try {
      expect((await request(srv).get('/api/hub/login')).status).toBe(404);
      expect(
        (await request(srv).get('/api/hub/callback?code=x&state=y')).status,
      ).toBe(404);
      expect(
        (await request(srv).post('/api/hub/logout').set('Origin', PUBLICO))
          .status,
      ).toBe(404);
      expect((await backchannel('x')).status).toBe(503);
      expect(
        (
          await request(srv)
            .post('/api/login')
            .send({ email: u.email, password: SENHA })
        ).status,
      ).toBe(200);
      expect(
        (await request(srv).get('/oidc/.well-known/openid-configuration'))
          .status,
      ).toBe(200);
    } finally {
      process.env.HUB_OIDC_CLIENT_SECRET = SEG;
    }
  });

  it('17. varredura dos logs: nenhum code, token, segredo ou cookie', () => {
    expect(sensiveis.size).toBeGreaterThan(10);
    const tudo = logs.join('\n');
    for (const v of sensiveis) expect(tudo).not.toContain(v);
  });
});

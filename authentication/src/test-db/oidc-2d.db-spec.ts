// 1d-D2: login dentro do login central (senha e Google), checagem de status e
// flag antes do code e no refresh, tempos, claims e auditoria, no banco
// migrado de verdade, com o app montado na MESMA ordem do main.ts. Chaves e
// segredos de TESTE gerados aqui, na hora. Numeração = testes obrigatórios
// da 1d; (a)–(f) = os pontos da revisão do D1.
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { MAX_FAILURES } from '../access/login-lock.service';
import { INATIVIDADE_MAX, ttlDaSessao } from '../oidc/oidc.mount';
import { limparVencidos } from '../oidc/prisma-adapter';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import {
  GoogleFalso,
  Pote,
  lerJwt,
  local,
  pkce,
  subirComoMain,
} from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const CB_HUB = 'https://hub.exemplo.invalid/api/auth/callback';
const CB_SIS = 'https://sistema.exemplo.invalid/cb';
const jwk = (kid: string) => ({
  ...crypto
    .generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'jwk' }),
  kid,
});
const K1 = jwk('chave-nova');
const K2 = jwk('chave-antiga');
const SEGREDO = {
  hub: crypto.randomBytes(32).toString('hex'),
  sistema: crypto.randomBytes(32).toString('hex'),
};
const VARS = {
  OIDC_ISSUER: ISSUER,
  OIDC_JWKS: JSON.stringify({ keys: [K1, K2] }),
  OIDC_COOKIE_KEYS: [
    crypto.randomBytes(32).toString('hex'),
    crypto.randomBytes(32).toString('hex'),
  ].join(','),
  OIDC_CLIENT_SECRET_HUB: SEGREDO.hub,
  OIDC_CLIENT_SECRET_SISTEMA: SEGREDO.sistema,
  OIDC_MINIMAL_LOGIN_PAGE: 'true',
  OIDC_GOOGLE_REDIRECT_URI: `${ISSUER}/google/callback`,
  GOOGLE_OAUTH_CLIENT_ID: '1234567890-abcdefghij.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'segredo-de-teste-do-google',
  GOOGLE_WORKSPACE_DOMAINS: 'rede.example',
};
const IP_FORJADO = '203.0.113.99';

describe('1d-D2: login central', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  const google = new GoogleFalso();
  const logs: string[] = [];
  const espioes: jest.SpyInstance[] = [];
  const pessoas: Record<
    string,
    { id: number; publicId: string; email: string }
  > = {};

  async function pessoa(tag: string, extra: Record<string, unknown> = {}) {
    const u = await db.user.create({
      data: {
        email: `${tag}@example.invalid`,
        name: `Pessoa ${tag}`,
        password: bcrypt.hashSync(SENHA, 4),
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        cpf: null,
        systemAccesses: { create: { systemKey: 'analytics' } },
        ...extra,
      },
    });
    pessoas[tag] = u;
    return u;
  }

  /** GET /auth do cliente; devolve a resposta (303 para a tela ou para o cliente). */
  function autorizar(
    pote: Pote,
    clientId: 'hub' | 'sistema',
    p = pkce(),
    extra: Record<string, string> = {},
  ) {
    return request(srv)
      .get('/oidc/auth')
      .set('Cookie', pote.header())
      .query({
        client_id: clientId,
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: clientId === 'hub' ? CB_HUB : CB_SIS,
        code_challenge: p.challenge,
        code_challenge_method: 'S256',
        state: p.state,
        nonce: p.nonce,
        ...extra,
      })
      .then((r) => pote.guardar(r));
  }

  const uidDa = (location: string) =>
    /\/interaction\/([^/?]+)/.exec(location)![1];

  /** Segue os redirects do provedor até o redirect_uri do cliente. */
  async function ateOCliente(pote: Pote, location: string) {
    let loc = location;
    for (let i = 0; i < 5 && loc.startsWith(ISSUER); i++) {
      const r = pote.guardar(
        await request(srv).get(local(ISSUER, loc)).set('Cookie', pote.header()),
      );
      expect(r.status).toBe(303);
      loc = r.headers.location;
    }
    return new URL(loc);
  }

  /** Login por senha na interação; devolve a URL final no cliente. */
  async function loginSenha(
    pote: Pote,
    clientId: 'hub' | 'sistema',
    email: string,
    senha = SENHA,
    p = pkce(),
    xff?: string,
  ) {
    const a = await autorizar(pote, clientId, p);
    expect(a.status).toBe(303);
    const uid = uidDa(a.headers.location);
    let post = request(srv)
      .post(`/oidc/interaction/${uid}/login`)
      .set('Cookie', pote.header())
      .type('form')
      .send({ email, password: senha });
    if (xff) post = post.set('X-Forwarded-For', xff);
    const l = pote.guardar(await post);
    expect(l.status).toBe(303);
    if (!l.headers.location.startsWith(ISSUER))
      return { uid, final: null, location: l.headers.location };
    return {
      uid,
      final: await ateOCliente(pote, l.headers.location),
      location: '',
    };
  }

  function trocar(clientId: 'hub' | 'sistema', corpo: Record<string, string>) {
    return request(srv)
      .post('/oidc/token')
      .auth(clientId, SEGREDO[clientId])
      .type('form')
      .send(corpo);
  }

  async function codeParaTokens(
    clientId: 'hub' | 'sistema',
    final: URL,
    verifier: string,
  ) {
    return trocar(clientId, {
      grant_type: 'authorization_code',
      code: final.searchParams.get('code')!,
      redirect_uri: clientId === 'hub' ? CB_HUB : CB_SIS,
      code_verifier: verifier,
    });
  }

  const ultimoEvento = (action: string) =>
    db.auditEvent.findFirst({ where: { action }, orderBy: { id: 'desc' } });

  beforeAll(async () => {
    url = novoSchema('td2');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.oidcClient.createMany({
      data: [
        { clientId: 'hub', name: 'HUB', redirectUris: [CB_HUB] },
        {
          clientId: 'sistema',
          name: 'Sistema com flag',
          systemKey: 'analytics',
          redirectUris: [CB_SIS],
          postLogoutRedirectUris: ['https://sistema.exemplo.invalid/saiu'],
        },
      ],
    });
    await pessoa('ana');
    await pessoa('bia');
    await pessoa('inativa', { status: 'INACTIVE' });
    await pessoa('semflag', { systemAccesses: undefined });
    await pessoa('trava');
    await pessoa('ida');
    await pessoa('reuso');
    await pessoa('refresh');

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
    ({ app } = await subirComoMain(google));
    srv = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    espioes.forEach((e) => e.mockRestore());
    for (const k of Object.keys(VARS)) delete process.env[k];
    await db.$disconnect();
    await apagarSchema(url);
  });

  it('tela mínima (homologação): o /auth sem sessão leva à interação, e a tela tem o formulário', async () => {
    const pote = new Pote();
    const a = await autorizar(pote, 'hub');
    expect(a.status).toBe(303);
    expect(a.headers.location).toMatch(/^\/auth\/oidc\/interaction\/[^/?]+$/);
    const t = await request(srv)
      .get(local(ISSUER, a.headers.location))
      .set('Cookie', pote.header())
      .expect(200);
    expect(t.text).toContain(
      `action="/auth/oidc/interaction/${uidDa(a.headers.location)}/login"`,
    );
    expect(t.headers['cache-control']).toBe('no-store');
    expect(t.text).not.toContain('<script');
  });

  it('7 e (a) (f) 11. senha certa → code → tokens pelo /token (corpo do formulário); id_token RS256 com o kid da 1ª chave e só sub/email/email_verified/name', async () => {
    const pote = new Pote();
    const p = pkce();
    const { final } = await loginSenha(
      pote,
      'hub',
      pessoas.ana.email,
      SENHA,
      p,
    );
    expect(final!.origin + final!.pathname).toBe(CB_HUB);
    expect(final!.searchParams.get('state')).toBe(p.state);
    expect(final!.searchParams.get('iss')).toBe(ISSUER);

    const t = await codeParaTokens('hub', final!, p.verifier);
    expect(t.status).toBe(200);
    expect(t.body.refresh_token).toBeTruthy();
    const { header, payload } = lerJwt(t.body.id_token);
    expect(header).toMatchObject({ alg: 'RS256', kid: 'chave-nova' });
    expect(payload).toMatchObject({
      iss: ISSUER,
      aud: 'hub',
      nonce: p.nonce,
      sub: pessoas.ana.publicId,
      email: pessoas.ana.email,
      email_verified: false,
      name: 'Pessoa ana',
    });
    expect(payload.exp - payload.iat).toBe(600);
    for (const proibida of ['cpf', 'role', 'unit', 'password', 'id'])
      expect(payload).not.toHaveProperty(proibida);
    expect(String(payload.sub)).not.toBe(String(pessoas.ana.id));

    const ev = await ultimoEvento('oidc.login');
    expect(ev).toMatchObject({ targetUserId: pessoas.ana.id });
    expect(ev!.metadata).toMatchObject({ method: 'password', clientId: 'hub' });
    // (a) o provedor leu o corpo cru (sem o aviso de corpo já lido).
    expect(logs.join('\n')).not.toMatch(/already parsed request body/);
  });

  it('7 e (b). senha errada → volta à tela com erro genérico; o bloqueio é o MESMO da 1c; a auditoria usa o IP do Express, nunca o X-Forwarded-For', async () => {
    const pote = new Pote();
    const r = await loginSenha(
      pote,
      'hub',
      pessoas.trava.email,
      'senha-errada-000',
      pkce(),
      IP_FORJADO,
    );
    expect(r.final).toBeNull();
    expect(r.location).toBe(`/auth/oidc/interaction/${r.uid}?erro=credenciais`);
    const t = await request(srv)
      .get(local(ISSUER, r.location))
      .set('Cookie', pote.header())
      .expect(200);
    expect(t.text).toContain('E-mail ou senha incorretos');

    const falha = await ultimoEvento('login.failed');
    expect(falha!.targetUserId).toBe(pessoas.trava.id);
    expect(falha!.ip).toBeTruthy();
    expect(falha!.ip).not.toContain(IP_FORJADO);

    for (let i = 1; i < MAX_FAILURES; i++) {
      await loginSenha(
        new Pote(),
        'hub',
        pessoas.trava.email,
        'senha-errada-000',
      );
    }
    const u = await db.user.findUnique({ where: { id: pessoas.trava.id } });
    expect(u!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    // Bloqueada: até a senha CERTA volta com o mesmo erro genérico.
    const certa = await loginSenha(new Pote(), 'hub', pessoas.trava.email);
    expect(certa.location).toContain('erro=credenciais');
  });

  it('8. pessoa INATIVA → access_denied no cliente, sem code, com auditoria', async () => {
    const pote = new Pote();
    const { final: fim } = await loginSenha(pote, 'hub', pessoas.inativa.email);
    expect(fim!.origin + fim!.pathname).toBe(CB_HUB);
    expect(fim!.searchParams.get('error')).toBe('access_denied');
    expect(fim!.searchParams.get('code')).toBeNull();
    const ev = await ultimoEvento('oidc.denied.inactive');
    expect(ev!.targetUserId).toBe(pessoas.inativa.id);
  });

  it('8. cliente com systemKey e pessoa SEM a flag → access_denied (no hub, sem flag exigida, entra)', async () => {
    const pote = new Pote();
    const { final } = await loginSenha(pote, 'sistema', pessoas.semflag.email);
    expect(final!.origin + final!.pathname).toBe(CB_SIS);
    expect(final!.searchParams.get('error')).toBe('access_denied');
    const ev = await ultimoEvento('oidc.denied.no_flag');
    expect(ev).toMatchObject({
      targetUserId: pessoas.semflag.id,
      systemKey: 'analytics',
    });
    const hub = await loginSenha(new Pote(), 'hub', pessoas.semflag.email);
    expect(hub.final!.searchParams.get('code')).toBeTruthy();
  });

  it('13. SSO: depois do login no hub, o sistema recebe o code SEM pedir senha', async () => {
    const pote = new Pote();
    await loginSenha(pote, 'hub', pessoas.bia.email);
    expect(pote.tem('hub_sso')).toBe(true);
    const p = pkce();
    const a = await autorizar(pote, 'sistema', p);
    expect(a.status).toBe(303);
    const fim = new URL(a.headers.location);
    expect(fim.origin + fim.pathname).toBe(CB_SIS);
    const t = await codeParaTokens('sistema', fim, p.verifier);
    expect(t.status).toBe(200);
    expect(lerJwt(t.body.id_token).payload.sub).toBe(pessoas.bia.publicId);
  });

  it('(d) SSO por 24 h de INATIVIDADE: cada uso empurra a validade para +24 h; sem uso por 24 h, pede login de novo', async () => {
    const pote = new Pote();
    await loginSenha(pote, 'hub', pessoas.ida.email);
    const sessao = () =>
      db.oidcPayload.findFirst({
        where: { type: 'Session', accountId: pessoas.ida.publicId },
      });
    const s1 = await sessao();
    const resto = (s1!.expiresAt!.getTime() - Date.now()) / 1000;
    expect(resto).toBeGreaterThan(INATIVIDADE_MAX - 120);
    expect(resto).toBeLessThanOrEqual(INATIVIDADE_MAX);

    // Simula 24 h sem uso: a sessão venceu → o /auth volta a pedir login.
    await db.oidcPayload.update({
      where: { id_type: { id: s1!.id, type: 'Session' } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const a = await autorizar(pote, 'hub');
    expect(a.headers.location).toMatch(/\/interaction\//);
  });

  it('(d) SSO por 7 dias no MÁXIMO: perto dos 7 dias do login, o uso não estica além deles', async () => {
    const pote = new Pote();
    await loginSenha(pote, 'hub', pessoas.ida.email);
    const s = await db.oidcPayload.findFirst({
      where: { type: 'Session', accountId: pessoas.ida.publicId },
      orderBy: { expiresAt: 'desc' },
    });
    const payload = s!.payload as Record<string, any>;
    const quase7 = Math.floor(Date.now() / 1000) - (7 * 24 * 3600 - 90);
    await db.oidcPayload.update({
      where: { id_type: { id: s!.id, type: 'Session' } },
      data: { payload: { ...payload, loginTs: quase7 } },
    });
    const a = await autorizar(pote, 'hub');
    expect(new URL(a.headers.location).searchParams.get('code')).toBeTruthy();
    const depois = await db.oidcPayload.findUnique({
      where: { id_type: { id: s!.id, type: 'Session' } },
    });
    const resto = (depois!.expiresAt!.getTime() - Date.now()) / 1000;
    expect(resto).toBeLessThanOrEqual(90);
    expect(ttlDaSessao(quase7)).toBeLessThanOrEqual(90);
    expect(ttlDaSessao(undefined)).toBe(INATIVIDADE_MAX);
  });

  it('9. refresh rotativo; depois de revogar a flag do sistema → invalid_grant, grant revogado e auditoria', async () => {
    const p = pkce();
    const { final } = await loginSenha(
      new Pote(),
      'sistema',
      pessoas.refresh.email,
      SENHA,
      p,
    );
    const t = await codeParaTokens('sistema', final!, p.verifier);
    expect(t.status).toBe(200);
    const r1 = await trocar('sistema', {
      grant_type: 'refresh_token',
      refresh_token: t.body.refresh_token,
    });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(t.body.refresh_token);
    const grantId = (await db.oidcPayload.findFirst({
      where: { type: 'RefreshToken', accountId: pessoas.refresh.publicId },
    }))!.grantId;

    await db.systemAccess.updateMany({
      where: { userId: pessoas.refresh.id, systemKey: 'analytics' },
      data: { revokedAt: new Date() },
    });
    const r2 = await trocar('sistema', {
      grant_type: 'refresh_token',
      refresh_token: r1.body.refresh_token,
    });
    expect(r2.status).toBe(400);
    expect(r2.body.error).toBe('invalid_grant');
    expect(await db.oidcPayload.count({ where: { grantId } })).toBe(0);
    const ev = await ultimoEvento('oidc.denied.no_flag');
    expect(ev!.metadata).toMatchObject({ clientId: 'sistema', etapa: 'token' });
  });

  it('9. refresh depois de INATIVAR a pessoa → invalid_grant', async () => {
    const p = pkce();
    const u = await pessoa('vai-sair');
    const { final } = await loginSenha(new Pote(), 'hub', u.email, SENHA, p);
    const t = await codeParaTokens('hub', final!, p.verifier);
    await db.user.update({ where: { id: u.id }, data: { status: 'INACTIVE' } });
    const r = await trocar('hub', {
      grant_type: 'refresh_token',
      refresh_token: t.body.refresh_token,
    });
    expect(r.body.error).toBe('invalid_grant');
  });

  it('10. code reusado → recusa', async () => {
    const p = pkce();
    const { final } = await loginSenha(
      new Pote(),
      'hub',
      pessoas.reuso.email,
      SENHA,
      p,
    );
    expect((await codeParaTokens('hub', final!, p.verifier)).status).toBe(200);
    const de_novo = await codeParaTokens('hub', final!, p.verifier);
    expect(de_novo.status).toBe(400);
    expect(de_novo.body.error).toBe('invalid_grant');
  });

  it('4. verifier errado → recusa; 5. redirect_uri diferente (só a barra final) → recusa SEM redirecionar', async () => {
    const p = pkce();
    const { final } = await loginSenha(
      new Pote(),
      'hub',
      pessoas.ana.email,
      SENHA,
      p,
    );
    const errado = await codeParaTokens('hub', final!, pkce().verifier);
    expect(errado.body.error).toBe('invalid_grant');

    const r = await autorizar(new Pote(), 'hub', pkce(), {
      redirect_uri: `${CB_HUB}/`,
    });
    expect(r.status).toBe(400);
    expect(r.headers.location).toBeUndefined();
  });

  it('cancelar na tela → access_denied no cliente', async () => {
    const pote = new Pote();
    const a = await autorizar(pote, 'hub');
    const uid = uidDa(a.headers.location);
    const c = pote.guardar(
      await request(srv)
        .post(`/oidc/interaction/${uid}/abort`)
        .set('Cookie', pote.header()),
    );
    const fim = await ateOCliente(pote, c.headers.location);
    expect(fim.searchParams.get('error')).toBe('access_denied');
  });

  describe('12. Google dentro do login central (Google falso, regras reais da 1c)', () => {
    async function iniciarGoogle(pote: Pote) {
      const a = await autorizar(pote, 'hub');
      const uid = uidDa(a.headers.location);
      const g = pote.guardar(
        await request(srv)
          .post(`/oidc/interaction/${uid}/google`)
          .set('Cookie', pote.header()),
      );
      expect(g.status).toBe(303);
      expect(g.headers.location).toMatch(/^https:\/\/accounts\.google\.test\//);
      return { uid, state: google.ultimoState };
    }

    const callback = (pote: Pote, q: Record<string, string>) =>
      request(srv)
        .get('/oidc/google/callback')
        .set('Cookie', pote.header())
        .query(q)
        .then((r) => pote.guardar(r));

    it('pessoa existente (e-mail gmail) → vincula e conclui a interação certa → code', async () => {
      const u = await pessoa('gabi', { email: 'gabi.teste@gmail.com' });
      const pote = new Pote();
      const { state } = await iniciarGoogle(pote);
      google.claims.set('c-gabi', { sub: 'g-sub-gabi', email: u.email });
      const r = await callback(pote, { code: 'c-gabi', state });
      expect(r.status).toBe(303);
      const fim = await ateOCliente(pote, r.headers.location);
      expect(fim.searchParams.get('code')).toBeTruthy();
      const ev = await ultimoEvento('oidc.login');
      expect(ev!.metadata).toMatchObject({ method: 'google' });
    });

    it('sem convite → volta à tela com a mensagem da 1c (a interação continua)', async () => {
      const pote = new Pote();
      const { uid, state } = await iniciarGoogle(pote);
      google.claims.set('c-nova', {
        sub: 'g-sub-nova',
        email: 'ninguem.teste@gmail.com',
      });
      const r = await callback(pote, { code: 'c-nova', state });
      expect(r.headers.location).toBe(
        `/auth/oidc/interaction/${uid}?erro=no_invite`,
      );
    });

    it('state forjado → recusa (400), sem concluir nada', async () => {
      const pote = new Pote();
      await iniciarGoogle(pote);
      const r = await callback(pote, { code: 'x', state: 'forjado' });
      expect(r.status).toBe(400);
    });

    it('uid forjado: estado de OUTRA interação + cookie desta → recusa (400)', async () => {
      const a = new Pote();
      const b = new Pote();
      const ga = await iniciarGoogle(a);
      await iniciarGoogle(b);
      // Cookie do Google de A, mas o cookie de interação de B.
      const misto = new Pote();
      misto.guardar({
        headers: {
          'set-cookie': a
            .header()
            .split('; ')
            .filter((c) => c.startsWith('hub_g_oauth='))
            .concat(
              b
                .header()
                .split('; ')
                .filter((c) => c.startsWith('hub_interaction')),
            ),
        },
      } as any);
      google.claims.set('c-misto', {
        sub: 'g-sub-x',
        email: 'x.teste@gmail.com',
      });
      const r = await callback(misto, { code: 'c-misto', state: ga.state });
      expect(r.status).toBe(400);
    });
  });

  describe('(c) e (e): configuração explícita, CORS e páginas', () => {
    it('(c) discovery: só client_secret_basic; sem registration, introspection, revocation', async () => {
      const d = (
        await request(srv).get('/oidc/.well-known/openid-configuration')
      ).body;
      expect(d.token_endpoint_auth_methods_supported).toEqual([
        'client_secret_basic',
      ]);
      expect(d).not.toHaveProperty('registration_endpoint');
      expect(d).not.toHaveProperty('introspection_endpoint');
      expect(d).not.toHaveProperty('revocation_endpoint');
      expect(d.end_session_endpoint).toBe(`${ISSUER}/session/end`);
      expect(d.claims_supported).toEqual(
        expect.arrayContaining(['sub', 'email', 'email_verified', 'name']),
      );
    });

    it('(c) client_secret_post é recusado no /token', async () => {
      const r = await request(srv).post('/oidc/token').type('form').send({
        grant_type: 'refresh_token',
        refresh_token: 'x',
        client_id: 'hub',
        client_secret: SEGREDO.hub,
      });
      expect(r.status).toBe(401);
      expect(r.body.error).toBe('invalid_client');
    });

    it('(e) o /oidc NÃO herda o CORS das rotas /api (origem de fora não quebra nem ganha credenciais)', async () => {
      const r = await request(srv)
        .get('/oidc/.well-known/openid-configuration')
        .set('Origin', 'https://atacante.invalid')
        .expect(200);
      expect(r.headers['access-control-allow-credentials']).toBeUndefined();
      const t = await request(srv)
        .post('/oidc/token')
        .set('Origin', 'https://atacante.invalid')
        .auth('hub', SEGREDO.hub)
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: 'x' });
      // Chamada de navegador ao /token: recusada (clientBasedCORS = false).
      expect(t.status).toBe(400);
      expect(t.body.error).toBe('invalid_request');
      expect(t.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('(e) CSP próprio no /oidc (form-action com as origens dos clientes); página de logout e de erro em pt, sem script', async () => {
      // Com sessão: a tela de confirmação, em pt e sem script.
      const pote = new Pote();
      await loginSenha(pote, 'hub', pessoas.bia.email);
      const r = await request(srv)
        .get('/oidc/session/end')
        .set('Cookie', pote.header())
        .expect(200);
      const csp = r.headers['content-security-policy'];
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toMatch(
        /form-action 'self' .*https:\/\/hub\.exemplo\.invalid/,
      );
      expect(csp).toContain('https://sistema.exemplo.invalid');
      expect(csp).toContain('https://accounts.google.com');
      expect(r.text).toContain('Sair de todos os sistemas da LHG?');
      expect(r.text).not.toContain('<script');
      expect(r.text).not.toContain('fonts.googleapis');

      // Sem sessão: a página que se envia sozinha tem o hash do script no CSP.
      const auto = await request(srv).get('/oidc/session/end').expect(200);
      const cspAuto = auto.headers['content-security-policy'];
      expect(auto.text).toContain('<script>');
      expect(cspAuto).toMatch(
        /script-src 'report-sample' 'sha256-[A-Za-z0-9+/=]+'/,
      );

      const e = await request(srv).get('/oidc/auth').query({ client_id: 'x' });
      expect(e.status).toBe(400);
      expect(e.text).toContain('Não foi possível continuar');
      expect(e.text).not.toContain('<script');
    });

    it('(e) as rotas /api continuam com o CORS e o helmet de antes', async () => {
      const r = await request(srv)
        .post('/api/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: pessoas.ana.email, password: SENHA })
        .expect(200);
      expect(r.headers['access-control-allow-credentials']).toBe('true');
      expect(r.headers['content-security-policy']).toContain(
        "default-src 'self'",
      );
    });
  });

  it('limpeza: limparVencidos remove só os registros vencidos', async () => {
    await db.oidcPayload.createMany({
      data: [
        {
          id: 'velho',
          type: 'Interaction',
          payload: {},
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          id: 'novo',
          type: 'Interaction',
          payload: {},
          expiresAt: new Date(Date.now() + 60000),
        },
      ],
    });
    expect(await limparVencidos(db as any)).toBeGreaterThanOrEqual(1);
    expect(
      await db.oidcPayload.count({
        where: { id: 'velho', type: 'Interaction' },
      }),
    ).toBe(0);
    expect(
      await db.oidcPayload.count({
        where: { id: 'novo', type: 'Interaction' },
      }),
    ).toBe(1);
  });

  it('19. nenhum code, token, senha ou segredo apareceu em log', () => {
    const tudo = logs.join('\n');
    for (const s of [
      SENHA,
      SEGREDO.hub,
      SEGREDO.sistema,
      ...VARS.OIDC_COOKIE_KEYS.split(','),
      String(K1.d),
      String(K2.d),
      'segredo-de-teste-do-google',
    ])
      expect(tudo.includes(s)).toBe(false);
    expect(tudo).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./); // nenhum JWT
    expect(tudo).toContain('google=ok tela=mínima(homologação)');
  });
});

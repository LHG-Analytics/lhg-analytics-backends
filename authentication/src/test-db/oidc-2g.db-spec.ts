// 2g: administração de pessoas e convites pelo portal, em /oidc/hub/admin/*.
// Bearer do cliente 'hub' + x-hub-proxy-key + ADMIN da LHG conferido no banco
// a cada chamada; login recente para inativar e mudar acesso; travas do
// admin; saídas sem hash, CPF nem googleSub; auditoria com o admin como ator
// e o IP real. No banco migrado de verdade, com o app montado como o main.ts.
// Chaves e segredos de TESTE gerados aqui, na hora.
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { InvitationsService } from '../invitations/invitations.service';
import { mascararIp } from '../oidc/oidc-hub-admin';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { Pote, fluxo, subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const IP = '203.0.113.7';
const segredo = () => crypto.randomBytes(32).toString('hex');
const CHAVE = segredo();
const CLIENTES = {
  hub: {
    segredo: segredo(),
    redirect: 'https://hub.exemplo.invalid/api/auth/callback',
  },
  teste: { segredo: segredo(), redirect: 'https://teste.exemplo.invalid/cb' },
};
const VARS = {
  OIDC_ISSUER: ISSUER,
  OIDC_JWKS: JSON.stringify({
    keys: [
      {
        ...crypto
          .generateKeyPairSync('rsa', { modulusLength: 2048 })
          .privateKey.export({ format: 'jwk' }),
        kid: 'chave-nova',
      },
    ],
  }),
  OIDC_COOKIE_KEYS: [segredo(), segredo()].join(','),
  OIDC_CLIENT_SECRET_HUB: CLIENTES.hub.segredo,
  OIDC_CLIENT_SECRET_TESTE: CLIENTES.teste.segredo,
  OIDC_MINIMAL_LOGIN_PAGE: 'true',
  HUB_PROXY_KEY: CHAVE,
  INVITE_LINK_BASE_URL: 'https://hub.exemplo.invalid/convite',
};
const CPF = '52998224725';

describe('2g: admin do HUB por Bearer (/oidc/hub/admin/*)', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let f: ReturnType<typeof fluxo>;
  const espioes: jest.SpyInstance[] = [];
  let n = 0;

  async function pessoa(
    tag: string,
    dados: { role?: any; unit?: any; systems?: string[]; cpf?: string } = {},
  ) {
    return db.user.create({
      data: {
        email: `${tag}-${++n}@example.invalid`,
        name: `Pessoa ${tag}`,
        password: bcrypt.hashSync(SENHA, 4),
        role: dados.role ?? 'GERENTE_GERAL',
        unit: dados.unit ?? 'TOUT',
        cpf: dados.cpf ?? null,
        googleSub: `sub-${tag}-${n}`,
        googleLinkedAt: new Date(),
        systemAccesses: {
          create: (dados.systems ?? ['analytics']).map((systemKey) => ({
            systemKey,
          })),
        },
      },
    });
  }
  const admin = (tag: string) =>
    pessoa(tag, { role: 'ADMIN', unit: 'LHG', systems: ['analytics'] });
  /** Access token do 'hub' (login por senha). */
  async function tokenDo(email: string) {
    const { tokens } = await f.entrar(new Pote(), 'hub', email, SENHA);
    return tokens.access_token as string;
  }
  /** Chamada como o servidor do HUB: Bearer + chave do proxy + IP real. */
  const chamar = (
    m: 'get' | 'post' | 'put' | 'delete',
    caminho: string,
    token?: string,
    corpo?: unknown,
    chave: string | null = CHAVE,
  ) => {
    let r = request(srv)[m](`/oidc/hub/admin${caminho}`);
    if (chave) r = r.set('x-hub-proxy-key', chave).set('x-hub-client-ip', IP);
    if (token) r = r.set('Authorization', `Bearer ${token}`);
    return corpo === undefined ? r : r.send(corpo as object);
  };
  /** Envelhece o login da sessão SSO da pessoa (loginTs no passado). */
  const envelhecerLogin = (publicId: string, horas: number) =>
    db.$executeRaw`
      UPDATE "OidcPayload"
         SET payload = jsonb_set(payload::jsonb, '{loginTs}',
                       to_jsonb((extract(epoch from now())::int - ${horas * 3600}::int)))
       WHERE type = 'Session' AND "accountId" = ${publicId}`;
  const ultimos = (action: string, targetUserId?: number) =>
    db.auditEvent.findMany({
      where: { action, ...(targetUserId && { targetUserId }) },
      orderBy: { id: 'desc' },
    });
  /** Nenhum segredo na resposta (hash, CPF, googleSub). */
  function semSegredos(body: unknown) {
    const t = JSON.stringify(body);
    expect(t).not.toMatch(/\$2[aby]\$/);
    expect(t).not.toContain(CPF);
    expect(t).not.toMatch(/"(password|cpf|googleSub|tokenHash|token)"/);
    expect(t).not.toContain('sub-');
  }

  beforeAll(async () => {
    url = novoSchema('t2g');
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
          clientId: 'teste',
          name: 'Teste',
          systemKey: 'analytics',
          redirectUris: [CLIENTES.teste.redirect],
        },
      ],
    });
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      espioes.push(jest.spyOn(Logger.prototype, m).mockImplementation());
    }
    for (const m of ['log', 'warn', 'error', 'info'] as const) {
      espioes.push(jest.spyOn(console, m).mockImplementation());
    }
    Object.assign(process.env, VARS);
    ({ app } = await subirComoMain(undefined, {
      providers: [InvitationsService],
    }));
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

  describe('autenticação e autorização (a cada chamada)', () => {
    it('GET /eu diz se a pessoa é ADMIN da LHG (o portal mostra ou esconde o menu)', async () => {
      const a = await admin('eu-admin');
      const g = await pessoa('eu-gerente');
      const ra = await chamar('get', '/eu', await tokenDo(a.email)).expect(200);
      expect(ra.body).toEqual({ id: a.publicId, nome: a.name, admin: true });
      expect(ra.headers['cache-control']).toBe('no-store');
      const rg = await chamar('get', '/eu', await tokenDo(g.email)).expect(200);
      expect(rg.body.admin).toBe(false);
    });

    it('sem a chave do proxy, chave errada, sem token, token inventado ou de outro cliente → 401', async () => {
      const a = await admin('auth');
      const t = await tokenDo(a.email);
      const semChave = await chamar('get', '/eu', t, undefined, null);
      expect(semChave.status).toBe(401);
      expect(semChave.body.code).toBe('PROXY_KEY_REQUIRED');
      const errada = await chamar('get', '/eu', t, undefined, segredo());
      expect(errada.body.code).toBe('PROXY_KEY_REQUIRED');
      expect((await chamar('get', '/eu')).body.code).toBe('INVALID_TOKEN');
      const inventado = await chamar('get', '/eu', 'x'.repeat(43));
      expect(inventado.status).toBe(401);
      expect(inventado.headers['www-authenticate']).toMatch(/^Bearer/);
      const { tokens } = await f.entrar(new Pote(), 'teste', a.email, SENHA);
      const outro = await chamar('get', '/eu', tokens.access_token);
      expect(outro.status).toBe(401);
      expect(outro.body.code).toBe('INVALID_TOKEN');
    });

    it('não admin, ADMIN de outra unidade → 403 FORBIDDEN_NOT_ADMIN', async () => {
      const g = await pessoa('naoadmin');
      const adminTout = await pessoa('admintout', {
        role: 'ADMIN',
        unit: 'TOUT',
      });
      for (const p of [g, adminTout]) {
        const r = await chamar('get', '/pessoas', await tokenDo(p.email));
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('FORBIDDEN_NOT_ADMIN');
      }
    });

    it('rebaixado ou inativado no MEIO da validade do token: vale na chamada seguinte', async () => {
      const a = await admin('rebaixa');
      const t = await tokenDo(a.email);
      await chamar('get', '/pessoas', t).expect(200);
      await db.user.update({
        where: { id: a.id },
        data: { role: 'GERENTE_GERAL' },
      });
      expect((await chamar('get', '/pessoas', t)).body.code).toBe(
        'FORBIDDEN_NOT_ADMIN',
      );
      expect((await chamar('get', '/eu', t)).body.admin).toBe(false);
      await db.user.update({
        where: { id: a.id },
        data: { role: 'ADMIN', status: 'INACTIVE' },
      });
      expect((await chamar('get', '/eu', t)).status).toBe(401);
    });

    it('rota inexistente → 404 JSON; JSON inválido → 400 INVALID_BODY', async () => {
      const t = await tokenDo((await admin('rotas')).email);
      const r = await chamar('get', '/nada', t).expect(404);
      expect(r.body.code).toBe('NOT_FOUND');
      const q = await request(srv)
        .put('/oidc/hub/admin/pessoas/x/sistemas')
        .set('x-hub-proxy-key', CHAVE)
        .set('Authorization', `Bearer ${t}`)
        .set('Content-Type', 'application/json')
        .send('{quebrado');
      expect(q.status).toBe(400);
      expect(q.body.code).toBe('INVALID_BODY');
    });
  });

  describe('pessoas: listar, detalhar, histórico (saídas sem segredos)', () => {
    it('listar: flags, bloqueio, busca e página; sem hash, CPF nem googleSub', async () => {
      const a = await admin('lista-admin');
      const alvo = await pessoa('lista-alvo', {
        cpf: CPF,
        systems: ['analytics', 'rm'],
      });
      await db.user.update({
        where: { id: alvo.id },
        data: { lockedUntil: new Date(Date.now() + 10 * 60 * 1000) },
      });
      const r = await chamar(
        'get',
        '/pessoas?busca=lista-alvo',
        await tokenDo(a.email),
      ).expect(200);
      expect(r.body.total).toBe(1);
      expect(r.body.porPagina).toBe(50);
      expect(r.body.pessoas[0]).toMatchObject({
        id: alvo.publicId,
        email: alvo.email,
        status: 'ACTIVE',
        sistemas: ['analytics', 'rm'],
        googleVinculado: true,
        emailVerificado: false,
      });
      expect(r.body.pessoas[0].bloqueadaAte).toBeTruthy();
      semSegredos(r.body);
      const todos = await chamar(
        'get',
        '/pessoas?status=ativos',
        await tokenDo(a.email),
      ).expect(200);
      semSegredos(todos.body);
      expect(todos.body.pessoas.every((p: any) => p.status === 'ACTIVE')).toBe(
        true,
      );
    });

    it('detalhar: acessos com quem concedeu, e-mails secundários; id inválido → 404', async () => {
      const a = await admin('det-admin');
      const alvo = await pessoa('det-alvo', { cpf: '11144477735' });
      await db.userEmail.create({
        data: { userId: alvo.id, email: `sec-${alvo.id}@example.invalid` },
      });
      const t = await tokenDo(a.email);
      const r = await chamar('get', `/pessoas/${alvo.publicId}`, t).expect(200);
      expect(r.body.acessos).toEqual([
        expect.objectContaining({ sistema: 'analytics', concedidoPor: null }),
      ]);
      expect(r.body.emailsSecundarios).toEqual([
        { email: `sec-${alvo.id}@example.invalid`, verificado: false },
      ]);
      expect(r.body.conviteDeOrigem).toBeNull();
      expect(JSON.stringify(r.body)).not.toContain('11144477735');
      semSegredos(r.body);
      expect((await chamar('get', '/pessoas/123', t)).status).toBe(404);
      expect(
        (await chamar('get', `/pessoas/${crypto.randomUUID()}`, t)).status,
      ).toBe(404);
    });

    it('histórico: eventos da pessoa (como alvo e como ator), IP mascarado, só metadata permitida', async () => {
      const a = await admin('hist-admin');
      const alvo = await pessoa('hist-alvo');
      await db.auditEvent.create({
        data: {
          action: 'teste.evento',
          targetUserId: alvo.id,
          actorUserId: a.id,
          ip: '198.51.100.23',
          metadata: {
            method: 'google',
            segredo: 'nao-pode-sair',
            invitationId: 3,
          },
        },
      });
      const r = await chamar(
        'get',
        `/pessoas/${alvo.publicId}/historico`,
        await tokenDo(a.email),
      ).expect(200);
      const e = r.body.eventos.find((x: any) => x.acao === 'teste.evento');
      expect(e).toMatchObject({
        ip: '198.51.x.x',
        ator: { id: a.publicId, nome: a.name },
        alvo: { id: alvo.publicId, nome: alvo.name },
        detalhes: { method: 'google', invitationId: 3 },
      });
      expect(JSON.stringify(r.body)).not.toContain('nao-pode-sair');
      expect(r.body.proximo).toBeNull();
      // Paginação: "antes" de um id corta os mais novos.
      const p = await chamar(
        'get',
        `/pessoas/${alvo.publicId}/historico?antes=${e.id}`,
        await tokenDo(a.email),
      ).expect(200);
      expect(p.body.eventos.some((x: any) => x.id === e.id)).toBe(false);
      expect(mascararIp('2001:db8:1:2::5')).toBe('2001:db8:…');
    });
  });

  describe('sistemas em DELTA', () => {
    it('concede e revoga, com auditoria (ator = admin, IP real); o resultado volta', async () => {
      const a = await admin('delta-admin');
      const alvo = await pessoa('delta-alvo', { systems: ['analytics', 'rm'] });
      const r = await chamar(
        'put',
        `/pessoas/${alvo.publicId}/sistemas`,
        await tokenDo(a.email),
        {
          conceder: ['cms'],
          revogar: ['rm'],
        },
      ).expect(200);
      expect(r.body).toEqual({
        sistemas: ['analytics', 'cms'],
        concedidos: ['cms'],
        revogados: ['rm'],
      });
      const [g] = await ultimos('access.granted', alvo.id);
      const [v] = await ultimos('access.revoked', alvo.id);
      for (const ev of [g, v]) {
        expect(ev.actorUserId).toBe(a.id);
        expect(ev.ip).toBe(IP);
      }
      expect(g.systemKey).toBe('cms');
      expect(v.systemKey).toBe('rm');
    });

    it('duas mudanças AO MESMO TEMPO não se sobrescrevem', async () => {
      const a = await admin('conc-admin');
      const alvo = await pessoa('conc-alvo', { systems: [] });
      const t = await tokenDo(a.email);
      const [x, y] = await Promise.all([
        chamar('put', `/pessoas/${alvo.publicId}/sistemas`, t, {
          conceder: ['rm'],
        }),
        chamar('put', `/pessoas/${alvo.publicId}/sistemas`, t, {
          conceder: ['cms'],
        }),
      ]);
      expect([x.status, y.status]).toEqual([200, 200]);
      const ativos = await db.systemAccess.findMany({
        where: { userId: alvo.id, revokedAt: null },
      });
      expect(ativos.map((s) => s.systemKey).sort()).toEqual(['cms', 'rm']);
    });

    it('corpo inválido, sistema desconhecido, o mesmo nos dois lados, ou o admin tirando os PRÓPRIOS acessos → recusa', async () => {
      const a = await admin('delta-erro');
      const alvo = await pessoa('delta-erro-alvo');
      const t = await tokenDo(a.email);
      const p = `/pessoas/${alvo.publicId}/sistemas`;
      expect((await chamar('put', p, t, {})).body.code).toBe('INVALID_BODY');
      expect((await chamar('put', p, t, { conceder: 'cms' })).body.code).toBe(
        'INVALID_BODY',
      );
      expect(
        (await chamar('put', p, t, { conceder: ['cms'], revogar: ['cms'] }))
          .body.code,
      ).toBe('INVALID_BODY');
      const desconhecido = await chamar('put', p, t, {
        conceder: ['nao-existe'],
      });
      expect(desconhecido.status).toBe(400);
      const si = await chamar('put', `/pessoas/${a.publicId}/sistemas`, t, {
        revogar: ['analytics'],
      });
      expect(si.status).toBe(409);
      expect(si.body.code).toBe('SELF_ACCESS_CHANGE');
      // Conceder a si mesmo pode.
      await chamar('put', `/pessoas/${a.publicId}/sistemas`, t, {
        conceder: ['cms'],
      }).expect(200);
    });
  });

  describe('login recente (12 h) para inativar e mudar acesso', () => {
    it('login de 13 h atrás → 403 REAUTH_REQUIRED (sistemas e inativar); leitura, reativar e desbloquear seguem', async () => {
      const a = await admin('reauth');
      const alvo = await pessoa('reauth-alvo');
      const t = await tokenDo(a.email);
      await envelhecerLogin(a.publicId, 13);
      const s = await chamar('put', `/pessoas/${alvo.publicId}/sistemas`, t, {
        conceder: ['cms'],
      });
      expect(s.status).toBe(403);
      expect(s.body.code).toBe('REAUTH_REQUIRED');
      const i = await chamar('post', `/pessoas/${alvo.publicId}/inativar`, t);
      expect(i.body.code).toBe('REAUTH_REQUIRED');
      await chamar('get', `/pessoas/${alvo.publicId}`, t).expect(200);
      await chamar('post', `/pessoas/${alvo.publicId}/desbloquear`, t).expect(
        200,
      );
      // Com 11 h ainda vale.
      await envelhecerLogin(a.publicId, 11);
      await chamar('put', `/pessoas/${alvo.publicId}/sistemas`, t, {
        conceder: ['cms'],
      }).expect(200);
    });
  });

  describe('inativar, reativar, desbloquear (com as travas)', () => {
    it('inativar outra pessoa: INACTIVE, auditado com o admin; repetir não muda; reativar volta', async () => {
      const a = await admin('inat-admin');
      const alvo = await pessoa('inat-alvo');
      const t = await tokenDo(a.email);
      const r = await chamar(
        'post',
        `/pessoas/${alvo.publicId}/inativar`,
        t,
      ).expect(200);
      expect(r.body).toEqual({ status: 'INACTIVE', mudou: true });
      const [ev] = await ultimos('user.deactivated', alvo.id);
      expect(ev.actorUserId).toBe(a.id);
      expect(ev.ip).toBe(IP);
      expect(
        (await chamar('post', `/pessoas/${alvo.publicId}/inativar`, t)).body
          .mudou,
      ).toBe(false);
      const re = await chamar(
        'post',
        `/pessoas/${alvo.publicId}/reativar`,
        t,
      ).expect(200);
      expect(re.body).toEqual({ status: 'ACTIVE', mudou: true });
      expect((await ultimos('user.reactivated', alvo.id))[0].actorUserId).toBe(
        a.id,
      );
    });

    it('o admin NÃO inativa a si mesmo (SELF_DEACTIVATION)', async () => {
      const a = await admin('si');
      const r = await chamar(
        'post',
        `/pessoas/${a.publicId}/inativar`,
        await tokenDo(a.email),
      );
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('SELF_DEACTIVATION');
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: a.id } })).status,
      ).toBe('ACTIVE');
    });

    it('nunca fica SEM nenhum admin da LHG ativo: dois admins se inativando ao mesmo tempo → só um consegue', async () => {
      // Só estes dois admins da LHG ativos.
      await db.user.updateMany({
        where: { role: 'ADMIN', unit: 'LHG', status: 'ACTIVE' },
        data: { status: 'INACTIVE' },
      });
      const a = await admin('ultimo-a');
      const b = await admin('ultimo-b');
      const [ta, tb] = [await tokenDo(a.email), await tokenDo(b.email)];
      const [ra, rb] = await Promise.all([
        chamar('post', `/pessoas/${b.publicId}/inativar`, ta),
        chamar('post', `/pessoas/${a.publicId}/inativar`, tb),
      ]);
      const ok = [ra, rb].filter((r) => r.status === 200);
      const recusa = [ra, rb].filter((r) => r.status !== 200);
      expect(ok).toHaveLength(1);
      expect(recusa).toHaveLength(1);
      expect(['FORBIDDEN_NOT_ADMIN', 'LAST_ADMIN', 'INVALID_TOKEN']).toContain(
        recusa[0].body.code,
      );
      expect(
        await db.user.count({
          where: { role: 'ADMIN', unit: 'LHG', status: 'ACTIVE' },
        }),
      ).toBe(1);
    });

    it('desbloquear: zera o bloqueio, auditado com o admin', async () => {
      const a = await admin('desb-admin');
      const alvo = await pessoa('desb-alvo');
      await db.user.update({
        where: { id: alvo.id },
        data: {
          lockedUntil: new Date(Date.now() + 60 * 60 * 1000),
          lockLevel: 2,
        },
      });
      await chamar(
        'post',
        `/pessoas/${alvo.publicId}/desbloquear`,
        await tokenDo(a.email),
      ).expect(200);
      const u = await db.user.findUniqueOrThrow({ where: { id: alvo.id } });
      expect(u.lockedUntil).toBeNull();
      expect((await ultimos('login.unlocked', alvo.id))[0].actorUserId).toBe(
        a.id,
      );
    });
  });

  describe('convites', () => {
    it('criar (link só na resposta), listar por situação, novo link, revogar; sem token nem hash', async () => {
      const a = await admin('conv-admin');
      const t = await tokenDo(a.email);
      const email = `convidado-${Date.now()}@example.invalid`;
      const c = await chamar('post', '/convites', t, {
        email,
        nome: 'Convidado',
        sistemas: ['cms'],
        validade: '7',
      }).expect(201);
      expect(c.body.convite).toMatchObject({
        email,
        sistemas: ['cms'],
        situacao: 'pendente',
      });
      expect(c.body.link).toMatch(/^https:\/\/hub\.exemplo\.invalid\/convite#/);
      semSegredos(c.body.convite);
      expect(Object.keys(c.body).sort()).toEqual(['convite', 'link']);
      const [ev] = await ultimos('invite.created');
      expect(ev.actorUserId).toBe(a.id);
      expect(ev.ip).toBe(IP);

      const l = await chamar('get', '/convites?situacao=pendente', t).expect(
        200,
      );
      expect(l.body.convites.some((x: any) => x.id === c.body.convite.id)).toBe(
        true,
      );
      expect(l.body.convites.every((x: any) => x.situacao === 'pendente')).toBe(
        true,
      );
      semSegredos(l.body);

      const nl = await chamar(
        'post',
        `/convites/${c.body.convite.id}/novo-link`,
        t,
      ).expect(200);
      expect(nl.body.link).not.toBe(c.body.link);

      await chamar('delete', `/convites/${c.body.convite.id}`, t).expect(200);
      const de = await chamar('delete', `/convites/${c.body.convite.id}`, t);
      expect(de.status).toBe(409);
      expect(de.body.code).toBe('INVITE_NOT_PENDING');
      expect((await chamar('delete', '/convites/abc', t)).status).toBe(404);
    });

    it('validações: validade, analytics sem perfil, nunca sem motivo, e-mail que já existe', async () => {
      const a = await admin('conv-erro');
      const t = await tokenDo(a.email);
      const e = () =>
        `c-${Date.now()}-${Math.random().toString(36).slice(2)}@example.invalid`;
      expect(
        (
          await chamar('post', '/convites', t, {
            email: e(),
            sistemas: [],
            validade: '9',
          })
        ).body.code,
      ).toBe('INVALID_BODY');
      expect(
        (
          await chamar('post', '/convites', t, {
            email: e(),
            sistemas: ['analytics'],
            validade: '7',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await chamar('post', '/convites', t, {
            email: e(),
            sistemas: ['cms'],
            validade: 'nunca',
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await chamar('post', '/convites', t, {
            email: e(),
            sistemas: ['cms'],
            validade: '7',
            extra: 1,
          })
        ).status,
      ).toBe(400);
      const existe = await chamar('post', '/convites', t, {
        email: a.email,
        sistemas: ['cms'],
        validade: '7',
      });
      expect(existe.status).toBe(409);
      expect(existe.body.code).toBe('EMAIL_IN_USE');
      await chamar('post', '/convites', t, {
        email: e(),
        sistemas: ['analytics'],
        perfil: 'GERENTE_GERAL',
        unidade: 'LIV',
        validade: 'nunca',
        motivo: 'teste',
      }).expect(201);
    });
  });
});

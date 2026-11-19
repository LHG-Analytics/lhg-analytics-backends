// Admin do HUB: a permissão 'hub-admin' (flag em SystemAccess que não é
// sistema) e HUB_ADMIN_REGRA=perfil|flag. Com 'flag', o painel admin é de quem
// tem a permissão (não mais do ADMIN/LHG); nas duas regras só quem a tem dá ou
// tira; ninguém tira a própria; nunca fica zero admin do HUB (revogar ou
// inativar, por qualquer caminho, mesmo ao mesmo tempo); fora do convite, da
// API legada e do launcher. No banco migrado de verdade, com o app montado como
// o main.ts. Chaves e segredos de TESTE gerados aqui, na hora.
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { LauncherService } from '../access/launcher.service';
import { HUB_ADMIN, lerRegraDoAdmin } from '../access/permissoes';
import { InvitationsService } from '../invitations/invitations.service';
import { UsersService, travaHubAdmins } from '../users/users.service';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { Pote, fluxo, subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const IP = '203.0.113.8';
const segredo = () => crypto.randomBytes(32).toString('hex');

/** Um app inteiro (schema próprio) com a regra pedida. */
function ambiente(regra: 'flag' | 'perfil') {
  const CHAVE = segredo();
  const CLIENTES = {
    hub: {
      segredo: segredo(),
      redirect: 'https://hub.exemplo.invalid/api/auth/callback',
    },
  };
  const VARS: Record<string, string> = {
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
    OIDC_MINIMAL_LOGIN_PAGE: 'true',
    HUB_PROXY_KEY: CHAVE,
    INVITE_LINK_BASE_URL: 'https://hub.exemplo.invalid/convite',
    HUB_ADMIN_REGRA: regra,
  };
  const e = {
    url: '',
    db: null as unknown as ReturnType<typeof cliente>,
    app: null as unknown as INestApplication,
    f: null as unknown as ReturnType<typeof fluxo>,
    n: 0,
    async subir() {
      e.url = novoSchema(`thub${regra}`);
      expect(migrar(e.url).ok).toBe(true);
      process.env.SUPABASE_URL_USERS = e.url;
      e.db = cliente(e.url);
      await e.db.oidcClient.create({
        data: {
          clientId: 'hub',
          name: 'HUB',
          redirectUris: [CLIENTES.hub.redirect],
          postLogoutRedirectUris: ['https://hub.exemplo.invalid/'],
        },
      });
      Object.assign(process.env, VARS);
      ({ app: e.app } = await subirComoMain(undefined, {
        providers: [InvitationsService],
      }));
      e.f = fluxo(e.app.getHttpServer(), ISSUER, CLIENTES);
    },
    async descer() {
      await e.app?.close();
      for (const k of Object.keys(VARS)) delete process.env[k];
      await e.db.$disconnect();
      await apagarSchema(e.url);
    },
    pessoa(
      dados: {
        role?: any;
        unit?: any;
        systems?: string[];
      } = {},
    ) {
      return e.db.user.create({
        data: {
          email: `p-${regra}-${++e.n}@example.invalid`,
          name: `Pessoa ${e.n}`,
          password: bcrypt.hashSync(SENHA, 4),
          role: dados.role ?? 'GERENTE_GERAL',
          unit: dados.unit ?? 'TOUT',
          systemAccesses: {
            create: (dados.systems ?? ['analytics']).map((systemKey) => ({
              systemKey,
            })),
          },
        },
      });
    },
    async token(email: string) {
      const { tokens } = await e.f.entrar(new Pote(), 'hub', email, SENHA);
      return tokens.access_token as string;
    },
    chamar(
      m: 'get' | 'put' | 'post' | 'delete',
      caminho: string,
      token: string,
      corpo?: unknown,
    ) {
      const r = request(e.app.getHttpServer())
        [m](`/oidc/hub/admin${caminho}`)
        .set('x-hub-proxy-key', CHAVE)
        .set('x-hub-client-ip', IP)
        .set('Authorization', `Bearer ${token}`);
      return corpo === undefined ? r : r.send(corpo as object);
    },
    donos: () =>
      e.db.systemAccess.count({
        where: {
          systemKey: HUB_ADMIN,
          revokedAt: null,
          user: { status: 'ACTIVE' },
        },
      }),
    /** Sem nenhum admin do HUB ativo além dos que o teste criar. */
    zerar: () =>
      e.db.systemAccess.updateMany({
        where: { systemKey: HUB_ADMIN, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
  };
  return e;
}

const espioes: jest.SpyInstance[] = [];
beforeAll(() => {
  for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
    espioes.push(jest.spyOn(Logger.prototype, m).mockImplementation());
  }
});
afterAll(() => espioes.forEach((s) => s.mockRestore()));

it('HUB_ADMIN_REGRA: só "flag" (sem diferenciar maiúsculas) liga a flag; vazio ou outro valor → perfil', () => {
  expect(lerRegraDoAdmin('flag')).toBe('flag');
  expect(lerRegraDoAdmin(' FLAG ')).toBe('flag');
  for (const v of [undefined, '', 'perfil', 'sim', 'flags']) {
    expect(lerRegraDoAdmin(v)).toBe('perfil');
  }
});

describe("regra 'flag': o painel é de quem tem a permissão 'hub-admin'", () => {
  const e = ambiente('flag');
  beforeAll(() => e.subir());
  afterAll(() => e.descer());
  beforeEach(() => e.zerar());

  it("a migration cria o System 'hub-admin' sem cartão (launchUrl nula)", async () => {
    const s = await e.db.system.findUniqueOrThrow({
      where: { key: HUB_ADMIN },
    });
    expect(s).toMatchObject({
      active: true,
      launchUrl: null,
      name: 'Admin do HUB',
    });
  });

  it('/eu: admin pela flag e hubAdmin; ADMIN/LHG SEM a flag não usa o painel (403); com a flag, mesmo sem ser ADMIN, usa', async () => {
    const lhg = await e.pessoa({ role: 'ADMIN', unit: 'LHG' });
    const dono = await e.pessoa({ systems: ['analytics', HUB_ADMIN] });
    const tl = await e.token(lhg.email);
    expect((await e.chamar('get', '/eu', tl)).body).toMatchObject({
      admin: false,
      hubAdmin: false,
    });
    const r = await e.chamar('get', '/pessoas', tl);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('FORBIDDEN_NOT_ADMIN');
    const td = await e.token(dono.email);
    expect((await e.chamar('get', '/eu', td)).body).toMatchObject({
      admin: true,
      hubAdmin: true,
    });
    const p = await e
      .chamar('get', `/pessoas/${dono.publicId}`, td)
      .expect(200);
    expect(p.body.pessoa?.sistemas ?? p.body.sistemas).toContain(HUB_ADMIN);
  });

  it('dar e tirar pelo PUT de sistemas (auditado); ninguém tira a própria (SELF_ACCESS_CHANGE)', async () => {
    const a = await e.pessoa({ systems: ['analytics', HUB_ADMIN] });
    const b = await e.pessoa();
    const ta = await e.token(a.email);
    const dar = await e
      .chamar('put', `/pessoas/${b.publicId}/sistemas`, ta, {
        conceder: [HUB_ADMIN],
      })
      .expect(200);
    expect(dar.body.sistemas).toContain(HUB_ADMIN);
    const [ev] = await e.db.auditEvent.findMany({
      where: {
        action: 'access.granted',
        systemKey: HUB_ADMIN,
        targetUserId: b.id,
      },
    });
    expect(ev.actorUserId).toBe(a.id);
    const proprio = await e.chamar(
      'put',
      `/pessoas/${a.publicId}/sistemas`,
      ta,
      { revogar: [HUB_ADMIN] },
    );
    expect(proprio.status).toBe(409);
    expect(proprio.body.code).toBe('SELF_ACCESS_CHANGE');
    await e
      .chamar('put', `/pessoas/${b.publicId}/sistemas`, ta, {
        revogar: [HUB_ADMIN],
      })
      .expect(200);
    expect(await e.donos()).toBe(1);
  });

  it('nunca zero admin do HUB: dois tirando a permissão UM DO OUTRO ao mesmo tempo → só um consegue', async () => {
    const a = await e.pessoa({ systems: [HUB_ADMIN] });
    const b = await e.pessoa({ systems: [HUB_ADMIN] });
    const svc = e.app.get(UsersService);
    const tirar = (alvo: number, quem: number) =>
      svc.changeSystems(
        alvo,
        { conceder: [], revogar: [HUB_ADMIN] },
        { id: quem },
        travaHubAdmins(quem, null),
        { permissoes: true },
      );
    const rs = await Promise.allSettled([tirar(b.id, a.id), tirar(a.id, b.id)]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const erro = (
      rs.find((r) => r.status === 'rejected') as PromiseRejectedResult
    ).reason;
    expect(['LAST_HUB_ADMIN', 'HUB_ADMIN_REQUIRED']).toContain(
      erro.getResponse().code,
    );
    expect(await e.donos()).toBe(1);
  });

  it('inativar: o último admin do HUB não cai por NENHUM caminho (LAST_HUB_ADMIN); outro admin do HUB inativa outro', async () => {
    const a = await e.pessoa({ systems: [HUB_ADMIN] });
    const b = await e.pessoa({ systems: [HUB_ADMIN] });
    const ta = await e.token(a.email);
    await e.chamar('post', `/pessoas/${b.publicId}/inativar`, ta).expect(200);
    // a é o último: nem pelo serviço (o mesmo do DELETE legado) cai
    const g = await e.pessoa({ role: 'ADMIN', unit: 'LHG' });
    await expect(
      e.app.get(UsersService).remove(a.id, { id: g.id }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LAST_HUB_ADMIN' }),
    });
    expect(
      (await e.db.user.findUniqueOrThrow({ where: { id: a.id } })).status,
    ).toBe('ACTIVE');
  });

  it("convite com 'hub-admin' → 400 PERMISSION_NOT_IN_INVITE (painel e serviço do legado)", async () => {
    const a = await e.pessoa({ systems: [HUB_ADMIN] });
    const ta = await e.token(a.email);
    const r = await e.chamar('post', '/convites', ta, {
      email: `conv-${e.n}@example.invalid`,
      sistemas: ['cms', HUB_ADMIN],
      validade: '7',
    });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PERMISSION_NOT_IN_INVITE');
    await expect(
      e.app
        .get(InvitationsService)
        .create({
          email: `conv2-${e.n}@example.invalid`,
          systems: [HUB_ADMIN],
          validity: '7',
        } as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PERMISSION_NOT_IN_INVITE' }),
    });
  });

  it("API legada (PUT /users/:id/systems): pedir 'hub-admin' → 400; a lista nova PRESERVA a 'hub-admin' de quem tem", async () => {
    const svc = e.app.get(UsersService);
    const a = await e.pessoa({ role: 'ADMIN', unit: 'LHG' });
    const dono = await e.pessoa({ systems: ['analytics', HUB_ADMIN] });
    await expect(
      svc.setSystems(dono.id, ['analytics', HUB_ADMIN], { id: a.id }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PERMISSION_NOT_ALLOWED' }),
    });
    const r = await svc.setSystems(dono.id, ['cms'], { id: a.id });
    expect([...r.systems].sort()).toEqual(['cms', HUB_ADMIN].sort());
    await expect(
      svc.changeSystems(
        dono.id,
        { conceder: [], revogar: [HUB_ADMIN] },
        { id: a.id },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PERMISSION_NOT_ALLOWED' }),
    });
  });

  it("launcher: 'hub-admin' nunca vira cartão", async () => {
    await e.db.system.update({
      where: { key: 'cms' },
      data: { launchUrl: 'https://cms.exemplo.invalid/' },
    });
    const dono = await e.pessoa({ systems: ['cms', HUB_ADMIN] });
    const itens = await e.app
      .get(LauncherService)
      .listForPublicId(dono.publicId);
    expect(itens!.map((i) => i.key)).toEqual(['cms']);
  });
});

describe("regra 'perfil' (padrão): o painel segue do ADMIN/LHG, mas a permissão só quem a tem mexe", () => {
  const e = ambiente('perfil');
  beforeAll(() => e.subir());
  afterAll(() => e.descer());
  beforeEach(() => e.zerar());

  it("ADMIN/LHG sem a flag: usa o painel (admin=true, hubAdmin=false), mas dar 'hub-admin' → 403 HUB_ADMIN_REQUIRED e NADA do pedido é gravado", async () => {
    const lhg = await e.pessoa({ role: 'ADMIN', unit: 'LHG' });
    const b = await e.pessoa();
    const t = await e.token(lhg.email);
    expect((await e.chamar('get', '/eu', t)).body).toMatchObject({
      admin: true,
      hubAdmin: false,
    });
    const r = await e.chamar('put', `/pessoas/${b.publicId}/sistemas`, t, {
      conceder: ['cms', HUB_ADMIN],
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('HUB_ADMIN_REQUIRED');
    expect(
      await e.db.systemAccess.count({
        where: { userId: b.id, revokedAt: null },
      }),
    ).toBe(1);
    // sistemas comuns seguem como antes
    await e
      .chamar('put', `/pessoas/${b.publicId}/sistemas`, t, {
        conceder: ['cms'],
      })
      .expect(200);
  });

  it('ADMIN/LHG COM a flag dá a permissão', async () => {
    const lhg = await e.pessoa({
      role: 'ADMIN',
      unit: 'LHG',
      systems: ['analytics', HUB_ADMIN],
    });
    const b = await e.pessoa();
    const t = await e.token(lhg.email);
    expect((await e.chamar('get', '/eu', t)).body).toMatchObject({
      admin: true,
      hubAdmin: true,
    });
    await e
      .chamar('put', `/pessoas/${b.publicId}/sistemas`, t, {
        conceder: [HUB_ADMIN],
      })
      .expect(200);
    expect(await e.donos()).toBe(2);
  });
});

// Suporte ao HUB no login central: (A) lista de sistemas por Bearer (access
// token do login central emitido para o 'hub'); (B) tela "Trocar senha" na
// sessão SSO, com as regras da 1c. No banco migrado de verdade, com o app
// montado como o main.ts. Chaves e segredos de TESTE gerados aqui, na hora.
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { LauncherService } from '../access/launcher.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { Pote, fluxo, sessaoDo, subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const NOVA = 'senha-nova-de-teste-456';
const VOLTA = 'https://hub.exemplo.invalid/';
const segredo = () => crypto.randomBytes(32).toString('hex');
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
};

describe('suporte ao HUB: lista de sistemas (Bearer) e troca de senha', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let f: ReturnType<typeof fluxo>;
  const logs: string[] = [];
  const espioes: jest.SpyInstance[] = [];

  async function pessoa(tag: string) {
    return db.user.create({
      data: {
        email: `${tag}@example.invalid`,
        name: `Pessoa ${tag}`,
        password: bcrypt.hashSync(SENHA, 4),
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        systemAccesses: { create: [{ systemKey: 'analytics' }] },
      },
    });
  }
  const sistemas = (token?: string) => {
    const r = request(srv).get('/oidc/hub/systems');
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  beforeAll(async () => {
    url = novoSchema('thub');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.system.update({
      where: { key: 'analytics' },
      data: { launchUrl: 'https://analytics.exemplo.invalid/' },
    });
    await db.oidcClient.createMany({
      data: [
        {
          clientId: 'hub',
          name: 'HUB',
          redirectUris: [CLIENTES.hub.redirect],
          postLogoutRedirectUris: [VOLTA],
        },
        {
          clientId: 'teste',
          name: 'Teste',
          systemKey: 'analytics',
          redirectUris: [CLIENTES.teste.redirect],
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

  describe('(A) GET /oidc/hub/systems', () => {
    it('access token do hub → 200 com EXATAMENTE a lista do LauncherService, no-store', async () => {
      const u = await pessoa('lista');
      const { tokens } = await f.entrar(new Pote(), 'hub', u.email, SENHA);
      const r = await sistemas(tokens.access_token).expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      const esperado = await app.get(LauncherService).listFor(u.id);
      expect(r.body).toEqual(JSON.parse(JSON.stringify(esperado)));
      expect(r.body.map((s: any) => s.key)).toEqual(['analytics']);
    });

    it.each([
      ['sem Authorization', undefined],
      ['token inventado', 'x'.repeat(43)],
    ])('%s → 401 com WWW-Authenticate', async (_n, token) => {
      const r = await sistemas(token).expect(401);
      expect(r.headers['www-authenticate']).toMatch(/^Bearer/);
    });

    it('access token de OUTRO cliente (teste) → 401', async () => {
      const u = await pessoa('outro-cliente');
      const { tokens } = await f.entrar(new Pote(), 'teste', u.email, SENHA);
      expect(tokens.access_token).toBeTruthy();
      await sistemas(tokens.access_token).expect(401);
    });

    it('token revogado (depois de INATIVAR pela rota oficial) → 401', async () => {
      const u = await pessoa('revogado');
      const { tokens } = await f.entrar(new Pote(), 'hub', u.email, SENHA);
      await sistemas(tokens.access_token).expect(200);
      await app.get(UsersService).remove(u.id);
      await sistemas(tokens.access_token).expect(401);
    });

    it('pessoa INATIVA com o token ainda gravado → 401', async () => {
      const u = await pessoa('inativa-direto');
      const { tokens } = await f.entrar(new Pote(), 'hub', u.email, SENHA);
      await db.user.update({
        where: { id: u.id },
        data: { status: 'INACTIVE' },
      });
      await sistemas(tokens.access_token).expect(401);
    });
  });

  describe('(B) /oidc/conta/senha', () => {
    const tela = (pote: Pote, returnTo?: string) =>
      request(srv)
        .get('/oidc/conta/senha')
        .query(returnTo ? { return_to: returnTo } : {})
        .set('Cookie', pote.header());
    const csrfDa = (html: string) =>
      /name="csrf" value="([^"]+)"/.exec(html)![1];
    const enviar = (pote: Pote, campos: Record<string, string>) =>
      request(srv)
        .post('/oidc/conta/senha')
        .set('Cookie', pote.header())
        .type('form')
        .send(campos);

    it('sem sessão SSO → volta ao HUB pedindo o login (só com return_to CADASTRADO)', async () => {
      const r = await tela(new Pote(), VOLTA).expect(303);
      expect(r.headers.location).toBe(`${VOLTA}?conta_senha=entrar`);
      const sem = await tela(new Pote()).expect(401);
      expect(sem.text).toContain('É preciso entrar');
    });

    it('return_to NÃO cadastrado é ignorado (sem open redirect)', async () => {
      for (const ruim of [
        'https://atacante.invalid/',
        'https://hub.exemplo.invalid.atacante.invalid/',
        `${VOLTA}x`,
        '//atacante.invalid/',
      ]) {
        const r = await tela(new Pote(), ruim);
        expect(r.status).toBe(401);
        expect(r.headers.location).toBeUndefined();
      }
    });

    it('com sessão: formulário em pt-BR com CSRF, sem script, CSP do /oidc', async () => {
      const u = await pessoa('form');
      const pote = new Pote();
      await f.entrar(pote, 'hub', u.email, SENHA);
      const r = await tela(pote, VOLTA).expect(200);
      expect(r.text).toContain('Trocar senha');
      expect(csrfDa(r.text)).toBeTruthy();
      expect(r.text).not.toContain('<script');
      expect(r.headers['content-security-policy']).toContain(
        "default-src 'none'",
      );
      expect(r.headers['cache-control']).toBe('no-store');
    });

    it('CSRF errado (ou de outra sessão) → 403, nada muda', async () => {
      const u = await pessoa('csrf');
      const a = new Pote();
      const b = new Pote();
      await f.entrar(a, 'hub', u.email, SENHA);
      await f.entrar(b, 'hub', u.email, SENHA);
      const csrfDeB = csrfDa((await tela(b)).text);
      const r = await enviar(a, {
        csrf: csrfDeB,
        senha_atual: SENHA,
        senha_nova: NOVA,
        confirmacao: NOVA,
      });
      expect(r.status).toBe(403);
      await app.get(AuthService).checkPassword(u.email, SENHA); // continua a antiga
    });

    it('regras da 1c: confirmação, mínimo 10, 72 bytes, igual à atual, senha atual errada (conta no bloqueio)', async () => {
      const u = await pessoa('regras');
      const pote = new Pote();
      await f.entrar(pote, 'hub', u.email, SENHA);
      const csrf = csrfDa((await tela(pote)).text);
      const casos: [Record<string, string>, number, string][] = [
        [
          {
            senha_atual: SENHA,
            senha_nova: NOVA,
            confirmacao: 'outra-coisa-1',
          },
          400,
          'A confirmação não confere.',
        ],
        [
          { senha_atual: SENHA, senha_nova: 'curta', confirmacao: 'curta' },
          400,
          'pelo menos 10',
        ],
        [
          {
            senha_atual: SENHA,
            senha_nova: 'é'.repeat(37),
            confirmacao: 'é'.repeat(37),
          },
          400,
          '72 bytes',
        ],
        [
          { senha_atual: SENHA, senha_nova: SENHA, confirmacao: SENHA },
          400,
          'diferente da atual',
        ],
        [
          {
            senha_atual: 'errada-0000000',
            senha_nova: NOVA,
            confirmacao: NOVA,
          },
          401,
          'Senha atual incorreta',
        ],
      ];
      for (const [campos, status, trecho] of casos) {
        const r = await enviar(pote, { csrf, ...campos });
        expect([r.status, r.text.includes(trecho)]).toEqual([status, true]);
      }
      const falha = await db.auditEvent.findFirst({
        where: { action: 'login.failed', targetUserId: u.id },
        orderBy: { id: 'desc' },
      });
      expect(falha!.metadata).toMatchObject({ source: 'password_change' });
    });

    it('troca certa: custo 12, auditoria, as OUTRAS sessões e grants caem (com aviso), ESTA continua; volta ao HUB', async () => {
      const u = await pessoa('troca');
      const atual = new Pote();
      const outra = new Pote();
      const hubAtual = await f.entrar(atual, 'hub', u.email, SENHA);
      const hubOutra = await f.entrar(outra, 'hub', u.email, SENHA);
      await db.oidcClient.update({
        where: { clientId: 'hub' },
        data: {
          backchannelLogoutUri: 'https://hub.exemplo.invalid/backchannel',
        },
      });
      try {
        const csrf = csrfDa((await tela(atual, VOLTA)).text);
        const r = await enviar(atual, {
          csrf,
          return_to: VOLTA,
          senha_atual: SENHA,
          senha_nova: NOVA,
          confirmacao: NOVA,
        }).expect(303);
        expect(r.headers.location).toBe(`${VOLTA}?senha=alterada`);

        const gravada = await db.user.findUniqueOrThrow({
          where: { id: u.id },
        });
        expect(gravada.password).toMatch(/^\$2[aby]\$12\$/);
        await app.get(AuthService).checkPassword(u.email, NOVA);
        expect(
          await db.auditEvent.count({
            where: { action: 'password.changed', targetUserId: u.id },
          }),
        ).toBe(1);

        // A outra sessão caiu (pede login) e o refresh dela também.
        expect((await f.autorizar(outra, 'hub')).headers.location).toMatch(
          /\/interaction\//,
        );
        expect(
          (await f.refresh('hub', hubOutra.tokens.refresh_token)).body.error,
        ).toBe('invalid_grant');
        // Esta continua: SSO sem senha e refresh válido.
        const a = await f.autorizar(atual, 'hub');
        expect(
          new URL(a.headers.location).searchParams.get('code'),
        ).toBeTruthy();
        expect(
          (await f.refresh('hub', hubAtual.tokens.refresh_token)).status,
        ).toBe(200);
        // Back-channel: 1 aviso para a sessão que caiu.
        const fila = await db.outbox.findMany({ where: { sub: u.publicId } });
        expect(fila.map((o) => [o.clientId, o.event])).toEqual([
          ['hub', 'password_change'],
        ]);
        expect(sessaoDo(atual)).toBeTruthy();
      } finally {
        await db.oidcClient.update({
          where: { clientId: 'hub' },
          data: { backchannelLogoutUri: null },
        });
      }
    });
  });

  it('nenhuma senha, segredo ou token em log', () => {
    const tudo = logs.join('\n');
    for (const s of [SENHA, NOVA, CLIENTES.hub.segredo, CLIENTES.teste.segredo])
      expect(tudo.includes(s)).toBe(false);
    expect(tudo).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
  });
});

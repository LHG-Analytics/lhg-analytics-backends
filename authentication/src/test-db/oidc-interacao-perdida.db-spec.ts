// Interação vencida ou já concluída no login central (ex.: o form de login
// enviado DUAS vezes): em vez do beco sem saída, b1 = 303 para o launchUrl do
// sistema dono do uid (do BANCO, nunca da URL; client 'hub' → portal /entrar);
// b2 = página com "Ir para o HUB LHG" e "Voltar". E a tela mínima trava o
// "Entrar" no 1º envio (script inline com hash no CSP). No banco migrado de
// verdade, com o app montado como o main.ts. Segredos de TESTE gerados aqui.
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JWK } from 'jose';
import * as request from 'supertest';
import { SCRIPT_ENTRAR, SCRIPT_VOLTAR } from '../oidc/oidc-pages';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { Pote, fluxo, subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const PORTAL = 'https://hub.lhgmoteis.com.br';
const LAUNCH_CMS = 'https://cms.lhgmoteis.com.br/api/auth/hub/login';
const segredo = () => crypto.randomBytes(32).toString('hex');
const K1 = {
  ...crypto
    .generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'jwk' }),
  kid: 'chave-nova',
} as JWK & { kid: string };
const CLIENTES = {
  hub: { segredo: segredo(), redirect: 'https://hub.exemplo.invalid/cb' },
  cms: { segredo: segredo(), redirect: 'https://cms.exemplo.invalid/cb' },
  rmteste: { segredo: segredo(), redirect: 'https://rm.exemplo.invalid/cb' },
};
const VARS = {
  OIDC_ISSUER: ISSUER,
  OIDC_JWKS: JSON.stringify({ keys: [K1] }),
  OIDC_COOKIE_KEYS: [segredo(), segredo()].join(','),
  OIDC_CLIENT_SECRET_HUB: CLIENTES.hub.segredo,
  OIDC_CLIENT_SECRET_CMS: CLIENTES.cms.segredo,
  OIDC_CLIENT_SECRET_RMTESTE: CLIENTES.rmteste.segredo,
  OIDC_MINIMAL_LOGIN_PAGE: 'true',
  HUB_BASE_URL: PORTAL,
};
const sha = (s: string) =>
  `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

describe('Login central: interação perdida com saída (b1/b2) e Entrar travado', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let f: ReturnType<typeof fluxo>;
  const espioes: jest.SpyInstance[] = [];
  let n = 0;

  const pessoa = () =>
    db.user.create({
      data: {
        email: `perdida-${++n}@example.invalid`,
        name: `Pessoa ${n}`,
        password: bcrypt.hashSync(SENHA, 4),
        systemAccesses: { create: [{ systemKey: 'cms' }, { systemKey: 'rm' }] },
      },
    });

  /** Abre a interação do cliente e devolve o uid (tela mínima). */
  async function abrir(pote: Pote, clientId: string) {
    const a = await f.autorizar(pote, clientId);
    expect([302, 303]).toContain(a.status);
    expect(a.headers.location).toMatch(/\/interaction\//);
    return f.uidDa(a.headers.location);
  }
  const enviar = (pote: Pote, uid: string, email: string) =>
    request(srv)
      .post(`/oidc/interaction/${uid}/login`)
      .set('Cookie', pote.header())
      .type('form')
      .send({ email, password: SENHA });

  beforeAll(async () => {
    url = novoSchema('tperdida');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.system.update({
      where: { key: 'cms' },
      data: { launchUrl: LAUNCH_CMS },
    });
    // rm com launchUrl de EXEMPLO (host reservado, como o seed da homologação)
    await db.system.update({
      where: { key: 'rm' },
      data: { launchUrl: 'https://rm.exemplo.invalid/auth/hub/login' },
    });
    await db.oidcClient.createMany({
      data: [
        { clientId: 'hub', name: 'HUB', redirectUris: [CLIENTES.hub.redirect] },
        {
          clientId: 'cms',
          name: 'CMS',
          systemKey: 'cms',
          redirectUris: [CLIENTES.cms.redirect],
        },
        {
          clientId: 'rmteste',
          name: 'RM',
          systemKey: 'rm',
          redirectUris: [CLIENTES.rmteste.redirect],
        },
      ],
    });
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      espioes.push(
        jest.spyOn(Logger.prototype, m).mockImplementation(() => undefined),
      );
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

  it('a tela mínima leva o script que trava o Entrar, com o hash dele no script-src', async () => {
    const pote = new Pote();
    const uid = await abrir(pote, 'cms');
    const t = await request(srv)
      .get(`/oidc/interaction/${uid}`)
      .set('Cookie', pote.header());
    expect(t.status).toBe(200);
    expect(t.text).toContain(`<script>${SCRIPT_ENTRAR}</script>`);
    expect(t.headers['content-security-policy']).toContain(sha(SCRIPT_ENTRAR));
    expect(t.headers['content-security-policy']).not.toContain(
      "'unsafe-inline'",
    );
  });

  it('b1: o 2º envio do form (interação já concluída) → 303 para o launchUrl do sistema, do BANCO', async () => {
    const u = await pessoa();
    const pote = new Pote();
    const uid = await abrir(pote, 'cms');
    const r1 = pote.guardar(await enviar(pote, uid, u.email));
    expect(r1.status).toBe(303); // 1º envio: segue o login normal
    await f.ateOCliente(pote, r1.headers.location); // a interação é consumida
    const r2 = await enviar(pote, uid, u.email);
    expect(r2.status).toBe(303);
    expect(r2.headers.location).toBe(LAUNCH_CMS);
    // o GET da tela com o uid consumido também sai pelo sistema
    const g = await request(srv)
      .get(`/oidc/interaction/${uid}`)
      .set('Cookie', pote.header());
    expect(g.headers.location).toBe(LAUNCH_CMS);
  });

  it("b1 do client 'hub': o portal /entrar", async () => {
    const pote = new Pote();
    const uid = await abrir(pote, 'hub');
    // sem o cookie da interação (ex.: outra aba/navegador): a interação "some"
    const r = await enviar(new Pote(), uid, 'x@example.invalid');
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe(`${PORTAL}/entrar`);
  });

  it('b2: uid desconhecido → 400 com "Ir para o HUB LHG" e "Voltar", sem laço automático', async () => {
    const r = await enviar(
      new Pote(),
      'uid-que-nunca-existiu',
      'x@example.invalid',
    );
    expect(r.status).toBe(400);
    expect(r.text).toContain(`href="${PORTAL}/"`);
    expect(r.text).toContain('Ir para o HUB LHG');
    expect(r.text).toContain('id="voltar"');
    expect(r.headers['content-security-policy']).toContain(sha(SCRIPT_VOLTAR));
    expect(r.headers.location).toBeUndefined();
    expect(r.text).not.toMatch(/http-equiv="refresh"|\.submit\(\)/);
  });

  it('b2 também quando o launchUrl é de EXEMPLO (host reservado) — nunca manda para host inexistente', async () => {
    const pote = new Pote();
    const uid = await abrir(pote, 'rmteste');
    const r = await enviar(new Pote(), uid, 'x@example.invalid');
    expect(r.status).toBe(400);
    expect(r.text).toContain('Ir para o HUB LHG');
  });

  it('b2 quando o sistema está inativo; e o destino nunca vem da URL', async () => {
    // a interação nasce com o sistema ativo; ele é desativado antes do envio
    const uid = await abrir(new Pote(), 'cms');
    await db.system.update({ where: { key: 'cms' }, data: { active: false } });
    try {
      const r = await request(srv)
        .post(
          `/oidc/interaction/${uid}/login?launchUrl=https://atacante.invalid&returnTo=https://atacante.invalid`,
        )
        .type('form')
        .send({
          email: 'x@example.invalid',
          password: SENHA,
          redirect: 'https://atacante.invalid',
        });
      expect(r.status).toBe(400);
      expect(r.text).not.toContain('atacante');
    } finally {
      await db.system.update({ where: { key: 'cms' }, data: { active: true } });
    }
  });
});

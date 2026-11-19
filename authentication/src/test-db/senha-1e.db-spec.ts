// 1e: "esqueci a senha" no login central (POST /oidc/senha/esqueci, GET/POST
// /oidc/senha/nova): 303 SEMPRE igual e na hora (exista ou não a conta);
// envio só para conta ATIVA; limite por e-mail e por IP; token só no
// fragmento, só o hash no banco, 30 min, uso único, o novo invalida os
// anteriores; redefinição com as regras da 1c, que zera o bloqueio, confirma o
// e-mail e derruba sessões e refresh tokens. Resend FALSO (a rede nunca é
// chamada). No banco migrado de verdade, com o app montado como o main.ts.
// Chaves e segredos de TESTE gerados aqui, na hora.
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { RESEND_URL } from '../email/email.service';
import { hashToken } from '../invitations/invitations.service';
import { ABRIR_SENHA } from '../oidc/oidc-pages';
import {
  LIMITE_POR_EMAIL_H,
  LIMITE_POR_IP_H,
  LimitePorHora,
  REDEFINICAO_MIN,
} from '../oidc/oidc-senha';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { Pote, fluxo, subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const HUB = 'https://hub.exemplo.invalid';
const SENHA = 'senha-antiga-123';
const NOVA = 'senha-nova-456-xyz';
const segredo = () => crypto.randomBytes(32).toString('hex');
const CHAVE = segredo();
const CLIENTES = {
  hub: { segredo: segredo(), redirect: `${HUB}/api/auth/callback` },
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
  OIDC_MINIMAL_LOGIN_PAGE: 'true',
  HUB_BASE_URL: `${HUB}/`,
  HUB_PROXY_KEY: CHAVE,
  RESEND_API_KEY: `re_teste_${segredo()}`,
};
const hash = (s: string) =>
  `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

/** Resend FALSO: guarda os e-mails; pode segurar a resposta (portão). */
const resend: {
  status: number;
  corpos: any[];
  portao: Promise<void> | null;
} = { status: 200, corpos: [], portao: null };

describe('1e: esqueci a senha (/oidc/senha/*)', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  const espioes: jest.SpyInstance[] = [];
  let n = 0;
  let ipN = 0;

  async function pessoa(dados: Record<string, unknown> = {}) {
    return db.user.create({
      data: {
        email: `pessoa-${++n}@example.invalid`,
        name: `Pessoa ${n}`,
        password: bcrypt.hashSync(SENHA, 4),
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        systemAccesses: { create: [{ systemKey: 'analytics' }] },
        ...dados,
      },
    });
  }
  /** Um IP real diferente por teste (via x-hub-proxy-key, como o HUB faz). */
  const novoIp = () => `198.51.100.${++ipN}`;
  const esqueci = (email: unknown, ip = novoIp()) =>
    request(srv)
      .post('/oidc/senha/esqueci')
      .set('x-hub-proxy-key', CHAVE)
      .set('x-hub-client-ip', ip)
      .type('form')
      .send(email === undefined ? {} : { email });
  /** O pedido roda DEPOIS da resposta: espera curta pelo segundo plano. */
  const ocioso = () => new Promise((ok) => setTimeout(ok, 25));
  /** Os e-mails para um endereço (um pedido de outro teste pode chegar atrasado). */
  const emailsPara = (email: string) =>
    resend.corpos.filter((c) => c.to[0] === email);
  const tokenPara = (email: string) => {
    const m = /\/senha\/nova#([A-Za-z0-9_-]+)/.exec(
      emailsPara(email).at(-1).text,
    );
    return m![1];
  };
  /** Espera chegar mais um e-mail para o endereço e devolve o token dele. */
  async function novoEmailPara(email: string, antes: number) {
    for (let i = 0; i < 400 && emailsPara(email).length <= antes; i++) {
      await ocioso();
    }
    return tokenPara(email);
  }
  const abrir = (token: string) =>
    request(srv).post('/oidc/senha/nova').type('form').send({ token });
  const redefinir = (token: string, s: string, conf = s) =>
    request(srv)
      .post('/oidc/senha/nova')
      .set('x-hub-proxy-key', CHAVE)
      .set('x-hub-client-ip', '203.0.113.50')
      .type('form')
      .send({ token, senha: s, confirmacao: conf });

  beforeAll(async () => {
    url = novoSchema('t1e');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.oidcClient.create({
      data: {
        clientId: 'hub',
        name: 'HUB',
        redirectUris: [CLIENTES.hub.redirect],
        postLogoutRedirectUris: [`${HUB}/`],
      },
    });
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      espioes.push(jest.spyOn(Logger.prototype, m).mockImplementation());
    }
    for (const m of ['log', 'warn', 'error', 'info'] as const) {
      espioes.push(jest.spyOn(console, m).mockImplementation());
    }
    const fetchReal = global.fetch;
    espioes.push(
      jest
        .spyOn(global, 'fetch')
        .mockImplementation(async (alvo: any, init?: any) => {
          if (String(alvo) !== RESEND_URL) return fetchReal(alvo, init);
          if (resend.portao) await resend.portao;
          resend.corpos.push(JSON.parse(init.body));
          return new Response('{}', { status: resend.status });
        }),
    );
    Object.assign(process.env, VARS);
    ({ app } = await subirComoMain());
    srv = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    espioes.forEach((e) => e.mockRestore());
    for (const k of Object.keys(VARS)) delete process.env[k];
    await db.$disconnect();
    await apagarSchema(url);
  });

  beforeEach(() => {
    resend.status = 200;
    resend.corpos.length = 0;
    resend.portao = null;
  });

  /** Espera de verdade o envio (o pedido encadeia promessas do Prisma). */
  async function esperarEnvio(qtd: number) {
    for (let i = 0; i < 400 && resend.corpos.length < qtd; i++) await ocioso();
  }
  /** Espera o pedido terminar mesmo quando NADA é enviado. */
  async function esperarPedido() {
    for (let i = 0; i < 16; i++) await ocioso();
  }

  describe('pedir (POST /senha/esqueci)', () => {
    it('SEMPRE 303 para {HUB}/esqueci?enviado=1, igual para conta existente, inexistente, inativa e e-mail inválido; no-store', async () => {
      const ativa = await pessoa();
      const inativa = await pessoa({ status: 'INACTIVE' });
      const rs = [
        await esqueci(ativa.email),
        await esqueci('ninguem@example.invalid'),
        await esqueci(inativa.email),
        await esqueci('isto não é e-mail'),
        await esqueci(undefined),
        await esqueci(ativa.email.toUpperCase()),
      ];
      for (const r of rs) {
        expect(r.status).toBe(303);
        expect(r.headers.location).toBe(`${HUB}/esqueci?enviado=1`);
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.text).toBe(rs[0].text);
      }
      await esperarEnvio(2);
      await esperarPedido();
      // só a conta ATIVA recebe (2 pedidos: o mesmo e-mail, em maiúsculas)
      expect(resend.corpos.map((c) => c.to[0])).toEqual([
        ativa.email,
        ativa.email,
      ]);
    });

    it('o 303 sai NA HORA, antes do envio (o Resend preso não atrasa a resposta)', async () => {
      const p = await pessoa();
      let soltar!: () => void;
      resend.portao = new Promise((ok) => (soltar = ok));
      const t0 = Date.now();
      const r = await esqueci(p.email);
      expect(r.status).toBe(303);
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(resend.corpos).toHaveLength(0);
      soltar();
      await esperarEnvio(1);
      expect(resend.corpos).toHaveLength(1);
    });

    it('e-mail com o link {issuer}/senha/nova#token (43 caracteres); no banco só o hash, 30 min; auditoria sem token', async () => {
      const p = await pessoa();
      await esqueci(p.email);
      const token = await novoEmailPara(p.email, 0);
      const m = emailsPara(p.email)[0];
      expect(m.subject).toBe('Redefinir a sua senha do HUB LHG');
      expect(m.text).toContain(`${ISSUER}/senha/nova#`);
      expect(m.text).toContain(`Olá, ${p.name}.`);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [pr] = await db.passwordReset.findMany({ where: { userId: p.id } });
      expect(pr.tokenHash).toBe(hashToken(token));
      expect(JSON.stringify(pr)).not.toContain(token);
      const min = (pr.expiresAt.getTime() - pr.createdAt.getTime()) / 60000;
      expect(Math.round(min)).toBe(REDEFINICAO_MIN);
      const [ev] = await db.auditEvent.findMany({
        where: { action: 'password.reset_requested', targetUserId: p.id },
      });
      expect(ev.metadata).toEqual({ via: 'email' });
      expect(JSON.stringify(ev.metadata)).not.toContain(token);
    });

    it('conta só com Google (sem senha) também recebe; e-mail secundário VERIFICADO recebe no secundário; não verificado, nada', async () => {
      const g = await pessoa({
        password: null,
        googleSub: `sub-${n}`,
        googleLinkedAt: new Date(),
      });
      const sec = await pessoa();
      const secV = `sec-v-${n}@example.invalid`;
      const secN = `sec-n-${n}@example.invalid`;
      await db.userEmail.createMany({
        data: [
          { userId: sec.id, email: secV, verifiedAt: new Date() },
          { userId: sec.id, email: secN },
        ],
      });
      await esqueci(g.email);
      await esqueci(secV);
      await esqueci(secN);
      await esperarEnvio(2);
      await esperarPedido();
      expect(resend.corpos.map((c) => c.to[0]).sort()).toEqual(
        [g.email, secV].sort(),
      );
    });

    it(`limite: ${LIMITE_POR_EMAIL_H}/h por e-mail e ${LIMITE_POR_IP_H}/h por IP; acima, a mesma resposta e nada enviado`, async () => {
      const p = await pessoa();
      for (let i = 0; i < LIMITE_POR_EMAIL_H + 2; i++) {
        const r = await esqueci(p.email); // IP diferente a cada vez
        expect(r.status).toBe(303);
      }
      await esperarEnvio(LIMITE_POR_EMAIL_H);
      await esperarPedido();
      expect(resend.corpos).toHaveLength(LIMITE_POR_EMAIL_H);

      resend.corpos.length = 0;
      const ip = novoIp();
      const outras = await Promise.all(
        Array.from({ length: LIMITE_POR_IP_H + 3 }, () => pessoa()),
      );
      for (const o of outras)
        expect((await esqueci(o.email, ip)).status).toBe(303);
      await esperarEnvio(LIMITE_POR_IP_H);
      await esperarPedido();
      expect(resend.corpos).toHaveLength(LIMITE_POR_IP_H);
    });

    it('a janela é deslizante de 1 h (LimitePorHora)', () => {
      let t = 0;
      const l = new LimitePorHora(() => t);
      for (let i = 0; i < 5; i++) expect(l.permitir('a', 5)).toBe(true);
      expect(l.permitir('a', 5)).toBe(false);
      expect(l.permitir('b', 5)).toBe(true);
      t += 60 * 60 * 1000 + 1;
      expect(l.permitir('a', 5)).toBe(true);
    });

    it('Resend recusa: auditoria com reason FALHA_ENVIO (e a resposta é a mesma)', async () => {
      resend.status = 500;
      const p = await pessoa();
      expect((await esqueci(p.email)).status).toBe(303);
      await esperarEnvio(1);
      await esperarPedido();
      const [ev] = await db.auditEvent.findMany({
        where: { action: 'password.reset_requested', targetUserId: p.id },
      });
      expect(ev.metadata).toEqual({ via: 'email', reason: 'FALHA_ENVIO' });
    });
  });

  describe('nova senha (GET/POST /senha/nova)', () => {
    async function linkPara(p: { email: string }) {
      const antes = emailsPara(p.email).length;
      await esqueci(p.email);
      return novoEmailPara(p.email, antes);
    }

    it('GET: página que lê o fragmento e envia por POST; CSP com o hash do script, sem unsafe-inline; no-store; no-referrer', async () => {
      const r = await request(srv).get('/oidc/senha/nova').expect(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
      const csp = r.headers['content-security-policy'];
      expect(csp).toContain(hash(ABRIR_SENHA));
      expect(csp).not.toContain('unsafe-inline');
      expect(r.text).toContain(`<script>${ABRIR_SENHA}</script>`);
      expect(r.text).toContain(
        '<form id="senha-nova" method="post" action="/auth/oidc/senha/nova">',
      );
    });

    it('POST só com o token → formulário (e-mail mascarado); token inválido → 400 com o link para pedir outro', async () => {
      const p = await pessoa();
      const token = await linkPara(p);
      const f = await abrir(token).expect(200);
      expect(f.text).toContain('Criar uma nova senha');
      expect(f.text).not.toContain(p.email);
      expect(f.text).toContain(`value="${token}"`);
      for (const ruim of ['x'.repeat(43), 'curto', '']) {
        const r = await abrir(ruim);
        expect(r.status).toBe(400);
        expect(r.text).toContain('Este link não vale mais');
        expect(r.text).toContain(`${HUB}/esqueci`);
      }
    });

    it('regras da 1c: confirmação, mínimo, 72 bytes, nada com cara de hash → 400 no formulário (o link continua valendo)', async () => {
      const p = await pessoa();
      const token = await linkPara(p);
      const HASH = bcrypt.hashSync('x', 4);
      const casos: [string, string, RegExp][] = [
        [NOVA, 'outra-coisa-123', /confirmação não confere/],
        ['curta', 'curta', /pelo menos 10/],
        ['é'.repeat(40), 'é'.repeat(40), /72 bytes/],
        [HASH, HASH, /formato de um hash/],
      ];
      for (const [s, c, re] of casos) {
        const r = await redefinir(token, s, c);
        expect(r.status).toBe(400);
        expect(r.text).toMatch(re);
      }
      expect((await abrir(token)).status).toBe(200);
    });

    it('sucesso: 303 para {HUB}/entrar; senha nova; bloqueio zerado; e-mail confirmado; sessões SSO, grants, refresh tokens e outros links caem; auditado', async () => {
      const p = await pessoa({
        failedLoginCount: 3,
        lockedUntil: new Date(Date.now() + 3600_000),
        lockLevel: 2,
      });
      await db.user.update({
        where: { id: p.id },
        data: { failedLoginCount: 0, lockedUntil: null, lockLevel: 0 },
      });
      // uma sessão SSO + grant + refresh do 'hub' de antes
      const f = fluxo(srv, ISSUER, CLIENTES);
      const { tokens } = await f.entrar(new Pote(), 'hub', p.email, SENHA);
      expect(tokens.refresh_token).toBeTruthy();
      await db.user.update({
        where: { id: p.id },
        data: {
          failedLoginCount: 3,
          lockedUntil: new Date(Date.now() + 3600_000),
          lockLevel: 2,
        },
      });
      await db.refreshToken.create({
        data: {
          token: segredo(),
          userId: p.id,
          expiresAt: new Date(Date.now() + 86400_000),
        },
      });
      const token = await linkPara(p);
      const r = await redefinir(token, NOVA);
      expect(r.status).toBe(303);
      expect(r.headers.location).toBe(`${HUB}/entrar`);

      const u = await db.user.findUniqueOrThrow({ where: { id: p.id } });
      expect(bcrypt.compareSync(NOVA, u.password!)).toBe(true);
      expect(u.lockedUntil).toBeNull();
      expect(u.failedLoginCount).toBe(0);
      expect(u.lockLevel).toBe(0);
      expect(u.emailVerifiedAt).not.toBeNull();
      expect(await db.refreshToken.count({ where: { userId: p.id } })).toBe(0);
      const restos = await db.oidcPayload.count({
        where: { accountId: u.publicId, type: { in: ['Session', 'Grant'] } },
      });
      expect(restos).toBe(0);
      // o refresh do 'hub' de antes não vale mais
      const rf = await f.refresh('hub', tokens.refresh_token);
      expect(rf.status).toBe(400);
      const [ev] = await db.auditEvent.findMany({
        where: { action: 'password.reset', targetUserId: p.id },
      });
      expect(ev.actorUserId).toBe(p.id);
      expect(ev.ip).toBe('203.0.113.50');
      expect(JSON.stringify(ev.metadata)).not.toContain(token);
      // uso único
      expect((await redefinir(token, 'mais-uma-senha-789')).status).toBe(400);
      // e entra com a senha nova
      const novo = await f.entrar(new Pote(), 'hub', p.email, NOVA);
      expect(novo.tokens.access_token).toBeTruthy();
    });

    it('o pedido novo invalida o link anterior; link vencido não vale; conta inativada depois do pedido não vale', async () => {
      const p = await pessoa();
      const t1 = await linkPara(p);
      const t2 = await linkPara(p);
      expect((await abrir(t1)).status).toBe(400);
      expect((await abrir(t2)).status).toBe(200);

      await db.passwordReset.updateMany({
        where: { userId: p.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await abrir(t2)).status).toBe(400);
      expect((await redefinir(t2, NOVA)).status).toBe(400);

      const q = await pessoa();
      const t3 = await linkPara(q);
      await db.user.update({
        where: { id: q.id },
        data: { status: 'INACTIVE' },
      });
      expect((await redefinir(t3, NOVA)).status).toBe(400);
      const u = await db.user.findUniqueOrThrow({ where: { id: q.id } });
      expect(bcrypt.compareSync(SENHA, u.password!)).toBe(true);
    });

    it('e-mail confirmado só quando o link foi para o e-mail PRINCIPAL', async () => {
      const p = await pessoa();
      const sec = `sec-conf-${n}@example.invalid`;
      await db.userEmail.create({
        data: { userId: p.id, email: sec, verifiedAt: new Date() },
      });
      await esqueci(sec);
      const t = await novoEmailPara(sec, 0);
      expect((await redefinir(t, NOVA)).status).toBe(303);
      const u = await db.user.findUniqueOrThrow({ where: { id: p.id } });
      expect(u.emailVerifiedAt).toBeNull();
    });

    it('dois envios do mesmo link AO MESMO TEMPO: só um vale', async () => {
      const p = await pessoa();
      const token = await linkPara(p);
      const rs = await Promise.all([
        redefinir(token, 'paralela-um-12345'),
        redefinir(token, 'paralela-dois-12345'),
      ]);
      expect(rs.map((r) => r.status).sort()).toEqual([303, 400]);
      expect(
        await db.auditEvent.count({
          where: { action: 'password.reset', targetUserId: p.id },
        }),
      ).toBe(1);
    });
  });
});

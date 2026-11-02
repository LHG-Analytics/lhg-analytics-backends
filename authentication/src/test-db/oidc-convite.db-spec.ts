// Página de aceite do convite no login central (GET/POST /oidc/convite):
// token só no fragmento e no corpo (nunca em query), CSP sem unsafe-inline,
// no-store e no-referrer; dados do convite; aceite por senha com as regras
// da 1c; formato do link. No banco migrado de verdade, com o app montado
// como o main.ts. Chaves e segredos de TESTE gerados aqui, na hora.
import { INestApplication, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { InvitationsService } from '../invitations/invitations.service';
import { ABRIR_CONVITE } from '../oidc/oidc-pages';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const BASE = 'https://hub.exemplo.invalid/auth/oidc/convite';
const ENTRAR = 'https://hub.exemplo.invalid/entrar';
const segredo = () => crypto.randomBytes(32).toString('hex');
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
  OIDC_CLIENT_SECRET_HUB: segredo(),
  OIDC_MINIMAL_LOGIN_PAGE: 'true',
  INVITE_LINK_BASE_URL: BASE,
  HUB_BASE_URL: 'https://hub.exemplo.invalid/',
};
const SENHA = 'senha-nova-do-convite-1';
const hash = (s: string) =>
  `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

describe('página de aceite do convite (/oidc/convite)', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  const espioes: jest.SpyInstance[] = [];
  let n = 0;

  /** Convite pela rota de serviço oficial (o token só existe nesta resposta). */
  async function convidar(dados: Record<string, unknown> = {}) {
    const email = `convidado-${++n}@example.invalid`;
    const c = await app.get(InvitationsService).create({
      email,
      name: 'Pessoa Convidada',
      systems: ['cms'],
      validity: '7',
      ...dados,
    } as any);
    return { email, token: c.token, link: c.link as string, id: c.id };
  }
  const abrir = (token: string) =>
    request(srv).post('/oidc/convite').type('form').send({ token });
  const senha = (token: string, s: string, conf = s) =>
    request(srv)
      .post('/oidc/convite/senha')
      .type('form')
      .send({ token, senha: s, confirmacao: conf });

  beforeAll(async () => {
    url = novoSchema('tconv');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.oidcClient.create({
      data: {
        clientId: 'hub',
        name: 'HUB',
        redirectUris: ['https://hub.exemplo.invalid/api/auth/callback'],
      },
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
  });

  afterAll(async () => {
    await app?.close();
    espioes.forEach((e) => e.mockRestore());
    for (const k of Object.keys(VARS)) delete process.env[k];
    await db.$disconnect();
    await apagarSchema(url);
  });

  it('formato do link: INVITE_LINK_BASE_URL#<token> (token no FRAGMENTO, 43 caracteres base64url)', async () => {
    const c = await convidar();
    expect(c.link).toBe(`${BASE}#${c.token}`);
    expect(c.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new URL(c.link).search).toBe('');
  });

  it('GET: página que lê o fragmento e envia por POST; CSP com o hash do script e sem unsafe-inline; no-store; no-referrer; visual do HUB', async () => {
    const r = await request(srv).get('/oidc/convite').expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    const csp = r.headers['content-security-policy'];
    expect(csp).toContain(`script-src 'report-sample' ${hash(ABRIR_CONVITE)}`);
    expect(csp).not.toContain('unsafe-inline');
    expect(r.text).toContain(`<script>${ABRIR_CONVITE}</script>`);
    expect(ABRIR_CONVITE).toContain('location.hash');
    expect(ABRIR_CONVITE).toContain('history.replaceState');
    expect(r.text).toContain(
      '<form id="convite" method="post" action="/auth/oidc/convite">',
    );
    expect(r.text).toContain('<svg class="marca"');
    expect(r.text).not.toMatch(/\sstyle="|<(img|link)\b/);
  });

  it('POST com o token: nome, e-mail MASCARADO, sistemas com nome amigável, validade; "Definir senha" e "Entrar com Google"', async () => {
    const c = await convidar({ systems: ['cms', 'rm'] });
    const nomes = await db.system.findMany({
      where: { key: { in: ['cms', 'rm'] } },
    });
    const r = await abrir(c.token).expect(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.text).toContain('Olá, Pessoa Convidada');
    expect(r.text).toContain(`co***@example.invalid`);
    expect(r.text).not.toContain(c.email);
    for (const s of nomes) expect(r.text).toContain(s.name);
    expect(r.text).toMatch(/Convite válido até<\/dt><dd>\d{2}\/\d{2}\/\d{4}/);
    expect(r.text).toContain('action="/auth/oidc/convite/senha"');
    expect(r.text).toContain(
      `<a class="botao" href="${ENTRAR}">Entrar com Google</a>`,
    );
    expect(r.headers['content-security-policy']).not.toContain('unsafe-inline');
    expect(r.text).not.toContain('<script');
  });

  it('convite inválido, revogado, vencido ou token mal formado → página amigável (400), sem dizer o motivo', async () => {
    const revogado = await convidar();
    await db.invitation.update({
      where: { id: revogado.id },
      data: { revokedAt: new Date() },
    });
    const vencido = await convidar();
    await db.invitation.update({
      where: { id: vencido.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    for (const t of [
      revogado.token,
      vencido.token,
      crypto.randomBytes(32).toString('base64url'),
      '<script>',
      '',
    ]) {
      const r = await abrir(t);
      expect(r.status).toBe(400);
      expect(r.text).toContain('Este convite não vale mais');
      expect(r.text).toContain(`href="${ENTRAR}"`);
    }
  });

  it('senha: confirmação diferente, curta, mais de 72 BYTES, cara de hash → 400 com a mensagem; o convite continua pendente', async () => {
    const c = await convidar();
    const casos: [string, string, string][] = [
      [SENHA, `${SENHA}x`, 'A confirmação não confere.'],
      ['curta', 'curta', 'pelo menos 10 caracteres'],
      ['ç'.repeat(40), 'ç'.repeat(40), 'limite de 72 bytes'],
      [
        '$2b$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234',
        '$2b$12$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234',
        'formato de um hash',
      ],
    ];
    for (const [s, conf, msg] of casos) {
      const r = await senha(c.token, s, conf);
      expect(r.status).toBe(400);
      expect(r.text).toContain(msg);
      // O formulário volta com o token no corpo (campo oculto), nunca na URL.
      expect(r.text).toContain('name="token"');
    }
    const inv = await db.invitation.findUniqueOrThrow({ where: { id: c.id } });
    expect(inv.acceptedAt).toBeNull();
  });

  it('senha certa: conta criada pelo convite (flags dele), convite aceito, 303 para a entrada do HUB; o token não serve de novo', async () => {
    const c = await convidar({ systems: ['cms'] });
    const r = await senha(c.token, SENHA);
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe(ENTRAR);
    const u = await db.user.findUniqueOrThrow({
      where: { email: c.email },
      include: { systemAccesses: true },
    });
    expect(u.createdVia).toBe('invite_password');
    expect(u.systemAccesses.map((a) => a.systemKey)).toEqual(['cms']);
    const inv = await db.invitation.findUniqueOrThrow({ where: { id: c.id } });
    expect(inv.acceptedMethod).toBe('password');
    expect(
      await db.auditEvent.count({
        where: { action: 'user.created_via_invite', targetUserId: u.id },
      }),
    ).toBe(1);
    expect((await abrir(c.token)).status).toBe(400);
    expect((await senha(c.token, SENHA)).status).toBe(400);
  });
});

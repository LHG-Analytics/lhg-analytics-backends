// 1d-D1: base do provedor OIDC (discovery, JWKS, clientes, desligamento), no
// banco migrado de verdade. Chaves e segredos de TESTE gerados aqui, na hora:
// nada disso existe no repositório. Numeração = testes obrigatórios da 1d.
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { AccessService } from '../access/access.service';
import { LoginLockService } from '../access/login-lock.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { PARTES_PRIVADAS } from '../oidc/oidc.config';
import { mountOidc } from '../oidc/oidc.mount';
import { PrismaService } from '../prisma/prisma.service';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const jwk = (kid: string) => ({
  ...crypto
    .generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'jwk' }),
  kid,
});
const K1 = jwk('chave-nova');
const K2 = jwk('chave-antiga');
const COOKIE_KEYS = [
  crypto.randomBytes(32).toString('hex'),
  crypto.randomBytes(32).toString('hex'),
];
const SEGREDO_HUB = crypto.randomBytes(32).toString('hex');
const VARS = {
  OIDC_ISSUER: ISSUER,
  OIDC_JWKS: JSON.stringify({ keys: [K1, K2] }),
  OIDC_COOKIE_KEYS: COOKIE_KEYS.join(','),
  OIDC_CLIENT_SECRET_HUB: SEGREDO_HUB,
};
/** Tudo o que NUNCA pode aparecer em log. */
const SEGREDOS = [
  ...COOKIE_KEYS,
  SEGREDO_HUB,
  ...[K1, K2].flatMap((k) =>
    PARTES_PRIVADAS.map((p) => (k as any)[p]).filter(Boolean),
  ),
];

describe('1d-D1: base do OIDC', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  const logs: string[] = [];
  const espioes: jest.SpyInstance[] = [];

  /** Sobe o authentication (login + OIDC) com as variáveis de agora. */
  async function subir(): Promise<{ app: INestApplication; provider: any }> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: 'segredo-de-teste-local' })],
        }),
        JwtModule.register({ secret: 'segredo-de-teste-local' }),
      ],
      controllers: [AuthController],
      providers: [AuthService, AccessService, LoginLockService, PrismaService],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    const provider = await mountOidc(app);
    await app.init();
    return { app, provider };
  }

  beforeAll(async () => {
    url = novoSchema('td1');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.oidcClient.createMany({
      data: [
        {
          clientId: 'hub',
          name: 'HUB',
          redirectUris: ['https://hub.exemplo.invalid/api/auth/callback'],
        },
        {
          clientId: 'teste',
          name: 'Teste (sem segredo)',
          redirectUris: ['https://teste.exemplo.invalid/cb'],
        },
        {
          clientId: 'inativo',
          name: 'Inativo',
          active: false,
          redirectUris: ['https://inativo.exemplo.invalid/cb'],
        },
      ],
    });
    await db.user.create({
      data: {
        email: 'pessoa@example.invalid',
        password: bcrypt.hashSync(SENHA, 4),
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        systemAccesses: { create: { systemKey: 'analytics' } },
      },
    });
    // Captura TODO log do processo durante os testes (varredura do teste 19).
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
  });

  afterAll(async () => {
    espioes.forEach((e) => e.mockRestore());
    for (const k of Object.keys(VARS)) delete process.env[k];
    await db.$disconnect();
    await apagarSchema(url);
  });

  describe('com as variáveis', () => {
    let app: INestApplication;
    let provider: any;
    beforeAll(async () => {
      Object.assign(process.env, VARS);
      ({ app, provider } = await subir());
    });
    afterAll(() => app.close());

    it('1. discovery: TODAS as URLs começam pelo issuer, mesmo atrás do proxy que tira /auth e com host interno/forjado', async () => {
      const res = await request(app.getHttpServer())
        .get('/oidc/.well-known/openid-configuration')
        .set('Host', 'interno.render.invalid:3005')
        .set('X-Forwarded-Host', 'atacante.invalid')
        .set('X-Forwarded-Proto', 'http')
        .expect(200);
      const d = res.body;
      expect(d.issuer).toBe(ISSUER);
      const urls = Object.entries(d).filter(
        ([, v]) => typeof v === 'string' && /^https?:\/\//.test(v as string),
      );
      expect(urls.length).toBeGreaterThan(3);
      for (const [campo, v] of urls) {
        expect([
          campo,
          (v as string).startsWith(`${ISSUER}/`) || v === ISSUER,
        ]).toEqual([campo, true]);
      }
      expect(d.authorization_endpoint).toBe(`${ISSUER}/auth`);
      expect(d.jwks_uri).toBe(`${ISSUER}/jwks`);
      expect(d.code_challenge_methods_supported).toEqual(['S256']);
      expect(d.response_types_supported).toEqual(['code']);
      expect(d.id_token_signing_alg_values_supported).toEqual(['RS256']);
    });

    it('2 e 3. JWKS: só partes PÚBLICAS, cada chave com kid; na rotação as 2 são publicadas, a nova primeiro', async () => {
      const res = await request(app.getHttpServer())
        .get('/oidc/jwks')
        .expect(200);
      const { keys } = res.body;
      expect(keys.map((k: any) => k.kid)).toEqual([
        'chave-nova',
        'chave-antiga',
      ]);
      for (const k of keys) {
        expect(k).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });
        for (const p of PARTES_PRIVADAS) expect(k).not.toHaveProperty(p);
      }
      expect(keys[0].n).toBe(K1.n);
      expect(keys[1].n).toBe(K2.n);
      expect(JSON.stringify(res.body)).not.toContain(String(K1.d));
    });

    it('6. cliente sem segredo ou inativo fica DESLIGADO; o hub (com segredo) é carregado', async () => {
      expect(await provider.Client.find('hub')).toBeDefined();
      expect(await provider.Client.find('teste')).toBeUndefined();
      expect(await provider.Client.find('inativo')).toBeUndefined();
      const boot = logs.find(
        (l) => l.startsWith('oidc:') && l.includes('ATIVO'),
      );
      expect(boot).toContain('clientes=1 ativo(s), 1 sem segredo (desligado)');
    });

    it('PKCE obrigatório: /auth sem code_challenge é recusado (sem login ainda, D1)', async () => {
      const res = await request(app.getHttpServer()).get('/oidc/auth').query({
        client_id: 'hub',
        response_type: 'code',
        scope: 'openid',
        redirect_uri: 'https://hub.exemplo.invalid/api/auth/callback',
      });
      // Sem code_challenge: o provedor recusa (PKCE obrigatório) e devolve o
      // erro para a redirect_uri CADASTRADA (303), como manda o OAuth.
      expect(res.status).toBe(303);
      const destino = new URL(res.headers.location);
      expect(destino.origin + destino.pathname).toBe(
        'https://hub.exemplo.invalid/api/auth/callback',
      );
      expect(destino.searchParams.get('error')).toBe('invalid_request');
      expect(destino.searchParams.get('error_description')).toMatch(/PKCE/);
    });
  });

  describe('sem as variáveis', () => {
    it('18. OIDC DESLIGADO: /oidc responde 503; o login atual continua 200', async () => {
      for (const k of Object.keys(VARS)) delete process.env[k];
      const { app, provider } = await subir();
      try {
        expect(provider).toBeNull();
        const r = await request(app.getHttpServer())
          .get('/oidc/.well-known/openid-configuration')
          .expect(503);
        expect(r.body.message).toBe('Login central indisponível');
        await request(app.getHttpServer())
          .post('/api/login')
          .send({ email: 'pessoa@example.invalid', password: SENHA })
          .expect(200);
        expect(
          logs.some((l) => l.startsWith('oidc:') && l.includes('DESLIGADO')),
        ).toBe(true);
      } finally {
        await app.close();
      }
    });
  });

  it('19. nenhum segredo (chave privada, chave de cookie, segredo de cliente) apareceu em log', () => {
    expect(logs.length).toBeGreaterThan(0);
    const tudo = logs.join('\n');
    for (const s of SEGREDOS) expect(tudo.includes(String(s))).toBe(false);
    expect(tudo).toContain('oidc: issuer=ok(https, fixo)');
  });
});

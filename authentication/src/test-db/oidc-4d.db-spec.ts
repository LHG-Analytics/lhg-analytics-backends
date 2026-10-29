// 1d-D4: IP real pelo proxy do HUB (x-hub-client-ip + HUB_PROXY_KEY), rate
// limit das rotas /oidc e das /api pelo IP real, cabeçalhos de segurança e o
// IP preso no envio do back-channel (DNS rebinding). No banco migrado de
// verdade, com o app montado como o main.ts. Chaves e segredos de TESTE
// gerados aqui, na hora. Numeração = testes obrigatórios da 1d (17).
import { INestApplication, Logger } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as net from 'net';
import * as request from 'supertest';
import { HubThrottlerGuard } from '../common/hub-throttler.guard';
import { LIMITES } from '../oidc/oidc-rate-limit';
import { enviarComIpFixo } from '../oidc/oidc-outbox';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const CHAVE = crypto.randomBytes(32).toString('hex');
const LIMITE_API = 3;
const jwk = {
  ...crypto
    .generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'jwk' }),
  kid: 'chave-nova',
};
const VARS = {
  OIDC_ISSUER: ISSUER,
  OIDC_JWKS: JSON.stringify({ keys: [jwk] }),
  OIDC_COOKIE_KEYS: [
    crypto.randomBytes(32).toString('hex'),
    crypto.randomBytes(32).toString('hex'),
  ].join(','),
  OIDC_MINIMAL_LOGIN_PAGE: 'true',
  HUB_PROXY_KEY: CHAVE,
};

describe('1d-D4: IP real, rate limit e cabeçalhos', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let pessoa: { id: number; email: string };
  const logs: string[] = [];
  const espioes: jest.SpyInstance[] = [];
  let seq = 0;
  /** Um IP público de documentação diferente a cada chamada. */
  const outroIp = () => `203.0.113.${(++seq % 250) + 1}`;
  const doHub = (ip: string, chave = CHAVE) => ({
    'x-hub-proxy-key': chave,
    'x-hub-client-ip': ip,
  });

  beforeAll(async () => {
    url = novoSchema('td4');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    pessoa = await db.user.create({
      data: {
        email: 'ip@example.invalid',
        name: 'Pessoa IP',
        password: bcrypt.hashSync(SENHA, 4),
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        systemAccesses: { create: { systemKey: 'analytics' } },
      },
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
    // Throttler das rotas /api com limite baixo, pelo guard do IP real.
    ({ app } = await subirComoMain(undefined, {
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: LIMITE_API }])],
      providers: [{ provide: APP_GUARD, useClass: HubThrottlerGuard }],
      limitarTaxa: true,
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

  const login = (headers: Record<string, string>, senha = 'errada-000000') =>
    request(srv)
      .post('/api/login')
      .set(headers)
      .send({ email: pessoa.email, password: senha });

  describe('17. rate limit das /api pelo IP REAL', () => {
    it('com o segredo certo, cada x-hub-client-ip tem o seu balde (nenhum 429)', async () => {
      for (let i = 0; i < LIMITE_API + 2; i++) {
        const r = await login(doHub(outroIp()));
        expect(r.status).toBe(401);
      }
    });

    it('com o segredo ERRADO, o cabeçalho é ignorado: todos caem no mesmo balde (req.ip) → 429', async () => {
      const status: number[] = [];
      for (let i = 0; i < LIMITE_API + 1; i++) {
        status.push((await login(doHub(outroIp(), 'x'.repeat(64)))).status);
      }
      expect(status.slice(0, LIMITE_API).every((s) => s === 401)).toBe(true);
      expect(status[LIMITE_API]).toBe(429);
    });
  });

  it('17. auditoria: com o segredo certo, o IP gravado é o x-hub-client-ip', async () => {
    // Desbloqueia a conta (os 401 acima contaram no bloqueio por conta).
    const limpar = () =>
      db.user.update({
        where: { id: pessoa.id },
        data: {
          failedLoginCount: 0,
          failedLoginFirstAt: null,
          lockedUntil: null,
          lockLevel: 0,
        },
      });
    await limpar();
    const ipCerto = '203.0.113.200';
    await login(doHub(ipCerto));
    const certo = await db.auditEvent.findFirst({
      where: { action: 'login.failed', targetUserId: pessoa.id },
      orderBy: { id: 'desc' },
    });
    expect(certo!.ip).toBe(ipCerto);
  });

  describe('17. rate limit do /oidc pelo IP REAL', () => {
    const postLogin = (headers: Record<string, string>) =>
      request(srv)
        .post('/oidc/interaction/qualquer/login')
        .set(headers)
        .type('form')
        .send({ email: 'x@example.invalid', password: 'y' });

    it(`login: ${LIMITES.login}/min por IP; o seguinte → 429 com Retry-After`, async () => {
      const ip = '203.0.113.250';
      for (let i = 0; i < LIMITES.login; i++) {
        expect((await postLogin(doHub(ip))).status).not.toBe(429);
      }
      const r = await postLogin(doHub(ip));
      expect(r.status).toBe(429);
      expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
      expect(r.body.message).toMatch(/Muitas tentativas/);
    });

    it('com o segredo certo e IPs diferentes, ninguém é barrado', async () => {
      for (let i = 0; i < LIMITES.login + 2; i++) {
        expect((await postLogin(doHub(outroIp()))).status).not.toBe(429);
      }
    });

    it('com o segredo ERRADO, trocar o x-hub-client-ip NÃO escapa do limite', async () => {
      const status: number[] = [];
      for (let i = 0; i < LIMITES.login + 1; i++) {
        status.push((await postLogin(doHub(outroIp(), 'y'.repeat(64)))).status);
      }
      expect(status[LIMITES.login]).toBe(429);
    });
  });

  it('cabeçalhos de segurança no /oidc', async () => {
    const r = await request(srv)
      .get('/oidc/.well-known/openid-configuration')
      .expect(200);
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(r.headers['permissions-policy']).toContain('camera=()');
    expect(r.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
  });

  it('DNS rebinding: o envio conecta no IP PRESO, sem consultar o DNS do nome', async () => {
    // Servidor TCP local: o nome do destino NÃO existe no DNS; se a conexão
    // chega aqui, foi pelo IP fixo.
    let conexoes = 0;
    const servidor = net.createServer((s) => {
      conexoes++;
      s.destroy();
    });
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    const porta = (servidor.address() as net.AddressInfo).port;
    try {
      await expect(
        enviarComIpFixo(
          `https://nome-que-nao-existe.exemplo.invalid:${porta}/bc`,
          'logout_token=x',
          '127.0.0.1',
        ),
      ).rejects.toBeTruthy();
      expect(conexoes).toBe(1);
    } finally {
      await new Promise((r) => servidor.close(r));
    }
  });

  it('boot: a linha do IP não mostra a chave', () => {
    const tudo = logs.join('\n');
    expect(tudo.includes(CHAVE)).toBe(false);
    expect(tudo.includes(SENHA)).toBe(false);
  });
});

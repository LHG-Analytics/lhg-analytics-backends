// 1d-D3: logout no login central. End_session (logout do HUB), inativação,
// troca de senha e revogação de flag REVOGAM o grant/refresh dos clientes
// (condição do HUB para o refresh de 7 dias) e enfileiram o aviso de
// back-channel no Outbox; o worker envia (receptor de TESTE dentro do teste),
// tenta de novo e, no fim da janela, gera outbox.failed + linha de ALERTA.
// Chaves e segredos de TESTE gerados aqui, na hora. Numeração = testes
// obrigatórios da 1d (14 a 16).
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { JWK, SignJWT, createLocalJWKSet, importJWK, jwtVerify } from 'jose';
import * as request from 'supertest';
import { AccessService } from '../access/access.service';
import { AuthService } from '../auth/auth.service';
import {
  EVENTO_BACKCHANNEL,
  Enviar,
  OutboxWorker,
  esperaMin,
  ipPublico,
  lerMaxHoras,
} from '../oidc/oidc-outbox';
import { UsersService } from '../users/users.service';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import {
  Pote,
  fluxo,
  lerJwt,
  local,
  sessaoDo,
  subirComoMain,
} from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SENHA = 'senha-de-teste-123';
const NOVA = 'senha-nova-de-teste-456';
const jwk = (kid: string) => ({
  ...crypto
    .generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'jwk' }),
  kid,
});
const K1 = jwk('chave-nova');
const segredo = () => crypto.randomBytes(32).toString('hex');
const CLIENTES = {
  hub: {
    segredo: segredo(),
    redirect: 'https://hub.exemplo.invalid/api/auth/callback',
  },
  sistema: {
    segredo: segredo(),
    redirect: 'https://sistema.exemplo.invalid/cb',
  },
  outro: { segredo: segredo(), redirect: 'https://outro.exemplo.invalid/cb' },
};
const BC = {
  hub: 'https://hub.exemplo.invalid/backchannel',
  sistema: 'https://sistema.exemplo.invalid/backchannel',
  outro: 'https://outro.exemplo.invalid/backchannel',
};
const VARS = {
  OIDC_ISSUER: ISSUER,
  OIDC_JWKS: JSON.stringify({ keys: [K1] }),
  OIDC_COOKIE_KEYS: [segredo(), segredo()].join(','),
  OIDC_CLIENT_SECRET_HUB: CLIENTES.hub.segredo,
  OIDC_CLIENT_SECRET_SISTEMA: CLIENTES.sistema.segredo,
  OIDC_CLIENT_SECRET_OUTRO: CLIENTES.outro.segredo,
  OIDC_MINIMAL_LOGIN_PAGE: 'true',
};

/**
 * Receptor de teste: guarda cada POST (com o IP para onde a conexão iria) e
 * responde o status pedido por host.
 */
class Receptor {
  recebidos: { url: string; corpo: string; ip: string }[] = [];
  status = new Map<string, number>();
  enviar: Enviar = async (url, corpo, ip) => {
    this.recebidos.push({ url, corpo, ip });
    return this.status.get(new URL(url).hostname) ?? 200;
  };
  limpar() {
    this.recebidos = [];
  }
}

describe('1d-D3: logout e back-channel', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let f: ReturnType<typeof fluxo>;
  let jwks: ReturnType<typeof createLocalJWKSet>;
  const logs: string[] = [];
  const espioes: jest.SpyInstance[] = [];
  const receptor = new Receptor();
  let worker: OutboxWorker;
  let ips: Record<string, string[]> = {};

  async function pessoa(tag: string) {
    return db.user.create({
      data: {
        email: `${tag}@example.invalid`,
        name: `Pessoa ${tag}`,
        password: bcrypt.hashSync(SENHA, 4),
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        systemAccesses: {
          create: [{ systemKey: 'analytics' }, { systemKey: 'rm' }],
        },
      },
    });
  }

  const outbox = (sub: string) =>
    db.outbox.findMany({ where: { sub }, orderBy: { id: 'asc' } });
  const novoWorker = (deps: Record<string, unknown> = {}, maxHoras = 24) =>
    new OutboxWorker(db as any, app.get(AccessService), ISSUER, K1, maxHoras, {
      enviar: receptor.enviar,
      resolver: async (h: string) => ips[h] ?? ['203.0.113.10'],
      ...deps,
    });

  /** Confere um logout token recebido: assinatura, iss, aud, events, sem nonce. */
  async function conferirToken(corpo: string, aud: string) {
    const token = new URLSearchParams(corpo).get('logout_token')!;
    expect(token).toBeTruthy();
    const { payload, protectedHeader } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: aud,
    });
    expect(protectedHeader).toMatchObject({
      alg: 'RS256',
      kid: 'chave-nova',
      typ: 'logout+jwt',
    });
    expect(payload.events).toEqual({ [EVENTO_BACKCHANNEL]: {} });
    expect(payload).not.toHaveProperty('nonce');
    expect(payload.jti).toBeTruthy();
    return payload;
  }

  beforeAll(async () => {
    url = novoSchema('td3');
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
          backchannelLogoutUri: BC.hub,
        },
        {
          clientId: 'sistema',
          name: 'Sistema (analytics)',
          systemKey: 'analytics',
          redirectUris: [CLIENTES.sistema.redirect],
          backchannelLogoutUri: BC.sistema,
        },
        {
          clientId: 'outro',
          name: 'Outro (rm)',
          systemKey: 'rm',
          redirectUris: [CLIENTES.outro.redirect],
          backchannelLogoutUri: BC.outro,
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
    jwks = createLocalJWKSet((await request(srv).get('/oidc/jwks')).body);
    worker = novoWorker();
  });

  afterAll(async () => {
    await app?.close();
    espioes.forEach((e) => e.mockRestore());
    for (const k of Object.keys(VARS)) delete process.env[k];
    await db.$disconnect();
    await apagarSchema(url);
  });

  beforeEach(async () => {
    // Cada teste vê só a fila dele.
    await db.outbox.updateMany({
      where: { status: 'pending' },
      data: { status: 'sent' },
    });
    receptor.limpar();
    receptor.status.clear();
    ips = {};
  });

  it('discovery anuncia o back-channel com sid, e o id_token leva o sid', async () => {
    const d = (await request(srv).get('/oidc/.well-known/openid-configuration'))
      .body;
    expect(d.backchannel_logout_supported).toBe(true);
    expect(d.backchannel_logout_session_supported).toBe(true);
    const u = await pessoa('sid');
    const { tokens } = await f.entrar(new Pote(), 'hub', u.email, SENHA);
    expect(lerJwt(tokens.id_token).payload.sid).toBeTruthy();
  });

  it('logout no HUB (end_session, sair de tudo): sessão destruída, grants/refresh de TODOS os clientes revogados, 1 aviso por cliente com o sid certo', async () => {
    const u = await pessoa('sai');
    const pote = new Pote();
    const hub = await f.entrar(pote, 'hub', u.email, SENHA);
    const sis = await f.entrar(pote, 'sistema', u.email, SENHA);
    const sidHub = lerJwt(hub.tokens.id_token).payload.sid;
    const sidSis = lerJwt(sis.tokens.id_token).payload.sid;

    const pag = pote.guardar(
      await request(srv)
        .get('/oidc/session/end')
        .set('Cookie', pote.header())
        .query({
          client_id: 'hub',
          id_token_hint: hub.tokens.id_token,
          post_logout_redirect_uri: 'https://hub.exemplo.invalid/',
        }),
    );
    expect(pag.status).toBe(200);
    const xsrf = /name="xsrf" value="([^"]+)"/.exec(pag.text)![1];
    const fim = pote.guardar(
      await request(srv)
        .post('/oidc/session/end/confirm')
        .set('Cookie', pote.header())
        .type('form')
        .send({ xsrf, logout: 'yes' }),
    );
    expect(fim.status).toBe(303);
    expect(fim.headers.location).toBe('https://hub.exemplo.invalid/');

    // Os avisos entram pelo evento do provedor (assíncrono).
    await new Promise((r) => setTimeout(r, 200));
    const fila = await outbox(u.publicId);
    expect(fila.map((o) => [o.clientId, o.sid, o.event]).sort()).toEqual(
      [
        ['hub', sidHub, 'logout'],
        ['sistema', sidSis, 'logout'],
      ].sort(),
    );
    expect((await f.refresh('hub', hub.tokens.refresh_token)).body.error).toBe(
      'invalid_grant',
    );
    expect(
      (await f.refresh('sistema', sis.tokens.refresh_token)).body.error,
    ).toBe('invalid_grant');
    expect(
      await db.oidcPayload.count({
        where: { type: 'Session', accountId: u.publicId },
      }),
    ).toBe(0);

    // O worker envia: logout token no CORPO, assinado, com o sid de cada um.
    await worker.rodarUmaVez();
    expect(receptor.recebidos.map((r) => r.url).sort()).toEqual(
      [BC.hub, BC.sistema].sort(),
    );
    for (const r of receptor.recebidos) {
      expect(r.url).not.toContain('logout_token');
      // (D4) a conexão vai para o IP conferido pelo anti-SSRF.
      expect(r.ip).toBe('203.0.113.10');
      const aud = r.url === BC.hub ? 'hub' : 'sistema';
      const p = await conferirToken(r.corpo, aud);
      expect(p.sub).toBe(u.publicId);
      expect(p.sid).toBe(aud === 'hub' ? sidHub : sidSis);
    }
    expect((await outbox(u.publicId)).every((o) => o.status === 'sent')).toBe(
      true,
    );
  });

  describe('Sair do HUB sem página de confirmação (id_token_hint validado)', () => {
    const POS = 'https://hub.exemplo.invalid/';
    const fim = (pote: Pote, query: Record<string, string>) =>
      request(srv)
        .get('/oidc/session/end')
        .set('Cookie', pote.header())
        // Como o navegador: erros saem na página HTML (renderError).
        .set('Accept', 'text/html')
        .query(query)
        .then((r) => pote.guardar(r));
    /** O que o navegador faz sozinho: envia o form da página (xsrf + logout). */
    const enviarForm = (pote: Pote, pagina: string) => {
      const campos = Object.fromEntries(
        [
          ...pagina.matchAll(
            /<input type="hidden" name="([^"]+)" value="([^"]*)"/g,
          ),
        ].map((m) => [m[1], m[2]]),
      );
      return request(srv)
        .post('/oidc/session/end/confirm')
        .set('Cookie', pote.header())
        .type('form')
        .send(campos)
        .then((r) => pote.guardar(r));
    };
    const hashDoScript = (pagina: string) =>
      `'sha256-${crypto
        .createHash('sha256')
        .update(/<script>([\s\S]*?)<\/script>/.exec(pagina)![1], 'utf8')
        .digest('base64')}'`;

    it('hint válido: a página se envia sozinha (sem pergunta, sem clique); a sessão SSO e os grants caem, o back-channel é enfileirado e vai ao post_logout', async () => {
      const u = await pessoa('direto');
      const pote = new Pote();
      const hub = await f.entrar(pote, 'hub', u.email, SENHA);
      const sis = await f.entrar(pote, 'sistema', u.email, SENHA);

      const pag = await fim(pote, {
        client_id: 'hub',
        id_token_hint: hub.tokens.id_token,
        post_logout_redirect_uri: POS,
      });
      expect(pag.status).toBe(200);
      expect(pag.text).not.toContain('Sair de todos os sistemas da LHG?');
      expect(pag.text).toContain('name="logout" value="yes"');
      expect(pag.text).toMatch(
        /<noscript><button[^>]*>Continuar<\/button><\/noscript>/,
      );
      // O script inline é liberado SÓ pelo hash dele, sem 'unsafe-inline'.
      const csp = pag.headers['content-security-policy'];
      expect(csp).toContain(
        `script-src 'report-sample' ${hashDoScript(pag.text)}`,
      );
      expect(csp).not.toContain('unsafe-inline');

      const r = await enviarForm(pote, pag.text);
      expect(r.status).toBe(303);
      expect(r.headers.location).toBe(POS);
      await new Promise((ok) => setTimeout(ok, 200));
      expect(
        await db.oidcPayload.count({
          where: { type: 'Session', accountId: u.publicId },
        }),
      ).toBe(0);
      expect(
        (await f.refresh('hub', hub.tokens.refresh_token)).body.error,
      ).toBe('invalid_grant');
      expect(
        (await f.refresh('sistema', sis.tokens.refresh_token)).body.error,
      ).toBe('invalid_grant');
      expect((await outbox(u.publicId)).map((o) => o.clientId).sort()).toEqual([
        'hub',
        'sistema',
      ]);
    });

    it('hint VENCIDO (assinado pelo issuer, exp no passado) também é aceito: saída direta', async () => {
      const u = await pessoa('vencido');
      const pote = new Pote();
      const hub = await f.entrar(pote, 'hub', u.email, SENHA);
      const agora = Math.floor(Date.now() / 1000);
      const vencido = await new SignJWT({
        sid: lerJwt(hub.tokens.id_token).payload.sid,
      })
        .setProtectedHeader({ alg: 'RS256', kid: K1.kid })
        .setIssuer(ISSUER)
        .setAudience('hub')
        .setSubject(u.publicId)
        .setIssuedAt(agora - 3600)
        .setExpirationTime(agora - 3000)
        .sign(await importJWK(K1 as JWK, 'RS256'));
      const pag = await fim(pote, {
        client_id: 'hub',
        id_token_hint: vencido,
        post_logout_redirect_uri: POS,
      });
      expect(pag.status).toBe(200);
      expect(pag.text).toContain('name="logout" value="yes"');
      expect(pag.text).not.toContain('Sair de todos os sistemas da LHG?');
      const r = await enviarForm(pote, pag.text);
      expect(r.status).toBe(303);
      expect(r.headers.location).toBe(POS);
    });

    it('hint de OUTRO cliente: recusado (client_id diferente do aud, ou post_logout que não é do cliente do hint); a sessão continua', async () => {
      const u = await pessoa('outrocli');
      const pote = new Pote();
      await f.entrar(pote, 'hub', u.email, SENHA);
      const sis = await f.entrar(pote, 'sistema', u.email, SENHA);
      const a = await fim(pote, {
        client_id: 'hub',
        id_token_hint: sis.tokens.id_token,
        post_logout_redirect_uri: POS,
      });
      expect(a.status).toBe(400);
      expect(a.text).toContain('Não foi possível continuar');
      expect(a.text).not.toContain('name="logout"');
      const b = await fim(pote, {
        id_token_hint: sis.tokens.id_token,
        post_logout_redirect_uri: POS,
      });
      expect(b.status).toBe(400);
      expect(b.text).not.toContain('name="logout"');
      expect(
        await db.oidcPayload.count({
          where: { type: 'Session', accountId: u.publicId },
        }),
      ).toBe(1);
    });

    it('hint válido de OUTRA pessoa: não sai direto (mostra a confirmação)', async () => {
      const a = await pessoa('dona');
      const b = await pessoa('alheia');
      const pote = new Pote();
      await f.entrar(pote, 'hub', a.email, SENHA);
      const doB = await f.entrar(new Pote(), 'hub', b.email, SENHA);
      const pag = await fim(pote, {
        client_id: 'hub',
        id_token_hint: doB.tokens.id_token,
        post_logout_redirect_uri: POS,
      });
      expect(pag.status).toBe(200);
      expect(pag.text).toContain('Sair de todos os sistemas da LHG?');
      expect(pag.text).not.toContain('<script');
    });

    it('SEM hint (só client_id, como o CMS): confirmação ESTILIZADA no visual do HUB, em pt, sem script e sem nada externo; CSP sem unsafe-inline', async () => {
      const u = await pessoa('semhint');
      const pote = new Pote();
      await f.entrar(pote, 'hub', u.email, SENHA);
      const pag = await fim(pote, {
        client_id: 'hub',
        post_logout_redirect_uri: POS,
      });
      expect(pag.status).toBe(200);
      expect(pag.text).toContain('<html lang="pt-BR">');
      expect(pag.text).toContain('Sair de todos os sistemas da LHG?');
      expect(pag.text).toMatch(/name="logout"[^>]*>Sair<\/button>/);
      expect(pag.text).toContain('>Continuar conectado</button>');
      expect(pag.text).toContain('#4A3059');
      expect(pag.text).toContain('prefers-color-scheme:dark');
      expect(pag.text).not.toContain('<script');
      expect(pag.text).not.toMatch(/https?:\/\/(?!hub\.exemplo\.invalid)/);
      const csp = pag.headers['content-security-policy'];
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).toMatch(/script-src 'report-sample'(;|$)/);
      // O <style> é liberado pelo hash dele.
      const estilo = /<style>([\s\S]*?)<\/style>/.exec(pag.text)![1];
      const h = crypto
        .createHash('sha256')
        .update(estilo, 'utf8')
        .digest('base64');
      expect(csp).toContain(`style-src 'sha256-${h}'`);

      // Clique em "Sair": sai de tudo e vai ao post_logout.
      const r = await request(srv)
        .post('/oidc/session/end/confirm')
        .set('Cookie', pote.header())
        .type('form')
        .send({
          xsrf: /name="xsrf" value="([^"]+)"/.exec(pag.text)![1],
          logout: 'yes',
        });
      expect(r.status).toBe(303);
      expect(r.headers.location).toBe(POS);
    });

    it('página de "você saiu" (sem redirect) e de erro também no visual do HUB', async () => {
      const u = await pessoa('sucesso');
      const pote = new Pote();
      await f.entrar(pote, 'hub', u.email, SENHA);
      const pag = await fim(pote, {});
      const r = pote.guardar(
        await request(srv)
          .post('/oidc/session/end/confirm')
          .set('Cookie', pote.header())
          .type('form')
          .send({
            xsrf: /name="xsrf" value="([^"]+)"/.exec(pag.text)![1],
            logout: 'yes',
          }),
      );
      expect(r.status).toBe(303);
      const ok = await request(srv)
        .get(local(ISSUER, new URL(r.headers.location, ISSUER).toString()))
        .set('Cookie', pote.header());
      expect(ok.text).toContain('Você saiu.');
      expect(ok.text).toContain('#4A3059');
      const e = await request(srv).get('/oidc/auth').query({ client_id: 'x' });
      expect(e.status).toBe(400);
      expect(e.text).toContain('#4A3059');
      expect(e.headers['content-security-policy']).not.toContain(
        'unsafe-inline',
      );
    });
  });

  it('14. INATIVAR: todas as sessões SSO caem, grants/refresh de todos os clientes revogados, 1 envio por cliente com sessão', async () => {
    const u = await pessoa('inativa');
    const pote = new Pote();
    const hub = await f.entrar(pote, 'hub', u.email, SENHA);
    const out = await f.entrar(pote, 'outro', u.email, SENHA);
    await app.get(UsersService).remove(u.id);

    expect(
      await db.oidcPayload.count({ where: { accountId: u.publicId } }),
    ).toBe(0);
    expect((await f.refresh('hub', hub.tokens.refresh_token)).body.error).toBe(
      'invalid_grant',
    );
    expect(
      (await f.refresh('outro', out.tokens.refresh_token)).body.error,
    ).toBe('invalid_grant');
    const fila = await outbox(u.publicId);
    expect(fila.map((o) => [o.clientId, o.event]).sort()).toEqual(
      [
        ['hub', 'inactivation'],
        ['outro', 'inactivation'],
      ].sort(),
    );
    await worker.rodarUmaVez();
    expect(receptor.recebidos).toHaveLength(2);
    for (const r of receptor.recebidos) {
      const p = await conferirToken(
        r.corpo,
        r.url === BC.hub ? 'hub' : 'outro',
      );
      expect(p.sub).toBe(u.publicId);
    }
  });

  it('15. REVOGAR a flag do sistema X → logout SÓ no cliente X; os outros continuam (refresh e SSO)', async () => {
    const u = await pessoa('flag');
    const pote = new Pote();
    const hub = await f.entrar(pote, 'hub', u.email, SENHA);
    const sis = await f.entrar(pote, 'sistema', u.email, SENHA);
    const out = await f.entrar(pote, 'outro', u.email, SENHA);

    // Fica só com 'rm': perde o 'analytics' (o do cliente 'sistema').
    await app.get(UsersService).setSystems(u.id, ['rm']);

    const fila = await outbox(u.publicId);
    expect(fila.map((o) => [o.clientId, o.event])).toEqual([
      ['sistema', 'flag_revoked'],
    ]);
    expect(
      (await f.refresh('sistema', sis.tokens.refresh_token)).body.error,
    ).toBe('invalid_grant');
    expect((await f.refresh('hub', hub.tokens.refresh_token)).status).toBe(200);
    expect((await f.refresh('outro', out.tokens.refresh_token)).status).toBe(
      200,
    );
    // A sessão SSO continua: o 'outro' recebe o code sem pedir senha.
    const a = await f.autorizar(pote, 'outro');
    expect(new URL(a.headers.location).searchParams.get('code')).toBeTruthy();
  });

  it('16. TROCA DE SENHA: as OUTRAS sessões SSO caem e os clientes delas são avisados; a atual continua (inclusive o refresh dela)', async () => {
    const u = await pessoa('troca');
    const atual = new Pote();
    const outra = new Pote();
    const hubAtual = await f.entrar(atual, 'hub', u.email, SENHA);
    const hubOutra = await f.entrar(outra, 'hub', u.email, SENHA);
    const outOutra = await f.entrar(outra, 'outro', u.email, SENHA);
    const sidOutra = lerJwt(hubOutra.tokens.id_token).payload.sid;

    await app
      .get(AuthService)
      .changePassword(u.id, SENHA, NOVA, undefined, {}, sessaoDo(atual));

    const fila = await outbox(u.publicId);
    expect(fila.map((o) => [o.clientId, o.event]).sort()).toEqual(
      [
        ['hub', 'password_change'],
        ['outro', 'password_change'],
      ].sort(),
    );
    expect(fila.find((o) => o.clientId === 'hub')!.sid).toBe(sidOutra);

    expect((await f.refresh('hub', hubAtual.tokens.refresh_token)).status).toBe(
      200,
    );
    expect(
      (await f.refresh('hub', hubOutra.tokens.refresh_token)).body.error,
    ).toBe('invalid_grant');
    expect(
      (await f.refresh('outro', outOutra.tokens.refresh_token)).body.error,
    ).toBe('invalid_grant');

    const a = await f.autorizar(atual, 'hub');
    expect(new URL(a.headers.location).searchParams.get('code')).toBeTruthy();
    const b = await f.autorizar(outra, 'hub');
    expect(b.headers.location).toMatch(/\/interaction\//);
  });

  it('14. cliente fora do ar → novas tentativas com espera crescente; no fim da janela, failed + outbox.failed + linha de ALERTA (sem corpo da resposta)', async () => {
    const u = await pessoa('fora');
    await f.entrar(new Pote(), 'outro', u.email, SENHA);
    await app.get(UsersService).remove(u.id);
    receptor.status.set('outro.exemplo.invalid', 503);

    await worker.rodarUmaVez();
    let [o] = await outbox(u.publicId);
    expect(o).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastErrorCode: '503',
    });
    const espera1 = o.nextAttemptAt.getTime() - Date.now();
    expect(espera1).toBeGreaterThan(50 * 1000);
    expect(espera1).toBeLessThanOrEqual(61 * 1000);

    // 2ª tentativa (já vencida): espera dobra.
    await db.outbox.update({
      where: { id: o.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await worker.rodarUmaVez();
    [o] = await outbox(u.publicId);
    expect(o.attempts).toBe(2);
    expect(o.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(110 * 1000);

    // Passou da janela (24 h): failed, auditoria e ALERTA.
    await db.outbox.update({
      where: { id: o.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    const tarde = novoWorker({
      agora: () => new Date(Date.now() + 25 * 3600 * 1000),
    });
    await tarde.rodarUmaVez();
    [o] = await outbox(u.publicId);
    expect(o).toMatchObject({
      status: 'failed',
      attempts: 3,
      lastErrorCode: '503',
    });
    const ev = await db.auditEvent.findFirst({
      where: { action: 'outbox.failed' },
      orderBy: { id: 'desc' },
    });
    expect(ev).toMatchObject({ targetUserId: u.id });
    expect(ev!.metadata).toMatchObject({
      clientId: 'outro',
      event: 'inactivation',
      attempts: 3,
      lastErrorCode: '503',
    });
    expect(
      logs.some((l) =>
        /ALERTA outbox\.failed cliente=outro evento=inactivation tentativas=3 ultimo=503/.test(
          l,
        ),
      ),
    ).toBe(true);
  });

  it('OIDC_OUTBOX_MAX_HORAS (1 a 24, padrão 24): na homologação, 1 h encerra antes', async () => {
    expect(lerMaxHoras(undefined)).toBe(24);
    expect(lerMaxHoras('1')).toBe(1);
    expect(lerMaxHoras('0')).toBe(24);
    expect(lerMaxHoras('25')).toBe(24);
    expect(lerMaxHoras('1.5')).toBe(24);
    expect([1, 2, 3, 4, 7, 8].map(esperaMin)).toEqual([1, 2, 4, 8, 60, 60]);

    const u = await pessoa('uma-hora');
    await f.entrar(new Pote(), 'outro', u.email, SENHA);
    await app.get(UsersService).remove(u.id);
    receptor.status.set('outro.exemplo.invalid', 404);
    const umaHora = novoWorker(
      { agora: () => new Date(Date.now() + 61 * 60 * 1000) },
      1,
    );
    await umaHora.rodarUmaVez();
    const [o] = await outbox(u.publicId);
    expect(o).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastErrorCode: '404',
    });
  });

  it('anti-SSRF: destino que resolve para IP privado/loopback/metadados não recebe nada; redirect não é seguido', async () => {
    for (const ip of [
      '10.0.0.5',
      '127.0.0.1',
      '169.254.169.254',
      '192.168.1.1',
      '::1',
      'fd00::1',
    ]) {
      expect(ipPublico(ip)).toBe(false);
    }
    expect(ipPublico('203.0.113.10')).toBe(true);

    const u = await pessoa('ssrf');
    await f.entrar(new Pote(), 'outro', u.email, SENHA);
    await app.get(UsersService).remove(u.id);
    ips['outro.exemplo.invalid'] = ['10.0.0.5'];
    await worker.rodarUmaVez();
    expect(receptor.recebidos).toHaveLength(0);
    let [o] = await outbox(u.publicId);
    expect(o.lastErrorCode).toBe('ssrf');

    // Redirect: conta como falha (código 302), sem seguir.
    ips = {};
    receptor.status.set('outro.exemplo.invalid', 302);
    await db.outbox.update({
      where: { id: o.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await worker.rodarUmaVez();
    [o] = await outbox(u.publicId);
    expect(o.lastErrorCode).toBe('302');
    expect(receptor.recebidos).toHaveLength(1);
    expect(receptor.recebidos[0].ip).toBe('203.0.113.10');
  });

  it('cliente sem backchannelLogoutUri não entra na fila (mas o grant dele cai do mesmo jeito)', async () => {
    await db.oidcClient.update({
      where: { clientId: 'outro' },
      data: { backchannelLogoutUri: null },
    });
    try {
      const u = await pessoa('sem-uri');
      const out = await f.entrar(new Pote(), 'outro', u.email, SENHA);
      await app.get(UsersService).remove(u.id);
      expect(await outbox(u.publicId)).toHaveLength(0);
      expect(
        (await f.refresh('outro', out.tokens.refresh_token)).body.error,
      ).toBe('invalid_grant');
    } finally {
      await db.oidcClient.update({
        where: { clientId: 'outro' },
        data: { backchannelLogoutUri: BC.outro },
      });
    }
  });

  it('19. nenhum logout token, segredo ou senha em log', () => {
    const tudo = logs.join('\n');
    for (const s of [
      SENHA,
      NOVA,
      ...Object.values(CLIENTES).map((c) => c.segredo),
      String(K1.d),
    ])
      expect(tudo.includes(s)).toBe(false);
    expect(tudo).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./);
    expect(tudo).toContain('outbox=24h');
  });

  it('o caminho local usado nos testes bate com o issuer', () => {
    expect(local(ISSUER, `${ISSUER}/session/end`)).toBe('/oidc/session/end');
  });
});

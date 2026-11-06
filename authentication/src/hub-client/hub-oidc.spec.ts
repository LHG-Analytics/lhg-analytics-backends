import * as crypto from 'crypto';
import { JWK, SignJWT, exportJWK, importJWK } from 'jose';
import {
  readHubClientSettings,
  resumoHubCliente,
  returnToSeguro,
  PADRAO_RETURN_TO,
} from './hub-client.settings';
import {
  HubOidc,
  TokenInvalido,
  chaveDosCookies,
  cifrar,
  decifrar,
} from './hub-oidc';

// Chaves e segredos de TESTE gerados aqui, na hora.
const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const SEG = crypto.randomBytes(32).toString('hex');
const novaChave = async (kid: string) => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    priv: privateKey,
    pub: {
      ...(await exportJWK(publicKey)),
      kid,
      alg: 'RS256',
      use: 'sig',
    } as JWK,
  };
};
const ENV = {
  HUB_OIDC_ISSUER: ISSUER,
  HUB_OIDC_CLIENT_ID: 'analytics',
  HUB_OIDC_CLIENT_SECRET: SEG,
  ANALYTICS_PUBLIC_URL: 'https://analytics.exemplo.invalid',
  HUB_PORTAL_URL: 'https://hub.exemplo.invalid/',
};
const settings = (extra: Record<string, string | undefined> = {}) =>
  readHubClientSettings((n) =>
    n in extra ? extra[n] : (ENV as Record<string, string>)[n],
  );

describe('hub-cliente: configuração', () => {
  it('com tudo: ATIVO; redirect_uri fixo a partir de ANALYTICS_PUBLIC_URL (só a origem)', () => {
    const s = settings({
      ANALYTICS_PUBLIC_URL:
        'https://analytics.exemplo.invalid/qualquer/caminho',
    });
    expect(s.ativo).toBe(true);
    expect(s.redirectUri).toBe(
      'https://analytics.exemplo.invalid/auth/api/hub/callback',
    );
    expect(resumoHubCliente(s).linha).toMatch(/^hub-cliente: ATIVO/);
    expect(resumoHubCliente(s).linha).not.toContain(SEG);
  });

  it.each([
    ['HUB_OIDC_CLIENT_SECRET', 'curto'],
    ['HUB_OIDC_CLIENT_SECRET', undefined],
    ['HUB_OIDC_ISSUER', 'http://hub.exemplo.invalid/auth/oidc'],
    ['ANALYTICS_PUBLIC_URL', 'http://analytics.exemplo.invalid'],
    ['ANALYTICS_PUBLIC_URL', undefined],
    ['HUB_PORTAL_URL', undefined],
  ])('%s=%s → DESLIGADO (sem valores na linha)', (k, v) => {
    const s = settings({ [k]: v });
    expect(s.ativo).toBe(false);
    expect(resumoHubCliente(s).linha).toMatch(/^hub-cliente: DESLIGADO \(/);
  });

  it('http://localhost só com OIDC_ALLOW_LOCALHOST_REDIRECTS=true', () => {
    expect(
      settings({ ANALYTICS_PUBLIC_URL: 'http://localhost:3000' }).ativo,
    ).toBe(false);
    expect(
      settings({
        ANALYTICS_PUBLIC_URL: 'http://localhost:3000',
        OIDC_ALLOW_LOCALHOST_REDIRECTS: 'true',
      }).ativo,
    ).toBe(true);
  });

  it('15. ANALYTICS_LOGIN_LOCAL=off SEM o cliente ativo: recusado (porta antiga aberta) + ALERTA no boot', () => {
    const s = settings({
      ANALYTICS_LOGIN_LOCAL: 'off',
      HUB_OIDC_CLIENT_SECRET: undefined,
    });
    expect(s.loginLocalFechado).toBe(false);
    expect(resumoHubCliente(s).alerta).toMatch(
      /^ALERTA hub-cliente: ANALYTICS_LOGIN_LOCAL=off RECUSADO/,
    );
    const ok = settings({ ANALYTICS_LOGIN_LOCAL: 'off' });
    expect(ok.loginLocalFechado).toBe(true);
    expect(resumoHubCliente(ok).alerta).toBeNull();
    expect(settings({ ANALYTICS_LOGIN_LOCAL: 'on' }).loginLocalFechado).toBe(
      false,
    );
  });
});

describe('4. returnTo seguro', () => {
  const P = PADRAO_RETURN_TO;
  it('padrão = página inicial real do front', () => {
    expect(P).toBe('/general?menu=general&set=ultimos_7_dias');
  });

  it.each([
    ['/', '/'],
    ['/painel', '/painel'],
    ['/painel?x=1#a', '/painel?x=1#a'],
    // a query string volta EXATAMENTE como veio
    [
      '/general?menu=general&set=ultimos_7_dias',
      '/general?menu=general&set=ultimos_7_dias',
    ],
    ['/general?menu=a%26b&set=x%3Dy', '/general?menu=a%26b&set=x%3Dy'],
    ['/a?next=https://x.invalid', '/a?next=https://x.invalid'],
    ['//x', P],
    ['//x.invalid/general?menu=general', P],
    ['/\\x', P],
    ['/a\\b', P],
    ['/a?x=\\', P],
    ['https://x', P],
    ['javascript:alert(1)', P],
    ['/javascript:alert(1)', P],
    ['/a\nb', P],
    ['/\tx.invalid', P],
    ['relatorios', P],
    ['?menu=general', P],
    ['/' + 'a'.repeat(600), P],
    ['', P],
    [undefined, P],
    [['/a'], P],
    [{ a: '/x' }, P],
  ])('%p → %p', (v, esperado) => {
    expect(returnToSeguro(v)).toBe(esperado);
  });

  it('o padrão pode ser outro (ANALYTICS_DEFAULT_RETURN_TO já validada)', () => {
    expect(returnToSeguro(undefined, '/outro')).toBe('/outro');
    expect(returnToSeguro('//x', '/outro')).toBe('/outro');
    expect(returnToSeguro('/painel', '/outro')).toBe('/painel');
  });
});

describe('ANALYTICS_DEFAULT_RETURN_TO (destino padrão depois do login)', () => {
  it('sem a variável: a página inicial real do front', () => {
    const s = settings();
    expect(s.defaultReturnTo).toBe(PADRAO_RETURN_TO);
    expect(s.defaultReturnToInvalido).toBe(false);
    expect(resumoHubCliente(s).alerta).toBeNull();
  });

  it('caminho relativo válido (com query): usado como está', () => {
    const s = settings({ ANALYTICS_DEFAULT_RETURN_TO: ' /painel?a=1&b=2 ' });
    expect(s.defaultReturnTo).toBe('/painel?a=1&b=2');
    expect(s.ativo).toBe(true);
  });

  it.each(['https://x.invalid/', '//x.invalid', '/a\\b', 'general', '/a\nb'])(
    'inválida (%p): usa o padrão, o cliente segue ATIVO e o boot mostra ALERTA sem o valor',
    (v) => {
      const s = settings({ ANALYTICS_DEFAULT_RETURN_TO: v });
      expect(s.ativo).toBe(true);
      expect(s.defaultReturnTo).toBe(PADRAO_RETURN_TO);
      expect(s.defaultReturnToInvalido).toBe(true);
      expect(resumoHubCliente(s).alerta).toBe(
        'ALERTA hub-cliente: ANALYTICS_DEFAULT_RETURN_TO inválida (não é caminho relativo seguro); usando o destino padrão',
      );
    },
  );
});

describe('cookies cifrados (JWE dir/A256GCM, chave derivada)', () => {
  it('ida e volta; chave de outro segredo, adulteração ou lixo → null', async () => {
    const k = chaveDosCookies(SEG);
    const c = await cifrar({ state: 's1' }, k);
    expect(c.split('.')).toHaveLength(5);
    expect(c).not.toContain('s1');
    expect(await decifrar(c, k)).toEqual({ state: 's1' });
    expect(await decifrar(c, chaveDosCookies(SEG + 'x'))).toBeNull();
    expect(await decifrar(c.slice(0, -3) + 'AAA', k)).toBeNull();
    expect(await decifrar('lixo', k)).toBeNull();
    expect(await decifrar(undefined, k)).toBeNull();
  });
});

describe('6. id_token: recusas', () => {
  let oidc: HubOidc;
  let boa: Awaited<ReturnType<typeof novaChave>>;
  let fora: Awaited<ReturnType<typeof novaChave>>;
  const NONCE = 'nonce-do-fluxo';

  beforeAll(async () => {
    boa = await novaChave('k-boa');
    fora = await novaChave('k-boa'); // mesmo kid, chave fora do JWKS
    const discovery = {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/auth`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
    };
    const buscar = async (url: string) =>
      new Response(
        JSON.stringify(url.endsWith('/jwks') ? { keys: [boa.pub] } : discovery),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    oidc = new HubOidc(settings(), buscar as any);
  });

  const assinar = async (
    claims: Record<string, unknown>,
    chave = boa,
    agora = Math.floor(Date.now() / 1000),
  ) =>
    new SignJWT({ nonce: NONCE, ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k-boa' })
      .setIssuer((claims.iss as string) ?? ISSUER)
      .setAudience((claims.aud as string) ?? 'analytics')
      .setSubject('00000000-0000-4000-8000-000000000001')
      .setIssuedAt((claims.iat as number) ?? agora)
      .setExpirationTime((claims.exp as number) ?? agora + 600)
      .sign(await importJWK(await exportJWK(chave.priv), 'RS256'));

  it('válido passa', async () => {
    const p = await oidc.validarIdToken(await assinar({}), NONCE);
    expect(p.sub).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('iss errado, aud de outro cliente, nonce errado, vencido, azp de outro, chave fora do JWKS → TokenInvalido', async () => {
    const agora = Math.floor(Date.now() / 1000);
    const casos = [
      await assinar({ iss: 'https://outro.exemplo.invalid/oidc' }),
      await assinar({ aud: 'hub' }),
      await assinar({ nonce: 'outro' }),
      await assinar({ iat: agora - 3600, exp: agora - 120 }),
      await assinar({ azp: 'hub' }),
      await assinar({}, fora),
      'nao-e-jwt',
    ];
    for (const t of casos) {
      await expect(oidc.validarIdToken(t, NONCE)).rejects.toBeInstanceOf(
        TokenInvalido,
      );
    }
  });

  it('tolerância de relógio de no máximo 30 s', async () => {
    const agora = Math.floor(Date.now() / 1000);
    await expect(
      oidc.validarIdToken(
        await assinar({ iat: agora - 700, exp: agora - 20 }),
        NONCE,
      ),
    ).resolves.toBeTruthy();
    await expect(
      oidc.validarIdToken(
        await assinar({ iat: agora - 700, exp: agora - 45 }),
        NONCE,
      ),
    ).rejects.toBeInstanceOf(TokenInvalido);
  });
});

describe('CORS: /api/hub/* fica fora do CORS do navegador', () => {
  it('delegado: /api/hub/* → origin false; o resto mantém as regras', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildCorsDelegate } = require('../common/http-setup');
    const d = buildCorsDelegate({});
    const opcoesDe = (url: string) => {
      let o: any;
      d({ url }, (_e: unknown, op: unknown) => (o = op));
      return o;
    };
    expect(opcoesDe('/api/hub/logout')).toEqual({ origin: false });
    expect(opcoesDe('/api/hub/callback?code=x')).toEqual({ origin: false });
    expect(typeof opcoesDe('/api/login').origin).toBe('function');
    expect(typeof opcoesDe('/api/hubx').origin).toBe('function');
  });
});

describe('ANALYTICS_BACKEND_URL (front e backend em hosts diferentes)', () => {
  const FRONT = 'https://analytics-front.exemplo.invalid';
  const BACK = 'https://analytics.exemplo.invalid';

  it('com a variável: redirect_uri no BACKEND; publicOrigin = front (destinos e CSRF)', () => {
    const s = settings({
      ANALYTICS_PUBLIC_URL: `${FRONT}/`,
      ANALYTICS_BACKEND_URL: `${BACK}/qualquer`,
    });
    expect(s.ativo).toBe(true);
    expect(s.publicOrigin).toBe(FRONT);
    expect(s.backendOrigin).toBe(BACK);
    expect(s.separados).toBe(true);
    expect(s.redirectUri).toBe(`${BACK}/auth/api/hub/callback`);
    expect(resumoHubCliente(s).linha).toContain('backend separado do front');
  });

  it('sem a variável: comportamento anterior (tudo no host de ANALYTICS_PUBLIC_URL)', () => {
    const s = settings({ ANALYTICS_PUBLIC_URL: FRONT });
    expect(s.backendOrigin).toBe(FRONT);
    expect(s.separados).toBe(false);
    expect(s.redirectUri).toBe(`${FRONT}/auth/api/hub/callback`);
    expect(resumoHubCliente(s).linha).toContain('mesmo host do front');
  });

  it('variável inválida (http, com credenciais) → DESLIGADO, sem valores na linha', () => {
    for (const v of [
      'http://analytics.exemplo.invalid',
      'https://u:p@analytics.exemplo.invalid',
      'lixo',
    ]) {
      const s = settings({ ANALYTICS_BACKEND_URL: v });
      expect(s.ativo).toBe(false);
      expect(resumoHubCliente(s).linha).toBe(
        'hub-cliente: DESLIGADO (ANALYTICS_BACKEND_URL inválida)',
      );
    }
  });
});

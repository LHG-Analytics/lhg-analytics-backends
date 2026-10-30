import * as crypto from 'crypto';
import { chavePublica, readOidcSettings } from './oidc.config';
import { redirectValida, secretVarName } from './oidc-clients';

// Chaves de TESTE geradas aqui, na hora: nada de chave no repositório.
const jwk = (kid: string) => ({
  ...crypto
    .generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'jwk' }),
  kid,
});
const K1 = jwk('teste-1');
const K2 = jwk('teste-2');
const COOKIES = [
  crypto.randomBytes(32).toString('hex'),
  crypto.randomBytes(32).toString('hex'),
];
const ENV = {
  OIDC_ISSUER: 'https://hub.exemplo.invalid/auth/oidc',
  OIDC_JWKS: JSON.stringify({ keys: [K1, K2] }),
  OIDC_COOKIE_KEYS: COOKIES.join(','),
};
const ler = (env: Record<string, string | undefined>) =>
  readOidcSettings((n) => env[n]);

describe('readOidcSettings (conferência do boot)', () => {
  it('tudo certo → ATIVO, com 2 chaves na ordem, e o resumo NÃO traz valores', () => {
    const s = ler(ENV);
    expect(s.enabled).toBe(true);
    expect(s.issuer).toBe(ENV.OIDC_ISSUER);
    expect(s.jwks.keys.map((k) => k.kid)).toEqual(['teste-1', 'teste-2']);
    expect(s.cookieKeys).toEqual(COOKIES);
    expect(s.resumo).toContain('jwks=ok(2 chave(s)');
    expect(s.resumo).toContain('ATIVO');
    for (const v of [
      ENV.OIDC_ISSUER,
      ...COOKIES,
      String(K1.d),
      String(K1.n),
      'teste-1',
    ]) {
      expect(s.resumo).not.toContain(v);
    }
  });

  it('aceita o formato JSON da lista de chaves dos cookies', () => {
    expect(
      ler({ ...ENV, OIDC_COOKIE_KEYS: JSON.stringify(COOKIES) }).cookieKeys,
    ).toEqual(COOKIES);
  });

  it.each([
    ['sem OIDC_ISSUER', { OIDC_ISSUER: undefined }],
    ['issuer http', { OIDC_ISSUER: 'http://hub.exemplo.invalid/auth/oidc' }],
    [
      'issuer com barra no fim',
      { OIDC_ISSUER: 'https://hub.exemplo.invalid/auth/oidc/' },
    ],
    [
      'issuer com query',
      { OIDC_ISSUER: 'https://hub.exemplo.invalid/auth/oidc?x=1' },
    ],
    ['sem OIDC_JWKS', { OIDC_JWKS: undefined }],
    ['JWKS que não é JSON', { OIDC_JWKS: 'nao-e-json' }],
    ['JWKS vazio', { OIDC_JWKS: '{"keys":[]}' }],
    [
      'chave PÚBLICA (sem d)',
      { OIDC_JWKS: JSON.stringify({ keys: [chavePublica(K1)] }) },
    ],
    [
      'chave sem kid',
      { OIDC_JWKS: JSON.stringify({ keys: [{ ...K1, kid: undefined }] }) },
    ],
    [
      'kid repetido',
      { OIDC_JWKS: JSON.stringify({ keys: [K1, { ...K2, kid: 'teste-1' }] }) },
    ],
    [
      'alg diferente de RS256',
      { OIDC_JWKS: JSON.stringify({ keys: [{ ...K1, alg: 'HS256' }] }) },
    ],
    ['sem OIDC_COOKIE_KEYS', { OIDC_COOKIE_KEYS: undefined }],
    ['chave de cookie curta', { OIDC_COOKIE_KEYS: 'curta' }],
  ])('%s → só o OIDC fica DESLIGADO', (_n, troca) => {
    const s = ler({ ...ENV, ...troca });
    expect(s.enabled).toBe(false);
    expect(s.resumo).toContain('DESLIGADO');
  });

  it('chavePublica tira TODAS as partes privadas', () => {
    const pub = chavePublica(K1);
    for (const p of ['d', 'p', 'q', 'dp', 'dq', 'qi'])
      expect(pub).not.toHaveProperty(p);
    expect(pub).toMatchObject({ kty: 'RSA', kid: 'teste-1', n: K1.n, e: K1.e });
  });
});

describe('clientes', () => {
  it('o segredo vem de OIDC_CLIENT_SECRET_<CLIENTE> (hífen vira _)', () => {
    expect(secretVarName('hub')).toBe('OIDC_CLIENT_SECRET_HUB');
    expect(secretVarName('lhg-rm')).toBe('OIDC_CLIENT_SECRET_LHG_RM');
  });
  it('redirect_uri: só https; http só para localhost e só se permitido', () => {
    expect(redirectValida('https://hub.exemplo.invalid/callback', false)).toBe(
      true,
    );
    expect(redirectValida('http://hub.exemplo.invalid/callback', false)).toBe(
      false,
    );
    expect(redirectValida('http://localhost:3000/callback', false)).toBe(false);
    expect(redirectValida('http://localhost:3000/callback', true)).toBe(true);
    expect(redirectValida('https://hub.exemplo.invalid/cb#frag', false)).toBe(
      false,
    );
    expect(redirectValida('https://u:s@hub.exemplo.invalid/cb', false)).toBe(
      false,
    );
  });
});

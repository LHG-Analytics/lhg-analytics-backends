import {
  checkGoogleDomain,
  parseWorkspaceDomains,
  readGoogleSettings,
} from './google.config';
import {
  pkceChallenge,
  randomToken,
  signState,
  verifyState,
} from './oauth-state';

const ENV = {
  GOOGLE_OAUTH_CLIENT_ID: '1234567890-abcdefghij.apps.googleusercontent.com',
  GOOGLE_OAUTH_CLIENT_SECRET: 'segredo-de-teste-que-nao-pode-vazar',
  GOOGLE_OAUTH_REDIRECT_URI:
    'https://auth.exemplo.invalid/auth/api/google/callback',
  GOOGLE_POST_LOGIN_REDIRECT: 'https://front.exemplo.invalid/apos-google',
  GOOGLE_WORKSPACE_DOMAINS: 'rede.example, filial.example=rede.example, ruim',
};
const ler = (env: Record<string, string | undefined>) =>
  readGoogleSettings((n) => env[n]);

describe('GOOGLE_WORKSPACE_DOMAINS', () => {
  it('cada domínio espera o próprio hd; "dom=hd" espera o hd da organização', () => {
    const m = parseWorkspaceDomains(ENV.GOOGLE_WORKSPACE_DOMAINS);
    expect([...m.entries()]).toEqual([
      ['rede.example', 'rede.example'],
      ['filial.example', 'rede.example'],
    ]);
  });
});

describe('readGoogleSettings (conferência do boot)', () => {
  it('tudo certo → ATIVO, e o resumo NÃO traz nenhum valor', () => {
    const s = ler(ENV);
    expect(s.enabled).toBe(true);
    expect(s.resumo).toContain('client_id=ok(formato)');
    expect(s.resumo).toContain('workspace_domains=2');
    expect(s.resumo).toContain('ATIVO');
    for (const v of Object.values(ENV)) {
      expect(s.resumo).not.toContain(v);
    }
    expect(s.resumo).not.toContain('1234567890');
  });

  it.each([
    ['GOOGLE_OAUTH_CLIENT_ID', 'nao-e-um-client-id'],
    ['GOOGLE_OAUTH_CLIENT_SECRET', undefined],
    [
      'GOOGLE_OAUTH_REDIRECT_URI',
      'http://auth.exemplo.invalid/auth/api/google/callback',
    ],
    ['GOOGLE_OAUTH_REDIRECT_URI', 'https://auth.exemplo.invalid/outra/rota'],
    ['GOOGLE_POST_LOGIN_REDIRECT', undefined],
  ])('%s errado (%p) → só o Google fica DESLIGADO', (nome, valor) => {
    const s = ler({ ...ENV, [nome]: valor });
    expect(s.enabled).toBe(false);
    expect(s.resumo).toContain('DESLIGADO');
  });
});

describe('checkGoogleDomain (2.3.4)', () => {
  const ws = parseWorkspaceDomains(ENV.GOOGLE_WORKSPACE_DOMAINS);
  it('Workspace: hd igual ao esperado → ok; ausente ou diferente → hd_mismatch', () => {
    expect(checkGoogleDomain('a@rede.example', 'rede.example', ws).ok).toBe(
      true,
    );
    expect(checkGoogleDomain('a@filial.example', 'rede.example', ws).ok).toBe(
      true,
    );
    expect(checkGoogleDomain('a@rede.example', undefined, ws)).toMatchObject({
      ok: false,
      reason: 'hd_mismatch',
    });
    expect(
      checkGoogleDomain('a@filial.example', 'filial.example', ws),
    ).toMatchObject({
      ok: false,
      reason: 'hd_mismatch',
    });
  });
  it('gmail/googlemail → ok; qualquer outro domínio → recusado', () => {
    expect(checkGoogleDomain('a@gmail.com', undefined, ws).ok).toBe(true);
    expect(checkGoogleDomain('a@googlemail.com', undefined, ws).ok).toBe(true);
    expect(checkGoogleDomain('a@getan.example', undefined, ws)).toMatchObject({
      ok: false,
      reason: 'domain_not_allowed',
    });
  });
});

describe('estado do OAuth (cookie assinado)', () => {
  const st = {
    state: randomToken(),
    nonce: randomToken(),
    verifier: randomToken(),
    exp: Date.now() + 60000,
  };
  it('assina e confere; adulterado, com outra chave ou vencido → null', () => {
    const raw = signState(st, 'chave-1');
    expect(verifyState(raw, 'chave-1')).toEqual(st);
    expect(verifyState(raw, 'chave-2')).toBeNull();
    const [corpo, mac] = raw.split('.');
    const outro = Buffer.from(JSON.stringify({ ...st, state: 'x' })).toString(
      'base64url',
    );
    expect(verifyState(`${outro}.${mac}`, 'chave-1')).toBeNull();
    expect(verifyState(`${corpo}.`, 'chave-1')).toBeNull();
    expect(verifyState(raw, 'chave-1', st.exp + 1)).toBeNull();
    expect(verifyState(undefined, 'chave-1')).toBeNull();
  });
  it('PKCE S256: challenge = base64url(sha256(verifier))', () => {
    // Vetor do RFC 7636 (apêndice B).
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

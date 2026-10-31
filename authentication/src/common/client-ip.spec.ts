import * as crypto from 'crypto';
import { regraDa } from '../oidc/oidc-rate-limit';
import { opcoesComIpFixo } from '../oidc/oidc-outbox';
import { chaveDoProxy, clientIp, resumoDoProxy } from './client-ip';

// Chave de TESTE gerada aqui, na hora.
const CHAVE = crypto.randomBytes(32).toString('hex');
const req = (headers: Record<string, string> = {}) => ({
  ip: '198.51.100.7',
  headers,
});

describe('17. IP real pelo proxy do HUB (x-hub-client-ip + segredo)', () => {
  it('com a chave CERTA, vale o x-hub-client-ip', () => {
    expect(
      clientIp(
        req({ 'x-hub-proxy-key': CHAVE, 'x-hub-client-ip': '203.0.113.5' }),
        CHAVE,
      ),
    ).toBe('203.0.113.5');
    expect(
      clientIp(
        req({ 'x-hub-proxy-key': CHAVE, 'x-hub-client-ip': '2001:db8::1' }),
        CHAVE,
      ),
    ).toBe('2001:db8::1');
  });

  it.each([
    ['sem a chave', { 'x-hub-client-ip': '203.0.113.5' }],
    [
      'chave errada',
      { 'x-hub-proxy-key': 'x'.repeat(64), 'x-hub-client-ip': '203.0.113.5' },
    ],
    [
      'chave com 1 caractere a menos',
      { 'x-hub-proxy-key': CHAVE.slice(1), 'x-hub-client-ip': '203.0.113.5' },
    ],
    [
      'IP inválido',
      { 'x-hub-proxy-key': CHAVE, 'x-hub-client-ip': '203.0.113.5, 10.0.0.1' },
    ],
  ])('%s → o cabeçalho é IGNORADO (vale o req.ip)', (_n, h) => {
    expect(clientIp(req(h), CHAVE)).toBe('198.51.100.7');
  });

  it('sem HUB_PROXY_KEY configurada (ou curta), o cabeçalho é sempre ignorado', () => {
    const h = { 'x-hub-proxy-key': 'curta', 'x-hub-client-ip': '203.0.113.5' };
    expect(chaveDoProxy(undefined)).toBeNull();
    expect(chaveDoProxy('curta')).toBeNull();
    expect(clientIp(req(h), chaveDoProxy('curta'))).toBe('198.51.100.7');
    expect(resumoDoProxy(null)).toContain('IGNORADO');
    expect(resumoDoProxy(CHAVE)).not.toContain(CHAVE);
  });
});

describe('rate limit do /oidc: regra por rota', () => {
  it.each([
    ['POST', '/interaction/abc/login', 'login'],
    ['POST', '/interaction/abc/google', 'google'],
    ['GET', '/google/callback', 'google'],
    ['GET', '/auth', 'auth'],
    ['GET', '/auth/uid123', 'auth'],
    ['POST', '/token', 'token'],
    ['GET', '/hub/admin/pessoas', 'admin'],
    ['PUT', '/hub/admin/pessoas/x/sistemas', 'admin'],
    ['GET', '/hub/admin', 'admin'],
    ['GET', '/hub/systems', 'outras'],
    ['GET', '/.well-known/openid-configuration', 'outras'],
    ['GET', '/interaction/abc', 'outras'],
  ])('%s %s → %s', (m, c, regra) => {
    expect(regraDa(m, c)).toBe(regra);
  });
});

describe('DNS rebinding: o envio do back-channel usa o IP JÁ conferido', () => {
  it('o lookup devolve SÓ o IP fixo (nas duas formas) e o TLS valida pelo nome', () => {
    const o = opcoesComIpFixo(
      'https://cliente.exemplo.invalid:8443/bc?x=1',
      '203.0.113.10',
    );
    expect(o).toMatchObject({
      host: 'cliente.exemplo.invalid',
      servername: 'cliente.exemplo.invalid',
      port: '8443',
      path: '/bc?x=1',
      method: 'POST',
    });
    const um = jest.fn();
    (o.lookup as any)('cliente.exemplo.invalid', {}, um);
    expect(um).toHaveBeenCalledWith(null, '203.0.113.10', 4);
    const todos = jest.fn();
    (o.lookup as any)('cliente.exemplo.invalid', { all: true }, todos);
    expect(todos).toHaveBeenCalledWith(null, [
      { address: '203.0.113.10', family: 4 },
    ]);
  });
});

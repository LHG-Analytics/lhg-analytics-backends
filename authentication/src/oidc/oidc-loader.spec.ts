import { loadOidcProvider } from './oidc-loader';

// Prova do risco R1: o oidc-provider (só ESM) carrega a partir do código
// CommonJS do authentication, também dentro do Jest.
describe('oidc-loader (ESM a partir de CommonJS)', () => {
  it('carrega a classe Provider e cria uma instância com o issuer dado', async () => {
    const Provider = await loadOidcProvider();
    expect(typeof Provider).toBe('function');
    const p = new Provider('https://exemplo.invalid/auth/oidc', {});
    expect(p.issuer).toBe('https://exemplo.invalid/auth/oidc');
    expect(await loadOidcProvider()).toBe(Provider); // carregado uma vez só
  });
});

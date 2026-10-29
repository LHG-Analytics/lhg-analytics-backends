/**
 * Ponte ESM → CommonJS para o `oidc-provider` (v8+ é SÓ ESM; o authentication
 * compila para CommonJS). Isolada aqui de propósito: é o único lugar que
 * importa a biblioteca.
 *
 * Com `module: commonjs`, o TypeScript reescreveria `import('x')` como
 * `require('x')`, e o require de um pacote só-ESM falha. Por isso o import()
 * nativo fica dentro de um `new Function`, fora do alcance do compilador:
 * no Node ele é o import() de verdade (carrega ESM a partir de CommonJS).
 * No Jest, o import() nativo exige `--experimental-vm-modules` (ver o script
 * test:db no package.json).
 */
const importarNativo = new Function(
  'especificador',
  'return import(especificador)',
) as (especificador: string) => Promise<any>;

let modulo: Promise<any> | undefined;

/**
 * O módulo inteiro do oidc-provider (carregado uma vez só): `Provider`,
 * `errors` e `interactionPolicy`.
 */
export function loadOidcModule(): Promise<any> {
  modulo ??= importarNativo('oidc-provider');
  return modulo;
}

/** A classe `Provider` do oidc-provider. */
export async function loadOidcProvider(): Promise<any> {
  const m = await loadOidcModule();
  return m.default ?? m.Provider;
}

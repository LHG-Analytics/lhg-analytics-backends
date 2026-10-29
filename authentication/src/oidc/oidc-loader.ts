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

let carregado: Promise<any> | undefined;

/** A classe `Provider` do oidc-provider (carregada uma vez só). */
export function loadOidcProvider(): Promise<any> {
  carregado ??= importarNativo('oidc-provider').then((m) => m.default ?? m);
  return carregado;
}

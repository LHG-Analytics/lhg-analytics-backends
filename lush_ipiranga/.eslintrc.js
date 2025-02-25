module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'prefer-const': 'off',  // Desabilita a regra de preferir 'const' sobre 'let'
    'no-unused-vars': 'off', // Desabilita a regra de variáveis não usadas
    '@typescript-eslint/no-unused-vars': [
      'error', 
      {
        argsIgnorePattern: '^_'  // Ignora parâmetros começando com '_'
      }
    ], 
    'no-unused-imports': 'off', // Desabilita a regra de imports não usados
  },
};

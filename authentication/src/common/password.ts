import * as bcrypt from 'bcrypt';
import { ValidateBy } from 'class-validator';

/** Custo do bcrypt para TODO hash novo (e para o rehash transparente). */
export const BCRYPT_COST = 12;

/** Tamanho mínimo de uma senha escolhida pela própria pessoa. */
export const PASSWORD_MIN_LENGTH = 10;

/** Hash bcrypt ($2a/$2b/$2x/$2y, custo, 53 caracteres de salt+hash). */
export const BCRYPT_HASH = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export const looksLikeBcryptHash = (value: string): boolean =>
  BCRYPT_HASH.test(value);

export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, BCRYPT_COST);

/** O hash foi gerado com custo menor que o atual (precisa de rehash)? */
export function needsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < BCRYPT_COST;
  } catch {
    return false;
  }
}

// Hash "fantasma" para gastar o mesmo tempo de um bcrypt.compare quando não
// há hash a comparar (e-mail inexistente, conta bloqueada ou sem senha): a
// resposta não revela pelo tempo se a conta existe.
const DUMMY_HASH = bcrypt.hashSync(
  'senha-fantasma-que-nunca-confere',
  BCRYPT_COST,
);

export async function compareOrDummy(
  password: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(password, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(password, hash);
}

/** O bcrypt só usa os primeiros 72 BYTES (UTF-8) da senha; o resto é ignorado. */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Validador: no máximo `max` bytes em UTF-8. Conta bytes, e não caracteres,
 * porque "ç" ou um emoji ocupam 2 a 4 bytes: 72 caracteres podem passar de 72
 * bytes, e o que passa do limite do bcrypt seria ignorado em silêncio.
 */
export function MaxBytes(max: number = PASSWORD_MAX_BYTES) {
  return ValidateBy({
    name: 'maxBytes',
    validator: {
      validate: (value: unknown) =>
        typeof value !== 'string' || Buffer.byteLength(value, 'utf8') <= max,
      defaultMessage: (args) =>
        `${args?.property} deve ter no máximo ${max} bytes (UTF-8)`,
    },
  });
}

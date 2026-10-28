import * as bcrypt from 'bcrypt';

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

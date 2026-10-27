import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Forma canônica de um e-mail: sem espaços nas pontas e em minúsculas. É a
 * mesma regra do trigger do banco (lower(btrim(email))), aplicada também na
 * entrada para que buscas exatas (findUnique) encontrem a pessoa.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Para @Transform dos DTOs: normaliza só quando o valor é texto. */
export function normalizeEmailInput({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? normalizeEmail(value) : value;
}

export const EMAIL_IN_USE = 'EMAIL_IN_USE';

/** 409 com a mensagem de sempre e um código estável para o front. */
export function emailInUse(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    message: 'O usuário com este email já existe',
    code: EMAIL_IN_USE,
  });
}

/**
 * O e-mail colidiu com outro cadastro? Cobre o @unique de cada tabela (P2002)
 * e os triggers de unicidade entre "User" e "UserEmail" (RAISE com o prefixo
 * EMAIL_IN_USE, que o Prisma repassa na mensagem do erro).
 */
export function isEmailConflict(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    // Só o e-mail: um CPF repetido também dá P2002 e não é este caso.
    return String(error.meta?.target ?? '').includes('email');
  }
  const message = error instanceof Error ? error.message : '';
  return message.includes(EMAIL_IN_USE);
}

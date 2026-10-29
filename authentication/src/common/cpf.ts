import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const CPF_IN_USE = 'CPF_IN_USE';

/**
 * 409 com mensagem clara e um código estável para o front (o CPF não volta na
 * resposta). Vale também quando o CPF é de uma pessoa INATIVA: o cadastro
 * guarda o histórico e o CPF continua único.
 */
export function cpfInUse(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    message: 'Já existe um usuário com este CPF',
    code: CPF_IN_USE,
  });
}

/** O CPF colidiu com outro cadastro (@unique do User.cpf, P2002)? */
export function isCpfConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    String(error.meta?.target ?? '').includes('cpf')
  );
}

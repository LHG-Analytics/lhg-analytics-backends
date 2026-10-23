import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

/** Usuário autenticado, como o JwtStrategy coloca em req.user. */
export interface HelpdeskUser {
  id: number;
  email: string;
  name?: string | null;
  unit?: string | null;
  role?: string | null;
}

/** Claims do token do Help Desk (iat/exp são adicionados na assinatura). */
export interface HelpdeskClaims {
  sub: string;
  email: string;
  nome?: string;
  unidade?: string;
  cargo?: string;
  sistema: 'lhg-analytics';
}

export const HELPDESK_SISTEMA = 'lhg-analytics';
export const HELPDESK_TOKEN_TTL_SECONDS = 3600;

/**
 * Mapeia o usuário do Analytics para os claims combinados com o Help Desk.
 * nome/unidade/cargo são omitidos quando não há valor (o Help Desk aceita
 * ausência e prefere isso a null/string vazia).
 */
export function buildHelpdeskClaims(user: HelpdeskUser): HelpdeskClaims {
  const claims: HelpdeskClaims = {
    sub: String(user.id),
    email: user.email,
    sistema: HELPDESK_SISTEMA,
  };
  const nome = user.name?.trim();
  if (nome) claims.nome = nome;
  if (user.unit) claims.unidade = user.unit;
  if (user.role) claims.cargo = user.role;
  return claims;
}

/**
 * Assina o token em HS256 com o segredo próprio do Help Desk (separado do
 * JWT_SECRET do Analytics). Header só { alg, typ }: o Help Desk recusa kid
 * desconhecido, então não enviamos kid.
 */
export function signHelpdeskToken(user: HelpdeskUser, secret: string): string {
  return jwt.sign(buildHelpdeskClaims(user), secret, {
    algorithm: 'HS256',
    expiresIn: HELPDESK_TOKEN_TTL_SECONDS,
  });
}

@Injectable()
export class HelpdeskService {
  constructor(private readonly configService: ConfigService) {}

  createToken(user: HelpdeskUser): { token: string } {
    const secret = this.configService.get<string>('HELPDESK_JWT_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Help Desk indisponível: HELPDESK_JWT_SECRET não configurado no servidor',
      );
    }
    return { token: signHelpdeskToken(user, secret) };
  }
}

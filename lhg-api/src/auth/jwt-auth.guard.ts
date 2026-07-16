/**
 * Validação stateless do JWT emitido pelo serviço authentication.
 * Mesmo comportamento dos backends por unidade: cookie access_token primeiro,
 * fallback para Authorization: Bearer. Não toca banco (jwt.verify + JWT_SECRET).
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token =
      request.cookies?.access_token ??
      (request.headers?.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.slice(7)
        : undefined);

    if (!token) {
      throw new UnauthorizedException('Token não fornecido');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException('JWT_SECRET não configurado');
    }

    try {
      const payload = jwt.verify(token, secret) as JwtPayload;
      request.user = {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        unit: payload.unit,
        role: payload.role,
        exp: payload.exp,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}

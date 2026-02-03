import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '@auth/auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verificar se a rota é pública (decorator @Public())
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Tentar pegar o token do cookie httpOnly primeiro
    let token = request.cookies?.access_token;

    // Se não tiver no cookie, tentar pegar do header Authorization
    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      throw new UnauthorizedException('Token não fornecido');
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET não definido no ambiente');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;

      // Anexar as informações do usuário decodificadas do JWT na requisição
      request.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        unit: decoded.unit,
        role: decoded.role,
      };

      return true;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Erro ao validar token:', error.message);
      } else {
        console.error('Erro ao validar token:', error);
      }
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}

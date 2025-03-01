import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Token não fornecido ou formato inválido',
      );
    }

    const token = authHeader.split(' ')[1]; // Extrai o token do header

    if (!process.env.NEXTAUTH_SECRET) {
      throw new Error('NEXTAUTH_SECRET não definido no ambiente');
    }

    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);
      request.user = decoded; // Adiciona os dados do usuário na requisição
      return true;
    } catch (error) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}

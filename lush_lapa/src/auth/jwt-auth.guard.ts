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
    console.log('Headers completos recebidos:', request.headers);
    const authHeader = request.headers.authorization;

    console.log('Cabeçalho Authorization recebido:', authHeader);

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
      console.log('Usuário autenticado:', decoded);
      return true;
    } catch (error) {
      console.error('Erro ao validar token:', error.message);
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}

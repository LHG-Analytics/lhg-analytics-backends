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

    if (!authHeader) {
      throw new UnauthorizedException('Token não fornecido');
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    try {
      const decoded = jwt.verify(token, process.env.AUTH_SECRET);
      request.user = decoded; // Adiciona o usuário no request
      return true;
    } catch (error) {
      throw new UnauthorizedException('Token inválido');
    }
  }
}

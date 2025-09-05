import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service'; // Importa o PrismaService

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {} // Injeta o PrismaService

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Token não fornecido ou formato inválido',
      );
    }

    const token = authHeader.split(' ')[1];

    if (!process.env.NEXTAUTH_SECRET) {
      throw new Error('NEXTAUTH_SECRET não definido no ambiente');
    }

    try {
      const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET) as {
        email: string;
        id: string;
      };

      console.log('Usuário autenticado:', decoded);

      // 🔹 Verifica se o usuário existe no banco de dados
      const user = await this.prisma.prismaOnline.user.findUnique({
        where: { email: decoded.email },
      });

      if (!user) {
        throw new UnauthorizedException('Usuário não encontrado no banco');
      }

      request.user = user; // Armazena o usuário na requisição
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

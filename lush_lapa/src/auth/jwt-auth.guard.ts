import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { jwtDecrypt } from 'jose'; // 📌 Importando o decodificador de JWE
import { PrismaService } from '../prisma/prisma.service'; // Importa o PrismaService

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    console.log('Headers completos recebidos:', request.headers);

    const authHeader = request.headers.authorization;
    console.log('Cabeçalho Authorization recebido:', authHeader);

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
      // 🔹 Decodifica o JWE corretamente usando `jose`
      const { payload } = await jwtDecrypt(
        token,
        new TextEncoder().encode(process.env.NEXTAUTH_SECRET),
      );

      // 🔹 Convertendo para o tipo correto
      const decoded = payload as { email: string; id: string };

      console.log('Usuário autenticado:', decoded);

      // 🔹 Verifica se o usuário existe no banco de dados
      const user = await this.prisma.prismaOnline.user.findUnique({
        where: { email: decoded.email },
      });

      if (!user) {
        throw new UnauthorizedException('Usuário não encontrado no banco');
      }

      request.user = user; // 🔹 Armazena o usuário na requisição
      return true;
    } catch (error) {
      console.error('Erro ao validar token:', error.message);
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}

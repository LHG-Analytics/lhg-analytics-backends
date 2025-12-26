import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
export declare class AuthService {
  private readonly prisma;
  private readonly jwtService;
  private readonly configService;
  constructor(
    prisma: PrismaService,
    jwtService: JwtService,
    configService: ConfigService,
  );
  validateUser(
    email: string,
    password: string,
  ): Promise<{
    name: string | null;
    id: number;
    role: import('.prisma/client').$Enums.UserRole;
    password: string;
    email: string;
    unit: import('.prisma/client').$Enums.UserUnit;
    cpf: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  login(user: any): Promise<{
    access_token: string;
  }>;
}

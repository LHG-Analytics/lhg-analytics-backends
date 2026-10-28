import { Test } from '@nestjs/testing';

// Conta quantos PrismaClient a aplicação cria. Cada PrismaClient abre o seu
// próprio pool de conexões com o banco de usuários; o esperado é UM só.
let prismaClients = 0;
jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client');
  class CountingPrismaClient {
    constructor() {
      prismaClients += 1;
    }
    $connect() {
      return Promise.resolve();
    }
    $disconnect() {
      return Promise.resolve();
    }
  }
  return { ...actual, PrismaClient: CountingPrismaClient };
});

// Segredo fixo só para o módulo compilar (o JwtStrategy exige JWT_SECRET).
process.env.JWT_SECRET = 'segredo-de-teste-local';

import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('existe uma única instância (um só pool) em toda a aplicação', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const fromApp = moduleRef.get(PrismaService, { strict: false });
    const fromAuth = (moduleRef.get(AuthService, { strict: false }) as any)
      .prisma;
    const fromUsers = (moduleRef.get(UsersService, { strict: false }) as any)
      .prisma;

    expect(fromAuth).toBe(fromApp);
    expect(fromUsers).toBe(fromApp);
    expect(prismaClients).toBe(1);

    await moduleRef.close();
  });
});

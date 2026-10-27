import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// Regressão do POST /api/login com o Prisma mockado (sem banco).
// Segredo fixo só para teste (o real fica no Render, nunca no código).
const SECRET = 'segredo-de-teste-local';
const SENHA = 'senha-certa-123';

const usuario = {
  id: 7,
  email: 'gerente@lushmotel.com.br',
  name: 'Gerente Teste',
  unit: 'LUSH_IPIRANGA',
  role: 'GERENTE_GERAL',
  password: bcrypt.hashSync(SENHA, 4),
  // Schema 1b: ativo e com o acesso ao Analytics (como todo usuário atual
  // depois do backfill).
  status: 'ACTIVE',
  systemAccesses: [{ id: 1 }],
};

describe('POST /api/login (regressão)', () => {
  let app: INestApplication;
  const refreshCreate = jest.fn().mockResolvedValue({});

  beforeAll(async () => {
    const prismaMock = {
      prismaOnline: {
        user: {
          findUnique: jest.fn(({ where }) =>
            Promise.resolve(where.email === usuario.email ? usuario : null),
          ),
        },
        refreshToken: { create: refreshCreate },
        // Login por e-mail secundário: nenhum cadastrado neste teste.
        userEmail: { findUnique: jest.fn().mockResolvedValue(null) },
        auditEvent: { create: jest.fn().mockResolvedValue({}) },
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        // O AuthService assina com o JWT_SECRET do ConfigService (como em
        // produção); aqui ele vem fixo, sem .env nem variável do ambiente.
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: SECRET })],
        }),
        JwtModule.register({ secret: SECRET }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        AccessService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Mesmo pipeline do main.ts que afeta o login.
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('credencial certa → 200, cookies httpOnly e JWT com os claims de sempre', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email: usuario.email, password: SENHA })
      .expect(200);

    expect(res.body.user).toEqual({
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      unit: usuario.unit,
      role: usuario.role,
    });
    expect(res.body.message).toBe('Login realizado com sucesso');
    expect(typeof res.body.expiresAt).toBe('string');

    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const access = cookies.find((c) => c.startsWith('access_token='));
    const refresh = cookies.find((c) => c.startsWith('refresh_token='));
    expect(access).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite=Lax/i);
    expect(access).toMatch(/Path=\//);
    expect(refresh).toMatch(/HttpOnly/i);

    const token = access!.split(';')[0].split('=')[1];
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload;
    expect(payload).toMatchObject({
      id: usuario.id,
      email: usuario.email,
      name: usuario.name,
      unit: usuario.unit,
      role: usuario.role,
    });
    expect(refreshCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: usuario.id }),
      }),
    );
  });

  it('senha errada → 401 e nenhum cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email: usuario.email, password: 'senha-errada-123' })
      .expect(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('e-mail inexistente → 401 e nenhum cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email: 'ninguem@lushmotel.com.br', password: SENHA })
      .expect(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

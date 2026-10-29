// PATCH /users/:id e a senha: a tela de edição recebe o objeto User (com o
// hash em `password`) e pode devolvê-lo no PATCH. Só uma senha NOVA de
// verdade troca o hash; o próprio hash, vazio ou ausente deixam a senha
// como está. Banco migrado de verdade; JWT simulado pelo cabeçalho.
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AccessService } from '../access/access.service';
import { LoginLockService } from '../access/login-lock.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OidcLogoutService } from '../oidc/oidc-logout.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';

const SENHA = 'senha-original-123';
// Evento inteiro como texto (o id é BigInt), para procurar o hash nele.
const texto = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
const NOVA = 'senha-nova-456';

describe('PATCH /users/:id: a senha só muda com uma senha nova de verdade', () => {
  let url: string;
  let app: INestApplication;
  let db: ReturnType<typeof cliente>;
  let admin: { id: number; role: string; unit: string };
  let alvo: { id: number; email: string };

  beforeAll(async () => {
    url = novoSchema('tpwd');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;

    const jwtSimulado = {
      canActivate: (ctx: ExecutionContext) => {
        const req = ctx.switchToHttp().getRequest();
        const h = req.headers['x-test-user'];
        if (h) req.user = JSON.parse(h);
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: 'segredo-de-teste-local' })],
        }),
        JwtModule.register({ secret: 'segredo-de-teste-local' }),
      ],
      controllers: [AuthController, UsersController],
      providers: [
        AuthService,
        AccessService,
        LoginLockService,
        OidcLogoutService,
        UsersService,
        PrismaService,
        { provide: APP_GUARD, useValue: jwtSimulado },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtSimulado)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    db = moduleRef.get(PrismaService).prismaOnline;

    const a = await db.user.create({
      data: {
        email: 'admin@example.invalid',
        cpf: '92000000001',
        password: bcrypt.hashSync(SENHA, 4),
        role: 'ADMIN',
        unit: 'LHG',
        systemAccesses: { create: { systemKey: 'analytics' } },
      },
    });
    admin = { id: a.id, role: 'ADMIN', unit: 'LHG' };
  });

  afterAll(async () => {
    await app?.close();
    await apagarSchema(url);
  });

  const http = () => request(app.getHttpServer());
  const comoAdmin = (r: request.Test) =>
    r.set('x-test-user', JSON.stringify(admin));
  const login = (password: string) =>
    http().post('/api/login').send({ email: alvo.email, password });
  const patch = (corpo: Record<string, unknown>) =>
    comoAdmin(http().patch(`/api/users/${alvo.id}`).send(corpo));

  beforeEach(async () => {
    // Pessoa nova a cada caso, criada pela API (como a tela faz).
    const email = `alvo.${Date.now()}@example.invalid`;
    const res = await comoAdmin(
      http()
        .post('/api/users')
        .send({
          name: 'Pessoa Fictícia',
          email,
          password: SENHA,
          cpf: `93${String(Date.now()).slice(-9)}`,
          role: 'GERENTE_GERAL',
          unit: 'TOUT',
          systems: ['analytics'],
        }),
    ).expect(201);
    alvo = { id: res.body.id, email };
    await login(SENHA).expect(200);
  });

  it('a tela devolve o PRÓPRIO hash (do GET) → senha inalterada, login com a original 200, auditado sem o hash', async () => {
    const lido = await comoAdmin(
      http().get(`/api/users/email/${alvo.email}`),
    ).expect(200);
    const hash: string = lido.body.password;
    expect(hash).toMatch(/^\$2[abxy]\$\d{2}\$/);

    await patch({ name: 'Nome Editado', password: hash }).expect(200);

    const depois = await db.user.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(depois.password).toBe(hash); // nada foi re-hasheado
    expect(depois.name).toBe('Nome Editado'); // o resto da edição vale
    await login(SENHA).expect(200);
    await login(hash).expect(401);

    const eventos = await db.auditEvent.findMany({
      where: { targetUserId: alvo.id, action: 'password.hash_echo_ignored' },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].actorUserId).toBe(admin.id);
    expect(texto(eventos[0])).not.toContain(hash);
    expect(texto(eventos[0])).not.toContain(hash.slice(7));
  });

  it('o hash devolvido pelo POST (outra rota que expõe o campo) também é ignorado', async () => {
    const atual = await db.user.findUniqueOrThrow({ where: { id: alvo.id } });
    await patch({ password: atual.password }).expect(200);
    await login(SENHA).expect(200);
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
  ])('password %s → 200 e senha inalterada', async (_nome, valor) => {
    const antes = await db.user.findUniqueOrThrow({ where: { id: alvo.id } });
    await patch({ name: 'Outro Nome', password: valor }).expect(200);
    const depois = await db.user.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(depois.password).toBe(antes.password);
    expect(depois.name).toBe('Outro Nome');
    await login(SENHA).expect(200);
  });

  it('password ausente ou null → senha inalterada', async () => {
    await patch({ name: 'Sem Senha' }).expect(200);
    await login(SENHA).expect(200);
    await patch({ password: null }).expect(200);
    await login(SENHA).expect(200);
  });

  it('senha NOVA de verdade → hash novo: a nova entra (200), a antiga não (401)', async () => {
    const antes = await db.user.findUniqueOrThrow({ where: { id: alvo.id } });
    await patch({ password: NOVA }).expect(200);
    const depois = await db.user.findUniqueOrThrow({ where: { id: alvo.id } });
    expect(depois.password).not.toBe(antes.password);
    expect(depois.password).not.toBe(NOVA); // gravada como hash
    await login(NOVA).expect(200);
    await login(SENHA).expect(401);
    expect(
      await db.auditEvent.count({
        where: { targetUserId: alvo.id, action: 'password.hash_echo_ignored' },
      }),
    ).toBe(0);
  });

  it('texto "parecido" com hash mas fora do formato é tratado como senha nova', async () => {
    const quase = '$2b$10$curto-demais';
    await patch({ password: quase }).expect(200);
    await login(quase).expect(200);
  });
});

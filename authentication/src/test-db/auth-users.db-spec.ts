// Login e cadastro (código NOVO e o ANTIGO) contra o banco migrado de verdade.
// O banco nasce "como a produção antes da 1b" (pessoas com e-mail em
// maiúsculas), recebe a migration e só então a aplicação sobe.
// Numeração = testes obrigatórios da especificação da etapa 1b.
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UnitsGuard } from '../auth/guards/units.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import {
  MIGRATION_1B,
  apagarSchema,
  cliente,
  inserirPessoaAntiga,
  migrar,
  novoSchema,
} from './db-helpers';
import { LegacyUsersService } from './legacy-users.service';

const SECRET = 'segredo-de-teste-local';
const SENHA = 'senha-de-teste-123';

describe('login e cadastro no schema 1b', () => {
  let url: string;
  let app: INestApplication;
  let db: ReturnType<typeof cliente>;
  let legacy: LegacyUsersService;
  let adminId: number; // quem "está logado" no POST /users

  beforeAll(async () => {
    url = novoSchema('tapp');
    expect(migrar(url, MIGRATION_1B).ok).toBe(true);
    const antes = cliente(url);
    try {
      const hash = bcrypt.hashSync(SENHA, 4);
      await inserirPessoaAntiga(antes, 'Maria@Example.INVALID', hash);
      await inserirPessoaAntiga(antes, 'fulano@x.com', hash);
      await inserirPessoaAntiga(antes, 'admin.logado@example.invalid', hash);
    } finally {
      await antes.$disconnect();
    }
    expect(migrar(url).ok).toBe(true);

    // O PrismaService real lê SUPABASE_URL_USERS ao ser criado.
    process.env.SUPABASE_URL_USERS = url;
    const logado = {
      canActivate: (ctx: ExecutionContext) => {
        ctx.switchToHttp().getRequest().user = { id: adminId };
        return true;
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: SECRET })],
        }),
        JwtModule.register({ secret: SECRET }),
      ],
      controllers: [AuthController, UsersController],
      providers: [AuthService, UsersService, PrismaService, LegacyUsersService],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(logado)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UnitsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
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
    db = moduleRef.get(PrismaService).prismaOnline;
    legacy = moduleRef.get(LegacyUsersService);
    adminId = (
      await db.user.findUniqueOrThrow({
        where: { email: 'admin.logado@example.invalid' },
      })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
    await apagarSchema(url);
  });

  const login = (email: string, password = SENHA) =>
    request(app.getHttpServer()).post('/api/login').send({ email, password });

  const novoUsuario = (email: string, cpf: string) =>
    request(app.getHttpServer()).post('/api/users').send({
      name: 'Pessoa Fictícia',
      email,
      password: SENHA,
      cpf,
      role: 'GERENTE_GERAL',
      unit: 'LUSH_LAPA',
    });

  it('15. quem existia com e-mail em maiúsculas continua entrando depois da migration', async () => {
    const res = await login('Maria@Example.INVALID').expect(200);
    expect(res.body.user.email).toBe('maria@example.invalid');
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^access_token=/),
        expect.stringMatching(/^refresh_token=/),
      ]),
    );
    await login('maria@example.invalid').expect(200);
  });

  it('12. o login normaliza: "  MARIA@EXAMPLE.INVALID " + senha certa → 200, a mesma pessoa', async () => {
    const certo = await login('maria@example.invalid').expect(200);
    const res = await login('  MARIA@EXAMPLE.INVALID ').expect(200);
    expect(res.body.user.id).toBe(certo.body.user.id);
    // Senha errada continua 401 genérico.
    const errado = await login('  MARIA@EXAMPLE.INVALID ', 'senha-errada-123');
    expect(errado.status).toBe(401);
    expect(errado.body.message).toBe('Email ou senha incorretos');
  });

  it('POST /users cria a pessoa com o e-mail normalizado e a flag do Analytics', async () => {
    const res = await novoUsuario(
      ' Nova.Pessoa@Example.INVALID',
      '90000002001',
    ).expect(201);
    expect(res.body.email).toBe('nova.pessoa@example.invalid');
    const acessos = await db.systemAccess.findMany({
      where: { userId: res.body.id },
    });
    expect(acessos).toHaveLength(1);
    expect(acessos[0].systemKey).toBe('analytics');
    expect(acessos[0].revokedAt).toBeNull();
    expect(acessos[0].grantedById).toBe(adminId);
    await login('nova.pessoa@example.invalid').expect(200);
  });

  it('10. "Fulano@X.com " quando já existe fulano@x.com → 409 EMAIL_IN_USE', async () => {
    const res = await novoUsuario('Fulano@X.com ', '90000002002').expect(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');
    expect(res.body.message).toBe('O usuário com este email já existe');
    expect(await db.user.count({ where: { email: 'fulano@x.com' } })).toBe(1);
  });

  it('11. (API) e-mail que já é secundário de outra pessoa → 409 EMAIL_IN_USE', async () => {
    const dono = await db.user.findUniqueOrThrow({
      where: { email: 'fulano@x.com' },
    });
    await db.userEmail.create({
      data: { userId: dono.id, email: 'fulano.trabalho@x.com' },
    });
    const res = await novoUsuario(
      'FULANO.TRABALHO@x.com',
      '90000002003',
    ).expect(409);
    expect(res.body.code).toBe('EMAIL_IN_USE');

    // PATCH para o secundário de outra pessoa: o trigger recusa e a API dá 409.
    const outra = await db.user.findUniqueOrThrow({
      where: { email: 'maria@example.invalid' },
    });
    const patch = await request(app.getHttpServer())
      .patch(`/api/users/${outra.id}`)
      .send({ email: 'Fulano.Trabalho@x.com' })
      .expect(409);
    expect(patch.body.code).toBe('EMAIL_IN_USE');
  });

  describe('compatibilidade: o código ANTIGO no schema novo', () => {
    it('POST antigo com e-mail em maiúsculas → gravado em minúsculas, sem erro', async () => {
      const u = await legacy.create({
        name: 'Pessoa Antiga',
        email: 'CADASTRO.ANTIGO@Example.INVALID',
        password: SENHA,
        cpf: '90000002004',
        role: 'GERENTE_RESERVAS',
        unit: 'TOUT',
      });
      expect(u.email).toBe('cadastro.antigo@example.invalid');
      // O código antigo não concede a flag: por isso o PR-A (que concede) vai
      // para a produção logo depois da migration.
      expect(await db.systemAccess.count({ where: { userId: u.id } })).toBe(0);
    });

    it('DELETE antigo apaga a pessoa e leva junto acessos, e-mails e sessões', async () => {
      const criado = await novoUsuario(
        'apagar.antigo@example.invalid',
        '90000002005',
      ).expect(201);
      const id = criado.body.id;
      await db.userEmail.create({
        data: { userId: id, email: 'apagar.antigo.sec@example.invalid' },
      });
      await login('apagar.antigo@example.invalid').expect(200); // cria refresh token

      const res = await legacy.remove(id);
      expect(res.message).toContain('excluído com sucesso');
      expect(await db.user.count({ where: { id } })).toBe(0);
      expect(await db.systemAccess.count({ where: { userId: id } })).toBe(0);
      expect(await db.userEmail.count({ where: { userId: id } })).toBe(0);
      expect(await db.refreshToken.count({ where: { userId: id } })).toBe(0);
    });

    it('DELETE antigo de quem concedeu acessos: o autor vira nulo, nada quebra', async () => {
      const admin = await novoUsuario(
        'admin.antigo@example.invalid',
        '90000002006',
      ).expect(201);
      const alvo = await db.user.findUniqueOrThrow({
        where: { email: 'maria@example.invalid' },
      });
      const acesso = await db.systemAccess.create({
        data: { userId: alvo.id, systemKey: 'cms', grantedById: admin.body.id },
      });
      await legacy.remove(admin.body.id);
      const depois = await db.systemAccess.findUniqueOrThrow({
        where: { id: acesso.id },
      });
      expect(depois.grantedById).toBeNull();
    });

    it('o DELETE atual (código novo) também funciona', async () => {
      const criado = await novoUsuario(
        'apagar.novo@example.invalid',
        '90000002007',
      ).expect(201);
      await request(app.getHttpServer())
        .delete(`/api/users/${criado.body.id}`)
        .expect(200);
      expect(await db.user.count({ where: { id: criado.body.id } })).toBe(0);
    });
  });
});

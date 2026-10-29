// Comportamento da 1b (inativação, flags explícitas, auditoria) contra o
// banco migrado de verdade. Os guards de cargo/unidade são os REAIS; só o JWT
// é simulado: o cabeçalho x-test-user diz quem está logado.
// Numeração = testes obrigatórios da especificação da etapa 1b.
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AccessService } from '../access/access.service';
import { LoginLockService } from '../access/login-lock.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HelpdeskController } from '../helpdesk/helpdesk.controller';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';

const SENHA = 'senha-de-teste-123';
const HASH = bcrypt.hashSync(SENHA, 4);

describe('comportamento 1b', () => {
  let url: string;
  let app: INestApplication;
  let db: ReturnType<typeof cliente>;
  let admin: { id: number; role: string; unit: string };
  let cpfSeq = 0;
  const cpf = () => `91${String(++cpfSeq).padStart(9, '0')}`;

  beforeAll(async () => {
    url = novoSchema('tcomp');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;

    // JWT simulado: x-test-user = {"id":..,"role":..,"unit":..}.
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
          load: [
            () => ({
              JWT_SECRET: 'segredo-de-teste-local',
              HELPDESK_JWT_SECRET: 'segredo-helpdesk-de-teste',
            }),
          ],
        }),
        JwtModule.register({ secret: 'segredo-de-teste-local' }),
      ],
      controllers: [AuthController, UsersController, HelpdeskController],
      providers: [
        AuthService,
        AccessService,
        LoginLockService,
        UsersService,
        HelpdeskService,
        PrismaService,
        // Rotas sem @UseGuards (me, helpdesk) usam o guard GLOBAL, como no app.
        { provide: APP_GUARD, useValue: jwtSimulado },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtSimulado)
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

    const a = await pessoa('admin@example.invalid', {
      role: 'ADMIN',
      unit: 'LHG',
      systems: ['analytics'],
    });
    admin = { id: a.id, role: 'ADMIN', unit: 'LHG' };
  });

  afterAll(async () => {
    delete process.env.USERS_SYSTEMS_REQUIRED;
    await app?.close();
    await apagarSchema(url);
  });

  /** Pessoa direto no banco (sem passar pela API). */
  async function pessoa(
    email: string,
    o: {
      role?: string | null;
      unit?: string | null;
      systems?: string[];
      status?: 'ACTIVE' | 'INACTIVE';
    } = {},
  ) {
    const u = await db.user.create({
      data: {
        email,
        cpf: cpf(),
        password: HASH,
        name: 'Pessoa Fictícia',
        role: (o.role === undefined ? 'GERENTE_GERAL' : o.role) as any,
        unit: (o.unit === undefined ? 'LUSH_IPIRANGA' : o.unit) as any,
        status: o.status ?? 'ACTIVE',
      },
    });
    for (const systemKey of o.systems ?? ['analytics']) {
      await db.systemAccess.create({ data: { userId: u.id, systemKey } });
    }
    return u;
  }

  const http = () => request(app.getHttpServer());
  const comoAdmin = (r: request.Test, quem: object = admin) =>
    r.set('x-test-user', JSON.stringify(quem));
  const login = (email: string, password = SENHA) =>
    http().post('/api/login').send({ email, password });
  const cookieDe = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
  const novo = (corpo: Record<string, unknown>) =>
    comoAdmin(
      http()
        .post('/api/users')
        .send({
          name: 'Pessoa Fictícia',
          password: SENHA,
          cpf: cpf(),
          ...corpo,
        }),
    );
  const flagsAtivas = async (userId: number) =>
    (
      await db.systemAccess.findMany({
        where: { userId, revokedAt: null },
        orderBy: { systemKey: 'asc' },
      })
    ).map((a) => a.systemKey);
  const eventos = (targetUserId: number, action?: string) =>
    db.auditEvent.findMany({
      where: { targetUserId, ...(action && { action }) },
      orderBy: { id: 'asc' },
    });

  describe('login, refresh, me e helpdesk', () => {
    it('2. INACTIVE → login 401 genérico, sem cookie, com AuditEvent', async () => {
      const u = await pessoa('inativa@example.invalid', { status: 'INACTIVE' });
      const res = await login('inativa@example.invalid').expect(401);
      expect(res.body.message).toBe('Email ou senha incorretos');
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(await eventos(u.id, 'login.denied.inactive')).toHaveLength(1);
    });

    it('2. senha errada de um inativo não gera login.denied (só quem sabe a senha)', async () => {
      const u = await pessoa('inativa2@example.invalid', {
        status: 'INACTIVE',
      });
      await login('inativa2@example.invalid', 'senha-errada-123').expect(401);
      // Desde a 1c, o erro de senha vira login.failed (bloqueio por conta);
      // o motivo "inativo" continua só para quem acertou a senha.
      const acoes = (await eventos(u.id)).map((e) => e.action);
      expect(acoes).toEqual(['login.failed']);
    });

    it('3. sem SystemAccess(analytics) → 401', async () => {
      const u = await pessoa('semflag@example.invalid', { systems: ['cms'] });
      const res = await login('semflag@example.invalid').expect(401);
      expect(res.body.message).toBe('Email ou senha incorretos');
      expect(await eventos(u.id, 'login.denied.no_access')).toHaveLength(1);
    });

    it('3. flag do Analytics REVOGADA (histórico) também é 401', async () => {
      const u = await pessoa('revogada@example.invalid');
      await db.systemAccess.updateMany({
        where: { userId: u.id },
        data: { revokedAt: new Date() },
      });
      await login('revogada@example.invalid').expect(401);
    });

    it('4. role ou unit nulos → 401', async () => {
      const semRole = await pessoa('semrole@example.invalid', { role: null });
      const semUnit = await pessoa('semunit@example.invalid', { unit: null });
      await login('semrole@example.invalid').expect(401);
      await login('semunit@example.invalid').expect(401);
      expect(await eventos(semRole.id, 'login.denied.no_profile')).toHaveLength(
        1,
      );
      expect(await eventos(semUnit.id, 'login.denied.no_profile')).toHaveLength(
        1,
      );
    });

    it('quem tem a flag continua entrando como sempre (200, cookies, mesmos campos)', async () => {
      await pessoa('normal@example.invalid');
      const res = await login('normal@example.invalid').expect(200);
      expect(Object.keys(res.body.user).sort()).toEqual(
        ['email', 'id', 'name', 'role', 'unit'].sort(),
      );
      expect(cookieDe(res)).toMatch(/access_token=.*refresh_token=/);
    });

    it('5. refresh de quem foi inativado depois do login → 401 e o refresh token fica revogado', async () => {
      const u = await pessoa('refresh@example.invalid');
      const cookie = cookieDe(await login('refresh@example.invalid'));
      // Inativação "por fora" (sem revogar as sessões): o refresh precisa
      // recusar sozinho e revogar o token.
      await db.user.update({
        where: { id: u.id },
        data: { status: 'INACTIVE' },
      });
      await http().post('/api/refresh').set('Cookie', cookie).expect(401);
      expect(
        await db.refreshToken.count({
          where: { userId: u.id, revoked: false },
        }),
      ).toBe(0);
      expect(await eventos(u.id, 'refresh.denied.inactive')).toHaveLength(1);
    });

    it('5. refresh depois do DELETE (inativação) → 401', async () => {
      const u = await pessoa('refresh2@example.invalid');
      const cookie = cookieDe(await login('refresh2@example.invalid'));
      await comoAdmin(http().delete(`/api/users/${u.id}`)).expect(200);
      await http().post('/api/refresh').set('Cookie', cookie).expect(401);
    });

    it('/me → 401 para quem não está ACTIVE; 200 para quem está', async () => {
      const u = await pessoa('me@example.invalid');
      const quem = { id: u.id, role: 'GERENTE_GERAL', unit: 'LUSH_IPIRANGA' };
      await comoAdmin(http().get('/api/me'), quem).expect(200);
      await db.user.update({
        where: { id: u.id },
        data: { status: 'INACTIVE' },
      });
      await comoAdmin(http().get('/api/me'), quem).expect(401);
    });

    it('9. helpdesk-token de um inativo → 401 (ativo → 200)', async () => {
      const u = await pessoa('helpdesk@example.invalid');
      const quem = {
        id: u.id,
        email: u.email,
        role: 'GERENTE_GERAL',
        unit: 'LUSH_IPIRANGA',
      };
      const ok = await comoAdmin(
        http().get('/api/helpdesk/token'),
        quem,
      ).expect(200);
      expect(typeof ok.body.token).toBe('string');
      await db.user.update({
        where: { id: u.id },
        data: { status: 'INACTIVE' },
      });
      await comoAdmin(http().get('/api/helpdesk/token'), quem).expect(401);
    });

    it('13. login por e-mail secundário VERIFICADO → 200, a mesma pessoa; não verificado → 401', async () => {
      const u = await pessoa('principal@example.invalid');
      await db.userEmail.create({
        data: {
          userId: u.id,
          email: 'secundario@example.invalid',
          verifiedAt: new Date(),
        },
      });
      await db.userEmail.create({
        data: { userId: u.id, email: 'naoverificado@example.invalid' },
      });

      const res = await login('  SECUNDARIO@example.invalid ').expect(200);
      expect(res.body.user.id).toBe(u.id);
      // A sessão é da pessoa: o e-mail devolvido é o principal.
      expect(res.body.user.email).toBe('principal@example.invalid');
      const pub = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(pub.publicId).toBe(u.publicId);

      await login('naoverificado@example.invalid').expect(401);
    });
  });

  describe('DELETE, listagem e reativação', () => {
    it('6. DELETE → a linha fica, INACTIVE, com autor e data, e TODAS as sessões revogadas', async () => {
      const u = await pessoa('apagar@example.invalid');
      await login('apagar@example.invalid').expect(200);
      await login('apagar@example.invalid').expect(200);

      const res = await comoAdmin(http().delete(`/api/users/${u.id}`)).expect(
        200,
      );
      expect(res.body.message).toBe(
        'Usuário apagar@example.invalid excluído com sucesso',
      );
      const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(depois.status).toBe('INACTIVE');
      expect(depois.deactivatedAt).toBeInstanceOf(Date);
      expect(depois.deactivatedById).toBe(admin.id);
      expect(
        await db.refreshToken.count({
          where: { userId: u.id, revoked: false },
        }),
      ).toBe(0);
      expect(await eventos(u.id, 'user.deactivated')).toHaveLength(1);
      // Os acessos não mudam (a inativação já barra o login).
      expect(await flagsAtivas(u.id)).toEqual(['analytics']);
    });

    it('GET /users lista só os ativos; ?includeInactive=true lista todos', async () => {
      const ativos = await comoAdmin(http().get('/api/users')).expect(200);
      expect(ativos.body.every((u: any) => u.status === 'ACTIVE')).toBe(true);
      const todos = await comoAdmin(
        http().get('/api/users?includeInactive=true'),
      ).expect(200);
      expect(todos.body.some((u: any) => u.status === 'INACTIVE')).toBe(true);
      expect(todos.body.length).toBeGreaterThan(ativos.body.length);
    });

    it('7. POST com o e-mail de um inativo → 409 USER_INACTIVE; reativar → volta a entrar', async () => {
      const u = await pessoa('voltar@example.invalid', { status: 'INACTIVE' });
      const res = await novo({
        email: 'VOLTAR@example.invalid',
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        systems: ['analytics'],
      }).expect(409);
      expect(res.body.code).toBe('USER_INACTIVE');

      await login('voltar@example.invalid').expect(401);
      await comoAdmin(http().post(`/api/users/${u.id}/reactivate`)).expect(201);
      const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(depois.status).toBe('ACTIVE');
      expect(depois.deactivatedAt).toBeNull();
      expect(await eventos(u.id, 'user.reactivated')).toHaveLength(1);
      await login('voltar@example.invalid').expect(200);
    });

    it('reativar e PUT de sistemas: quem não é ADMIN da LHG → 403', async () => {
      const u = await pessoa('alvo403@example.invalid');
      const gerente = { id: u.id, role: 'GERENTE_GERAL', unit: 'LHG' };
      const adminDeUnidade = { id: u.id, role: 'ADMIN', unit: 'LUSH_LAPA' };
      for (const quem of [gerente, adminDeUnidade]) {
        await comoAdmin(
          http().post(`/api/users/${u.id}/reactivate`),
          quem,
        ).expect(403);
        await comoAdmin(
          http().put(`/api/users/${u.id}/systems`).send({ systems: [] }),
          quem,
        ).expect(403);
      }
      expect(await flagsAtivas(u.id)).toEqual(['analytics']);
    });
  });

  describe('flags explícitas no cadastro', () => {
    it('7. POST com systems ["analytics"] cria a pessoa com a flag (grantedBy = admin)', async () => {
      const res = await novo({
        email: 'comflag@example.invalid',
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        systems: ['analytics'],
      }).expect(201);
      expect(res.headers['deprecation']).toBeUndefined();
      const acessos = await db.systemAccess.findMany({
        where: { userId: res.body.id },
      });
      expect(acessos.map((a) => a.systemKey)).toEqual(['analytics']);
      expect(acessos[0].grantedById).toBe(admin.id);
      await login('comflag@example.invalid').expect(200);
    });

    it('16. systems ["cms"] → só a flag cms; login no Analytics → 401', async () => {
      const res = await novo({
        email: 'socms@example.invalid',
        systems: ['cms'],
      }).expect(201);
      expect(res.body.role).toBeNull();
      expect(res.body.unit).toBeNull();
      expect(await flagsAtivas(res.body.id)).toEqual(['cms']);
      await login('socms@example.invalid').expect(401);
    });

    it('17. ["analytics","cms"] + role + unit → as 2 flags; login → 200', async () => {
      const res = await novo({
        email: 'duas@example.invalid',
        role: 'GERENTE_RESERVAS',
        unit: 'LIV',
        systems: ['analytics', 'cms'],
      }).expect(201);
      expect(await flagsAtivas(res.body.id)).toEqual(['analytics', 'cms']);
      const eventosGrant = await eventos(res.body.id, 'access.granted');
      expect(eventosGrant.map((e) => e.systemKey).sort()).toEqual([
        'analytics',
        'cms',
      ]);
      await login('duas@example.invalid').expect(200);
    });

    it('18. ["analytics"] sem role ou sem unit → 400', async () => {
      const semRole = await novo({
        email: 'r18a@example.invalid',
        unit: 'TOUT',
        systems: ['analytics'],
      }).expect(400);
      expect(semRole.body.code).toBe('ROLE_UNIT_REQUIRED');
      const semUnit = await novo({
        email: 'r18b@example.invalid',
        role: 'GERENTE_GERAL',
        systems: ['analytics'],
      }).expect(400);
      expect(semUnit.body.code).toBe('ROLE_UNIT_REQUIRED');
      expect(
        await db.user.count({
          where: {
            email: { in: ['r18a@example.invalid', 'r18b@example.invalid'] },
          },
        }),
      ).toBe(0);
    });

    it('19. sistema desconhecido ou inativo → 400 UNKNOWN_SYSTEM; repetidos → 1 flag', async () => {
      const desconhecido = await novo({
        email: 'r19a@example.invalid',
        systems: ['cms', 'nao-existe'],
      }).expect(400);
      expect(desconhecido.body.code).toBe('UNKNOWN_SYSTEM');

      await db.system.update({ where: { key: 'rm' }, data: { active: false } });
      try {
        const inativo = await novo({
          email: 'r19b@example.invalid',
          systems: ['rm'],
        }).expect(400);
        expect(inativo.body.code).toBe('UNKNOWN_SYSTEM');
      } finally {
        await db.system.update({
          where: { key: 'rm' },
          data: { active: true },
        });
      }

      const repetido = await novo({
        email: 'r19c@example.invalid',
        systems: ['cms', 'cms', 'cms'],
      }).expect(201);
      expect(await flagsAtivas(repetido.body.id)).toEqual(['cms']);
    });

    it('20. SEM systems e USERS_SYSTEMS_REQUIRED=false + role + unit → só analytics, legacyDefault e Deprecation', async () => {
      const res = await novo({
        email: 'legado@example.invalid',
        role: 'GERENTE_GERAL',
        unit: 'ALTANA',
      }).expect(201);
      expect(res.headers['deprecation']).toBe('true');
      expect(await flagsAtivas(res.body.id)).toEqual(['analytics']);
      const [grant] = await eventos(res.body.id, 'access.granted');
      expect((grant.metadata as Prisma.JsonObject).legacyDefault).toBe(true);
      await login('legado@example.invalid').expect(200);
    });

    it('20. SEM systems e sem role ou sem unit → 400', async () => {
      await novo({ email: 'legado2@example.invalid', unit: 'TOUT' }).expect(
        400,
      );
      await novo({
        email: 'legado3@example.invalid',
        role: 'GERENTE_GERAL',
      }).expect(400);
    });

    it('20. SEM systems e USERS_SYSTEMS_REQUIRED=true → 400 SYSTEMS_REQUIRED', async () => {
      process.env.USERS_SYSTEMS_REQUIRED = 'true';
      try {
        const res = await novo({
          email: 'legado4@example.invalid',
          role: 'GERENTE_GERAL',
          unit: 'TOUT',
        }).expect(400);
        expect(res.body.code).toBe('SYSTEMS_REQUIRED');
        // Com systems explícito continua funcionando.
        await novo({
          email: 'legado5@example.invalid',
          role: 'GERENTE_GERAL',
          unit: 'TOUT',
          systems: ['analytics'],
        }).expect(201);
      } finally {
        delete process.env.USERS_SYSTEMS_REQUIRED;
      }
    });

    it('23. systems [] → a pessoa existe sem nenhum acesso; login → 401', async () => {
      const res = await novo({
        email: 'nenhum@example.invalid',
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        systems: [],
      }).expect(201);
      expect(await flagsAtivas(res.body.id)).toEqual([]);
      await login('nenhum@example.invalid').expect(401);
    });
  });

  describe('editar acessos depois', () => {
    it('21. PUT /systems concede e revoga com histórico e auditoria; revogar analytics derruba as sessões', async () => {
      const u = await pessoa('put@example.invalid', {
        systems: ['analytics', 'cms'],
      });
      const cookie = cookieDe(await login('put@example.invalid').expect(200));

      const res = await comoAdmin(
        http()
          .put(`/api/users/${u.id}/systems`)
          .send({ systems: ['cms', 'supplies'] }),
      ).expect(200);
      expect(res.body).toEqual({
        systems: ['cms', 'supplies'],
        granted: ['supplies'],
        revoked: ['analytics'],
      });
      expect(await flagsAtivas(u.id)).toEqual(['cms', 'supplies']);

      const historico = await db.systemAccess.findFirstOrThrow({
        where: { userId: u.id, systemKey: 'analytics' },
      });
      expect(historico.revokedAt).toBeInstanceOf(Date);
      expect(historico.revokedById).toBe(admin.id);
      expect(await eventos(u.id, 'access.revoked')).toHaveLength(1);
      expect(
        (await eventos(u.id, 'access.granted')).map((e) => e.systemKey),
      ).toEqual(['supplies']);

      expect(
        await db.refreshToken.count({
          where: { userId: u.id, revoked: false },
        }),
      ).toBe(0);
      await http().post('/api/refresh').set('Cookie', cookie).expect(401);
      await login('put@example.invalid').expect(401);

      // Devolver o Analytics: nova linha de acesso; a revogada fica.
      await comoAdmin(
        http()
          .put(`/api/users/${u.id}/systems`)
          .send({ systems: ['analytics', 'cms', 'supplies'] }),
      ).expect(200);
      expect(
        await db.systemAccess.count({
          where: { userId: u.id, systemKey: 'analytics' },
        }),
      ).toBe(2);
      await login('put@example.invalid').expect(200);
    });

    it('21. PUT com sistema desconhecido → 400 e nada muda; analytics para quem não tem perfil → 400', async () => {
      const u = await pessoa('put2@example.invalid', { systems: ['cms'] });
      const r1 = await comoAdmin(
        http()
          .put(`/api/users/${u.id}/systems`)
          .send({ systems: ['nao-existe'] }),
      ).expect(400);
      expect(r1.body.code).toBe('UNKNOWN_SYSTEM');
      expect(await flagsAtivas(u.id)).toEqual(['cms']);

      const semPerfil = await pessoa('put3@example.invalid', {
        role: null,
        unit: null,
        systems: [],
      });
      const r2 = await comoAdmin(
        http()
          .put(`/api/users/${semPerfil.id}/systems`)
          .send({ systems: ['analytics'] }),
      ).expect(400);
      expect(r2.body.code).toBe('ROLE_UNIT_REQUIRED');
    });

    it('22. PATCH sem systems → as flags não mudam; PATCH com systems → 400', async () => {
      const u = await pessoa('patch@example.invalid', {
        systems: ['analytics', 'cms'],
      });
      await comoAdmin(
        http().patch(`/api/users/${u.id}`).send({ name: 'Nome Novo' }),
      ).expect(200);
      expect(await flagsAtivas(u.id)).toEqual(['analytics', 'cms']);

      await comoAdmin(
        http()
          .patch(`/api/users/${u.id}`)
          .send({ systems: ['cms'] }),
      ).expect(400);
      expect(await flagsAtivas(u.id)).toEqual(['analytics', 'cms']);
    });
  });
});

// API legada /api/users (front antigo do Analytics, scripts de admin): as MESMAS
// travas do painel admin do HUB. Ninguém tira o próprio ADMIN/LHG (PATCH
// role/unit), não se inativa (DELETE), não revoga os próprios acessos (PUT
// systems); quem pede precisa AINDA ser admin no banco; e nunca fica zero admin
// da LHG ativo, mesmo com duas mudanças ao mesmo tempo. No banco migrado de
// verdade. Senhas de TESTE.
import {
  ExecutionContext,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AccessService } from '../access/access.service';
import { LoginLockService } from '../access/login-lock.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UnitsGuard } from '../auth/guards/units.guard';
import { OidcLogoutService } from '../oidc/oidc-logout.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { apagarSchema, migrar, novoSchema } from './db-helpers';

const SENHA = 'senha-de-teste-123';

describe('API legada /api/users: travas de administração', () => {
  let url: string;
  let app: INestApplication;
  let db: PrismaService['prismaOnline'];
  let logado = 0; // quem "está logado" (o JWT do Analytics)
  let n = 0;
  const espioes: jest.SpyInstance[] = [];

  /** Começa cada teste sem nenhum admin ativo além dos que ele criar. */
  async function zerarAdmins() {
    await db.user.updateMany({
      where: { role: 'ADMIN', unit: 'LHG', status: 'ACTIVE' },
      data: { role: 'GERENTE_GERAL', unit: 'TOUT' },
    });
  }
  const pessoa = (role: 'ADMIN' | 'GERENTE_GERAL', unit: 'LHG' | 'TOUT') =>
    db.user.create({
      data: {
        email: `pessoa-${++n}@example.invalid`,
        name: `Pessoa ${n}`,
        password: bcrypt.hashSync(SENHA, 4),
        role,
        unit,
        systemAccesses: {
          create: [{ systemKey: 'analytics' }, { systemKey: 'cms' }],
        },
      },
    });
  const admin = () => pessoa('ADMIN', 'LHG');
  const como = (id: number) => {
    logado = id;
    return request(app.getHttpServer());
  };

  beforeAll(async () => {
    url = novoSchema('ttrav');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    for (const m of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      espioes.push(jest.spyOn(Logger.prototype, m).mockImplementation());
    }
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        JwtModule.register({ secret: 'segredo-de-teste-local' }),
      ],
      controllers: [UsersController],
      providers: [
        AccessService,
        LoginLockService,
        OidcLogoutService,
        UsersService,
        PrismaService,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: logado };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(UnitsGuard)
      .useValue({ canActivate: () => true })
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
  });

  afterAll(async () => {
    await app?.close();
    espioes.forEach((e) => e.mockRestore());
    await apagarSchema(url);
  });

  beforeEach(zerarAdmins);

  describe('PATCH /api/users/:id (perfil e unidade)', () => {
    it('o admin NÃO tira o próprio ADMIN nem a própria unidade LHG (409 SELF_ROLE_CHANGE); outros campos de si mesmo seguem', async () => {
      const a = await admin();
      await admin();
      for (const corpo of [
        { role: 'GERENTE_GERAL' },
        { unit: 'TOUT' },
        { role: 'GERENTE_GERAL', unit: 'TOUT' },
      ]) {
        const r = await como(a.id).patch(`/api/users/${a.id}`).send(corpo);
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('SELF_ROLE_CHANGE');
      }
      const u = await db.user.findUniqueOrThrow({ where: { id: a.id } });
      expect([u.role, u.unit]).toEqual(['ADMIN', 'LHG']);
      // mudar o próprio nome, ou mandar o mesmo perfil, segue valendo
      await como(a.id)
        .patch(`/api/users/${a.id}`)
        .send({ name: 'Novo Nome', role: 'ADMIN', unit: 'LHG' })
        .expect(200);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: a.id } })).name,
      ).toBe('Novo Nome');
    });

    it('rebaixar OUTRO admin com outros admins ativos: 200; quem pede e não é mais admin no banco: 403 FORBIDDEN_NOT_ADMIN', async () => {
      const a = await admin();
      const b = await admin();
      await como(a.id)
        .patch(`/api/users/${b.id}`)
        .send({ role: 'GERENTE_GERAL', unit: 'TOUT' })
        .expect(200);
      // b não é mais admin, mas o JWT dele ainda diz ADMIN (até vencer)
      const c = await admin();
      const r = await como(b.id)
        .patch(`/api/users/${c.id}`)
        .send({ role: 'GERENTE_GERAL' });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('FORBIDDEN_NOT_ADMIN');
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: c.id } })).role,
      ).toBe('ADMIN');
    });

    it('mudar quem NÃO é admin continua livre (sem trava)', async () => {
      const a = await admin();
      const g = await pessoa('GERENTE_GERAL', 'TOUT');
      await como(a.id)
        .patch(`/api/users/${g.id}`)
        .send({ unit: 'LIV' })
        .expect(200);
    });
  });

  describe('DELETE /api/users/:id (inativar)', () => {
    it('ninguém se inativa (409 SELF_DEACTIVATION)', async () => {
      const a = await admin();
      await admin();
      const r = await como(a.id).delete(`/api/users/${a.id}`);
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('SELF_DEACTIVATION');
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: a.id } })).status,
      ).toBe('ACTIVE');
    });

    it('inativar outro admin: 200 e auditado; quem pede e não é mais admin no banco: 403', async () => {
      const a = await admin();
      const b = await admin();
      await como(a.id).delete(`/api/users/${b.id}`).expect(200);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: b.id } })).status,
      ).toBe('INACTIVE');
      const [ev] = await db.auditEvent.findMany({
        where: { action: 'user.deactivated', targetUserId: b.id },
      });
      expect(ev.actorUserId).toBe(a.id);
      const c = await admin();
      const r = await como(b.id).delete(`/api/users/${c.id}`);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('FORBIDDEN_NOT_ADMIN');
    });

    it('dois admins inativando UM AO OUTRO ao mesmo tempo: só um consegue (LAST_ADMIN ou FORBIDDEN_NOT_ADMIN); nunca fica zero admin', async () => {
      const a = await admin();
      const b = await admin();
      const svc = app.get(UsersService);
      const rs = await Promise.allSettled([
        svc.remove(b.id, { id: a.id }),
        svc.remove(a.id, { id: b.id }),
      ]);
      expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const erro = (
        rs.find((r) => r.status === 'rejected') as PromiseRejectedResult
      ).reason;
      expect(['LAST_ADMIN', 'FORBIDDEN_NOT_ADMIN']).toContain(
        erro.getResponse().code,
      );
      expect(
        await db.user.count({
          where: { role: 'ADMIN', unit: 'LHG', status: 'ACTIVE' },
        }),
      ).toBe(1);
    });

    it('inativar quem não é admin continua livre', async () => {
      const a = await admin();
      const g = await pessoa('GERENTE_GERAL', 'TOUT');
      await como(a.id).delete(`/api/users/${g.id}`).expect(200);
    });
  });

  describe('PUT /api/users/:id/systems', () => {
    it('ninguém revoga os PRÓPRIOS acessos (409 SELF_ACCESS_CHANGE); conceder a si mesmo e mudar os de outro seguem', async () => {
      const a = await admin();
      const b = await admin();
      const r = await como(a.id)
        .put(`/api/users/${a.id}/systems`)
        .send({ systems: ['analytics'] });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('SELF_ACCESS_CHANGE');
      expect(
        await db.systemAccess.count({
          where: { userId: a.id, revokedAt: null },
        }),
      ).toBe(2);
      await como(a.id)
        .put(`/api/users/${a.id}/systems`)
        .send({ systems: ['analytics', 'cms', 'rm'] })
        .expect(200);
      await como(a.id)
        .put(`/api/users/${b.id}/systems`)
        .send({ systems: ['analytics'] })
        .expect(200);
    });
  });
});

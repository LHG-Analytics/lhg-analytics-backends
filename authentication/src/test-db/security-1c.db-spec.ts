// 1c-C1: senha única com rehash para custo 12, bloqueio por tentativas, trocar
// senha e CPF opcional. Banco migrado de verdade; os guards de cargo/unidade
// são os REAIS e o JWT é simulado pelo cabeçalho x-test-user.
// Numeração = testes obrigatórios da especificação da etapa 1c.
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
import * as cookieParser from 'cookie-parser';
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
const NOVA = 'senha-nova-456789';
// Evento como texto (o id é BigInt), para procurar a senha nele.
const texto = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));

describe('1c-C1: senha única, bloqueio, trocar senha, CPF opcional', () => {
  let url: string;
  let app: INestApplication;
  let db: ReturnType<typeof cliente>;
  let admin: { id: number; role: string; unit: string };
  let seq = 0;
  const cpf = () => `94${String(++seq).padStart(9, '0')}`;

  beforeAll(async () => {
    url = novoSchema('tc1');
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

    const a = await pessoa('admin@example.invalid', bcrypt.hashSync(SENHA, 4), {
      role: 'ADMIN',
      unit: 'LHG',
    });
    admin = { id: a.id, role: 'ADMIN', unit: 'LHG' };
  });

  afterAll(async () => {
    await app?.close();
    await apagarSchema(url);
  });

  /** Pessoa com acesso ao Analytics, direto no banco, com o hash dado. */
  async function pessoa(
    email: string,
    hash: string,
    o: { role?: string; unit?: string } = {},
  ) {
    return db.user.create({
      data: {
        email,
        cpf: cpf(),
        password: hash,
        role: (o.role ?? 'GERENTE_GERAL') as any,
        unit: (o.unit ?? 'LUSH_IPIRANGA') as any,
        systemAccesses: { create: { systemKey: 'analytics' } },
      },
    });
  }

  const http = () => request(app.getHttpServer());
  const como = (r: request.Test, quem: object) =>
    r.set('x-test-user', JSON.stringify(quem));
  const login = (email: string, password: string) =>
    http().post('/api/login').send({ email, password });
  const cookieDe = (res: request.Response) =>
    ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
  const custo = async (id: number) =>
    bcrypt.getRounds(
      (await db.user.findUniqueOrThrow({ where: { id } })).password!,
    );
  const eventos = (targetUserId: number, action: string) =>
    db.auditEvent.findMany({ where: { targetUserId, action } });

  describe('senha única e rehash', () => {
    it('1. login com hash de custo 10 → 200 e o hash é refeito com custo 12; o próximo login continua OK', async () => {
      const u = await pessoa(
        'custo10@example.invalid',
        bcrypt.hashSync(SENHA, 10),
      );
      await login('custo10@example.invalid', SENHA).expect(200);
      expect(await custo(u.id)).toBe(12);
      await login('custo10@example.invalid', SENHA).expect(200);
      expect(await custo(u.id)).toBe(12);
    });

    it('13. hash importado no formato $2a$11$ (Chatwoot) → entra e é refeito com custo 12', async () => {
      const hash2a = bcrypt.hashSync(SENHA, 11).replace(/^\$2b\$/, '$2a$');
      expect(hash2a.startsWith('$2a$11$')).toBe(true);
      const u = await pessoa('chatwoot@example.invalid', hash2a);
      await login('chatwoot@example.invalid', SENHA).expect(200);
      expect(await custo(u.id)).toBe(12);
      await login('chatwoot@example.invalid', SENHA).expect(200);
    });

    it('todo hash novo do cadastro já nasce com custo 12', async () => {
      const res = await como(
        http()
          .post('/api/users')
          .send({
            name: 'Pessoa Fictícia',
            email: 'novo12@example.invalid',
            password: SENHA,
            cpf: cpf(),
            role: 'GERENTE_GERAL',
            unit: 'TOUT',
            systems: ['analytics'],
          }),
        admin,
      ).expect(201);
      expect(await custo(res.body.id)).toBe(12);
      const u = await db.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(u.createdVia).toBe('admin');
    });

    it('2. senha única: trocar a senha SUBSTITUI a anterior (a antiga → 401); não há 2ª senha', async () => {
      const u = await pessoa(
        'unica@example.invalid',
        bcrypt.hashSync(SENHA, 4),
      );
      const quem = { id: u.id, role: 'GERENTE_GERAL', unit: 'LUSH_IPIRANGA' };
      await como(
        http()
          .post('/api/me/password')
          .send({ currentPassword: SENHA, newPassword: NOVA }),
        quem,
      ).expect(200);
      await login('unica@example.invalid', NOVA).expect(200);
      await login('unica@example.invalid', SENHA).expect(401);
      // O único lugar de senha é User.password: o hash mudou, nada mais.
      const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(await bcrypt.compare(NOVA, depois.password!)).toBe(true);
    });
  });

  describe('8. bloqueio por tentativas', () => {
    it('5 erros em 15 min → o 6º com a senha CERTA dá 401; auditoria sem a senha', async () => {
      const u = await pessoa('bloq@example.invalid', bcrypt.hashSync(SENHA, 4));
      for (let i = 0; i < 5; i++) {
        await login('bloq@example.invalid', 'senha-errada-' + i).expect(401);
      }
      await login('bloq@example.invalid', SENHA).expect(401);

      const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(depois.lockedUntil!.getTime()).toBeGreaterThan(
        Date.now() + 14 * 60e3,
      );
      expect(depois.lockLevel).toBe(1);
      expect(await eventos(u.id, 'login.failed')).toHaveLength(5);
      const [locked] = await eventos(u.id, 'login.locked');
      expect(locked.metadata).toMatchObject({ minutes: 15, level: 1 });
      const tudo = texto(
        await db.auditEvent.findMany({ where: { targetUserId: u.id } }),
      );
      expect(tudo).not.toContain('senha-errada');
      expect(tudo).not.toContain(SENHA);
    });

    it('respostas IDÊNTICAS para bloqueado, senha errada e e-mail inexistente', async () => {
      await pessoa('bloq2@example.invalid', bcrypt.hashSync(SENHA, 4));
      for (let i = 0; i < 5; i++) {
        await login('bloq2@example.invalid', 'errada-' + i);
      }
      await pessoa('normal8@example.invalid', bcrypt.hashSync(SENHA, 4));
      const bloqueado = await login('bloq2@example.invalid', SENHA);
      const errada = await login('normal8@example.invalid', 'senha-errada-x');
      const inexistente = await login('ninguem8@example.invalid', SENHA);
      for (const r of [bloqueado, errada, inexistente]) {
        expect(r.status).toBe(401);
        expect(r.body).toEqual(bloqueado.body);
        expect(r.headers['set-cookie']).toBeUndefined();
      }
    });

    it('depois do tempo, entra (e acertar zera o contador e o backoff)', async () => {
      const u = await pessoa(
        'tempo@example.invalid',
        bcrypt.hashSync(SENHA, 4),
      );
      for (let i = 0; i < 5; i++)
        await login('tempo@example.invalid', 'x' + i + 'yyyyyy');
      await db.user.update({
        where: { id: u.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      await login('tempo@example.invalid', SENHA).expect(200);
      const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(depois).toMatchObject({
        failedLoginCount: 0,
        lockedUntil: null,
        lockLevel: 0,
      });
    });

    it('backoff: o 2º bloqueio seguido dura 30 min', async () => {
      const u = await pessoa(
        'backoff@example.invalid',
        bcrypt.hashSync(SENHA, 4),
      );
      for (let i = 0; i < 5; i++)
        await login('backoff@example.invalid', 'a' + i + 'zzzzzzz');
      // O 1º bloqueio venceu, mas a pessoa erra de novo sem acertar no meio.
      await db.user.update({
        where: { id: u.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      for (let i = 0; i < 5; i++)
        await login('backoff@example.invalid', 'b' + i + 'zzzzzzz');
      const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(depois.lockLevel).toBe(2);
      const minutos = (depois.lockedUntil!.getTime() - Date.now()) / 60e3;
      expect(minutos).toBeGreaterThan(29);
      expect(minutos).toBeLessThanOrEqual(30);
    });

    it('desbloqueio manual (ADMIN da LHG) funciona e é auditado; outros → 403', async () => {
      const u = await pessoa(
        'manual@example.invalid',
        bcrypt.hashSync(SENHA, 4),
      );
      for (let i = 0; i < 5; i++)
        await login('manual@example.invalid', 'm' + i + 'zzzzzzz');
      await login('manual@example.invalid', SENHA).expect(401);

      const gerente = { id: u.id, role: 'GERENTE_GERAL', unit: 'LHG' };
      await como(http().post(`/api/users/${u.id}/unlock`), gerente).expect(403);

      await como(http().post(`/api/users/${u.id}/unlock`), admin).expect(201);
      await login('manual@example.invalid', SENHA).expect(200);
      const [ev] = await eventos(u.id, 'login.unlocked');
      expect(ev.actorUserId).toBe(admin.id);
    });

    it('o bloqueio é por CONTA: outra conta do mesmo IP continua entrando', async () => {
      await pessoa('alvo8@example.invalid', bcrypt.hashSync(SENHA, 4));
      await pessoa('vizinha8@example.invalid', bcrypt.hashSync(SENHA, 4));
      for (let i = 0; i < 5; i++)
        await login('alvo8@example.invalid', 'v' + i + 'zzzzzzz');
      await login('alvo8@example.invalid', SENHA).expect(401);
      await login('vizinha8@example.invalid', SENHA).expect(200);
    });
  });

  describe('9. trocar senha (POST /api/me/password)', () => {
    it('a nova entra, a antiga dá 401, as OUTRAS sessões caem (a atual fica) e há auditoria sem a senha', async () => {
      const u = await pessoa(
        'troca@example.invalid',
        bcrypt.hashSync(SENHA, 4),
      );
      const quem = { id: u.id, role: 'GERENTE_GERAL', unit: 'LUSH_IPIRANGA' };
      const outra = cookieDe(
        await login('troca@example.invalid', SENHA).expect(200),
      );
      const atual = cookieDe(
        await login('troca@example.invalid', SENHA).expect(200),
      );

      const res = await como(
        http()
          .post('/api/me/password')
          .set('Cookie', atual)
          .send({ currentPassword: SENHA, newPassword: NOVA }),
        quem,
      ).expect(200);
      expect(res.body.message).toBe('Senha alterada com sucesso');

      // A OUTRA sessão tenta primeiro (achado da homologação): ela cai, mas
      // isso NÃO pode derrubar a sessão atual.
      await http().post('/api/refresh').set('Cookie', outra).expect(401);
      await http().post('/api/refresh').set('Cookie', atual).expect(200);
      await login('troca@example.invalid', NOVA).expect(200);
      await login('troca@example.invalid', SENHA).expect(401);
      expect(await custo(u.id)).toBe(12);

      const [ev] = await eventos(u.id, 'password.changed');
      expect(ev).toBeDefined();
      expect(texto(ev)).not.toContain(NOVA);
      expect(texto(ev)).not.toContain(SENHA);
    });

    it('a senha atual ERRADA conta no mesmo bloqueio do login', async () => {
      const u = await pessoa(
        'trocaerrada@example.invalid',
        bcrypt.hashSync(SENHA, 4),
      );
      const quem = { id: u.id, role: 'GERENTE_GERAL', unit: 'LUSH_IPIRANGA' };
      for (let i = 0; i < 5; i++) {
        const r = await como(
          http()
            .post('/api/me/password')
            .send({
              currentPassword: 'errada-' + i + 'xxxx',
              newPassword: NOVA,
            }),
          quem,
        ).expect(401);
        expect(r.body.message).toBe('Senha atual incorreta');
      }
      await login('trocaerrada@example.invalid', SENHA).expect(401);
      const falhas = await eventos(u.id, 'login.failed');
      expect(falhas.map((e) => (e.metadata as any).source)).toEqual(
        Array(5).fill('password_change'),
      );
    });

    it('regras da nova senha: curta, igual à atual ou com cara de hash → 400', async () => {
      const u = await pessoa(
        'regras@example.invalid',
        bcrypt.hashSync(SENHA, 4),
      );
      const quem = { id: u.id, role: 'GERENTE_GERAL', unit: 'LUSH_IPIRANGA' };
      const troca = (newPassword: string) =>
        como(
          http()
            .post('/api/me/password')
            .send({ currentPassword: SENHA, newPassword }),
          quem,
        );
      await troca('curta123').expect(400);
      expect((await troca(SENHA).expect(400)).body.code).toBe('SAME_PASSWORD');
      const pareceHash = bcrypt.hashSync('qualquer', 4);
      expect((await troca(pareceHash).expect(400)).body.code).toBe(
        'PASSWORD_LOOKS_LIKE_HASH',
      );
      await login('regras@example.invalid', SENHA).expect(200);
    });
  });

  describe('10. CPF opcional', () => {
    const novo = (corpo: Record<string, unknown>) =>
      como(
        http()
          .post('/api/users')
          .send({ name: 'Pessoa Fictícia', password: SENHA, ...corpo }),
        admin,
      );

    it('sem analytics, sem CPF → 201 com CPF nulo', async () => {
      const res = await novo({
        email: 'semcpf@example.invalid',
        systems: ['cms'],
      }).expect(201);
      expect(res.body.cpf).toBeNull();
    });

    it('com analytics, sem CPF → 400 CPF_REQUIRED (também no cadastro sem systems)', async () => {
      const r1 = await novo({
        email: 'semcpf2@example.invalid',
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
        systems: ['analytics'],
      }).expect(400);
      expect(r1.body.code).toBe('CPF_REQUIRED');
      const r2 = await novo({
        email: 'semcpf3@example.invalid',
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
      }).expect(400);
      expect(r2.body.code).toBe('CPF_REQUIRED');
    });

    it('CPF informado continua único', async () => {
      const c = cpf();
      await novo({ email: 'cpf1@example.invalid', cpf: c, systems: [] }).expect(
        201,
      );
      const r = await novo({
        email: 'cpf2@example.invalid',
        cpf: c,
        systems: [],
      });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(await db.user.count({ where: { cpf: c } })).toBe(1);
    });
  });

  it('14. regressão: o login de quem tem flag + perfil mantém os mesmos cookies e campos', async () => {
    await pessoa('regressao@example.invalid', bcrypt.hashSync(SENHA, 4));
    const res = await login('regressao@example.invalid', SENHA).expect(200);
    expect(Object.keys(res.body.user).sort()).toEqual([
      'email',
      'id',
      'name',
      'role',
      'unit',
    ]);
    expect(res.body.message).toBe('Login realizado com sucesso');
    expect(cookieDe(res)).toMatch(/access_token=.*refresh_token=/);
  });
});

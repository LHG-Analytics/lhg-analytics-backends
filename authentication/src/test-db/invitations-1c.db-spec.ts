// 1c-C3: convites (criar, listar, revogar, link novo) e aceite por senha, no
// banco migrado de verdade. Guards de cargo/unidade REAIS; JWT simulado pelo
// cabeçalho x-test-user. Numeração = testes obrigatórios da etapa 1c.
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
import {
  InvitationAcceptController,
  InvitationsController,
} from '../invitations/invitations.controller';
import {
  CONVITE_INVALIDO,
  InvitationsService,
  hashToken,
} from '../invitations/invitations.service';
import { OidcLogoutService } from '../oidc/oidc-logout.service';
import { PrismaService } from '../prisma/prisma.service';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';

const SENHA = 'senha-do-convite-123';
const DIA = 24 * 60 * 60 * 1000;
const texto = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));

describe('1c-C3: convites e aceite por senha', () => {
  let url: string;
  let app: INestApplication;
  let db: ReturnType<typeof cliente>;
  let admin: { id: number; role: string; unit: string };
  let seq = 0;
  const email = (tag: string) => `${tag}.${++seq}@example.invalid`;

  beforeAll(async () => {
    url = novoSchema('tc3');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    process.env.INVITE_LINK_BASE_URL = 'https://hub.exemplo.invalid/convite';

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
      controllers: [
        AuthController,
        InvitationAcceptController,
        InvitationsController,
      ],
      providers: [
        AuthService,
        AccessService,
        LoginLockService,
        OidcLogoutService,
        InvitationsService,
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

    const a = await db.user.create({
      data: {
        email: 'admin@example.invalid',
        password: bcrypt.hashSync(SENHA, 4),
        role: 'ADMIN',
        unit: 'LHG',
        systemAccesses: { create: { systemKey: 'analytics' } },
      },
    });
    admin = { id: a.id, role: 'ADMIN', unit: 'LHG' };
  });

  afterAll(async () => {
    delete process.env.INVITE_LINK_BASE_URL;
    await app?.close();
    await apagarSchema(url);
  });

  const http = () => request(app.getHttpServer());
  const comoAdmin = (r: request.Test, quem: object = admin) =>
    r.set('x-test-user', JSON.stringify(quem));
  const convidar = (corpo: Record<string, unknown>, quem: object = admin) =>
    comoAdmin(
      http()
        .post('/api/invitations')
        .send({ systems: [], validity: '7', ...corpo }),
      quem,
    );
  const check = (token: string) =>
    http().post('/api/invitations/accept/check').send({ token });
  const aceitar = (token: string, password = SENHA) =>
    http().post('/api/invitations/accept/password').send({ token, password });
  const login = (e: string, password = SENHA) =>
    http().post('/api/login').send({ email: e, password });

  describe('12. criar, listar, revogar e link novo (só ADMIN da LHG)', () => {
    it('o link aparece UMA vez (fragmento #) e o banco guarda SÓ o hash', async () => {
      const e = email('link');
      const res = await convidar({
        email: e,
        name: 'Pessoa Convidada',
        systems: ['analytics'],
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
      }).expect(201);
      const { token, link } = res.body;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(link).toBe(`https://hub.exemplo.invalid/convite#${token}`);
      expect(res.headers['cache-control']).toBe('no-store');

      const linha = await db.invitation.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(linha.tokenHash).toBe(hashToken(token));
      expect(texto(linha)).not.toContain(token);

      const lista = await comoAdmin(http().get('/api/invitations')).expect(200);
      // Ajuste (a): a listagem não fica em cache.
      expect(lista.headers['cache-control']).toBe('no-store');
      const item = lista.body.find((i: any) => i.id === res.body.id);
      expect(item.status).toBe('pending');
      expect(texto(lista.body)).not.toContain(token);
      expect(texto(lista.body)).not.toContain(linha.tokenHash);
      expect(item).not.toHaveProperty('token');
      expect(item).not.toHaveProperty('tokenHash');

      const [ev] = await db.auditEvent.findMany({
        where: { action: 'invite.created' },
        orderBy: { id: 'desc' },
        take: 1,
      });
      expect(texto(ev)).not.toContain(token);
    });

    it('validade 7, 14 e 30 dias; "nunca" exige motivo e grava expiresAt nulo', async () => {
      for (const dias of [7, 14, 30]) {
        const res = await convidar({
          email: email('val'),
          validity: String(dias),
        }).expect(201);
        const delta = new Date(res.body.expiresAt).getTime() - Date.now();
        expect(Math.round(delta / DIA)).toBe(dias);
      }
      const sem = await convidar({
        email: email('nunca'),
        validity: 'never',
      }).expect(400);
      expect(sem.body.code).toBe('NEVER_REASON_REQUIRED');

      const com = await convidar({
        email: email('nunca'),
        validity: 'never',
        neverReason: 'Prestador fixo, sem prazo de chegada',
      }).expect(201);
      expect(com.body.expiresAt).toBeNull();
      const evs = await db.auditEvent.findMany({
        where: { action: 'invite.created' },
      });
      const ev = evs.find(
        (x) => (x.metadata as any).invitationId === com.body.id,
      );
      expect((ev!.metadata as any).expiresAt).toBeNull();
      await convidar({ email: email('val'), validity: '3' }).expect(400);
    });

    it('409 EMAIL_IN_USE (principal ou secundário de alguém) e 409 INVITE_PENDING', async () => {
      const dono = await db.user.create({ data: { email: email('dono') } });
      await db.userEmail.create({
        data: { userId: dono.id, email: 'secundario.dono@example.invalid' },
      });
      expect(
        (await convidar({ email: dono.email }).expect(409)).body.code,
      ).toBe('EMAIL_IN_USE');
      expect(
        (
          await convidar({ email: 'SECUNDARIO.DONO@example.invalid' }).expect(
            409,
          )
        ).body.code,
      ).toBe('EMAIL_IN_USE');

      const e = email('pend');
      await convidar({ email: e }).expect(201);
      expect((await convidar({ email: e }).expect(409)).body.code).toBe(
        'INVITE_PENDING',
      );
    });

    it('analytics no convite exige perfil e unidade; sistema desconhecido → 400', async () => {
      const r1 = await convidar({
        email: email('perfil'),
        systems: ['analytics'],
      }).expect(400);
      expect(r1.body.code).toBe('ROLE_UNIT_REQUIRED');
      const r2 = await convidar({
        email: email('sis'),
        systems: ['nao-existe'],
      }).expect(400);
      expect(r2.body.code).toBe('UNKNOWN_SYSTEM');
    });

    it('quem não é ADMIN da LHG → 403 em todas as rotas de gestão', async () => {
      const gerente = { id: admin.id, role: 'GERENTE_GERAL', unit: 'LHG' };
      const adminUnidade = { id: admin.id, role: 'ADMIN', unit: 'TOUT' };
      for (const quem of [gerente, adminUnidade]) {
        await convidar({ email: email('x') }, quem).expect(403);
        await comoAdmin(http().get('/api/invitations'), quem).expect(403);
        await comoAdmin(http().delete('/api/invitations/1'), quem).expect(403);
        await comoAdmin(
          http().post('/api/invitations/1/new-link'),
          quem,
        ).expect(403);
      }
    });

    it('revogar: o link deixa de valer, com auditoria; revogar de novo → 409', async () => {
      const res = await convidar({ email: email('rev') }).expect(201);
      await check(res.body.token).expect(200);
      await comoAdmin(http().delete(`/api/invitations/${res.body.id}`)).expect(
        200,
      );
      const r = await check(res.body.token).expect(400);
      expect(r.body.message).toBe(CONVITE_INVALIDO);
      await comoAdmin(http().delete(`/api/invitations/${res.body.id}`)).expect(
        409,
      );
      const ev = await db.auditEvent.findMany({
        where: { action: 'invite.revoked' },
      });
      expect(
        ev.some((x) => (x.metadata as any).invitationId === res.body.id),
      ).toBe(true);
    });

    it('gerar link novo: o token antigo deixa de valer e o novo vale', async () => {
      const res = await convidar({ email: email('novo') }).expect(201);
      const novo = await comoAdmin(
        http().post(`/api/invitations/${res.body.id}/new-link`),
      ).expect(201);
      expect(novo.body.token).not.toBe(res.body.token);
      expect(novo.body.link).toBe(
        `https://hub.exemplo.invalid/convite#${novo.body.token}`,
      );
      await check(res.body.token).expect(400);
      await check(novo.body.token).expect(200);
      await aceitar(res.body.token).expect(400);
    });

    it('convite VENCIDO dá lugar a um novo para o mesmo e-mail (o antigo é revogado)', async () => {
      const e = email('venc');
      const velho = await convidar({ email: e }).expect(201);
      await db.invitation.update({
        where: { id: velho.body.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await convidar({ email: e }).expect(201);
      const antigo = await db.invitation.findUniqueOrThrow({
        where: { id: velho.body.id },
      });
      expect(antigo.revokedAt).toBeInstanceOf(Date);
    });
  });

  describe('12b. aceite por senha', () => {
    it('check mostra o e-mail MASCARADO; o aceite cria a pessoa com a senha única e as flags do convite', async () => {
      const e = email('aceite');
      const inv = await convidar({
        email: e,
        name: 'Pessoa Aceite',
        systems: ['analytics', 'cms'],
        role: 'GERENTE_RESERVAS',
        unit: 'LIV',
      }).expect(201);

      const c = await check(inv.body.token).expect(200);
      expect(c.body).toMatchObject({
        valid: true,
        methods: ['password', 'google'],
      });
      expect(c.body.emailMasked).toBe(`${e.slice(0, 2)}***@example.invalid`);
      expect(c.headers['referrer-policy']).toBe('no-referrer');
      expect(c.headers['cache-control']).toBe('no-store');

      const a = await aceitar(inv.body.token).expect(201);
      expect(a.headers['referrer-policy']).toBe('no-referrer');
      // Ajuste (b): a resposta do aceite traz o e-mail MASCARADO.
      expect(a.body.emailMasked).toBe(`${e.slice(0, 2)}***@example.invalid`);
      expect(a.body).not.toHaveProperty('email');

      const u = await db.user.findUniqueOrThrow({
        where: { email: e },
        include: { systemAccesses: true },
      });
      expect(u).toMatchObject({
        name: 'Pessoa Aceite',
        role: 'GERENTE_RESERVAS',
        unit: 'LIV',
        status: 'ACTIVE',
        createdVia: 'invite_password',
        emailVerifiedAt: null,
        cpf: null,
      });
      expect(bcrypt.getRounds(u.password!)).toBe(12);
      expect(u.systemAccesses.map((s) => s.systemKey).sort()).toEqual([
        'analytics',
        'cms',
      ]);
      expect(u.systemAccesses.every((s) => s.grantedById === admin.id)).toBe(
        true,
      );
      const conv = await db.invitation.findUniqueOrThrow({
        where: { id: inv.body.id },
      });
      expect(conv).toMatchObject({
        acceptedUserId: u.id,
        acceptedMethod: 'password',
      });

      await login(e).expect(200);
      // Uso único: o mesmo link de novo é recusado.
      expect((await aceitar(inv.body.token).expect(400)).body.message).toBe(
        CONVITE_INVALIDO,
      );
      expect(await db.user.count({ where: { email: e } })).toBe(1);
    });

    it('link vencido ou revogado → recusa, sem criar ninguém', async () => {
      const e1 = email('vencido');
      const i1 = await convidar({ email: e1 }).expect(201);
      await db.invitation.update({
        where: { id: i1.body.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await aceitar(i1.body.token).expect(400);

      const e2 = email('revogado');
      const i2 = await convidar({ email: e2 }).expect(201);
      await comoAdmin(http().delete(`/api/invitations/${i2.body.id}`)).expect(
        200,
      );
      await aceitar(i2.body.token).expect(400);

      await aceitar('token-que-nao-existe-' + 'x'.repeat(20)).expect(400);
      expect(await db.user.count({ where: { email: { in: [e1, e2] } } })).toBe(
        0,
      );
    });

    it('senha curta ou com cara de hash → 400, e o convite continua pendente', async () => {
      const inv = await convidar({ email: email('senha') }).expect(201);
      await aceitar(inv.body.token, 'curta12').expect(400);
      const pareceHash = bcrypt.hashSync('qualquer', 4);
      expect(
        (await aceitar(inv.body.token, pareceHash).expect(400)).body.code,
      ).toBe('PASSWORD_LOOKS_LIKE_HASH');
      await check(inv.body.token).expect(200);
    });

    it('convite com systems [] → a pessoa nasce sem nenhum acesso (login no Analytics → 401)', async () => {
      const e = email('semacesso');
      const inv = await convidar({ email: e, systems: [] }).expect(201);
      await aceitar(inv.body.token).expect(201);
      const u = await db.user.findUniqueOrThrow({
        where: { email: e },
        include: { systemAccesses: true },
      });
      expect(u.systemAccesses).toHaveLength(0);
      await login(e).expect(401);
    });

    it('7. depois do aceite, um convite novo para o mesmo e-mail → 409 EMAIL_IN_USE (nunca duplica)', async () => {
      const e = email('duplica');
      const inv = await convidar({ email: e }).expect(201);
      await aceitar(inv.body.token).expect(201);
      expect((await convidar({ email: e }).expect(409)).body.code).toBe(
        'EMAIL_IN_USE',
      );
      expect(await db.user.count({ where: { email: e } })).toBe(1);
    });
  });

  describe('12e. convite que nunca expira', () => {
    it('continua de uso único e revogável', async () => {
      const a = await convidar({
        email: email('eterno'),
        validity: 'never',
        neverReason: 'Teste',
      }).expect(201);
      await aceitar(a.body.token).expect(201);
      await aceitar(a.body.token).expect(400);

      const b = await convidar({
        email: email('eterno'),
        validity: 'never',
        neverReason: 'Teste',
      }).expect(201);
      await comoAdmin(http().delete(`/api/invitations/${b.body.id}`)).expect(
        200,
      );
      await aceitar(b.body.token).expect(400);
    });

    it('aparece no aviso de pendente há mais de 30 dias; e marcado se quem convidou foi inativado', async () => {
      const outro = await db.user.create({
        data: {
          email: email('convidador'),
          role: 'ADMIN',
          unit: 'LHG',
        },
      });
      const quem = { id: outro.id, role: 'ADMIN', unit: 'LHG' };
      const inv = await convidar(
        { email: email('antigo'), validity: 'never', neverReason: 'Teste' },
        quem,
      ).expect(201);
      await db.invitation.update({
        where: { id: inv.body.id },
        data: { createdAt: new Date(Date.now() - 31 * DIA) },
      });
      await db.user.update({
        where: { id: outro.id },
        data: { status: 'INACTIVE' },
      });

      const lista = await comoAdmin(http().get('/api/invitations')).expect(200);
      const item = lista.body.find((i: any) => i.id === inv.body.id);
      expect(item).toMatchObject({
        status: 'pending',
        pendingOver30Days: true,
        inviterInactive: true,
        expiresAt: null,
      });
      expect(item.ageDays).toBeGreaterThanOrEqual(31);
    });
  });
});

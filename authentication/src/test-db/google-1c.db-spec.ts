// 1c-C4: login com Google (state + nonce + PKCE), vínculo sem duplicar,
// criação só com convite e as recusas da seção 2.3, no banco migrado de
// verdade. O Google é FALSO (só a troca do code e a validação do id_token);
// as regras são as reais. Numeração = testes obrigatórios da etapa 1c.
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
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import { AccessService } from '../access/access.service';
import { LoginLockService } from '../access/login-lock.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GoogleController } from '../google/google.controller';
import { GoogleSettings } from '../google/google.config';
import {
  AuthorizationParams,
  GoogleClaims,
  GoogleIdentityProvider,
} from '../google/google-identity.provider';
import { GoogleLoginService } from '../google/google-login.service';
import {
  InvitationAcceptController,
  InvitationsController,
} from '../invitations/invitations.controller';
import { InvitationsService } from '../invitations/invitations.service';
import { OidcLogoutService } from '../oidc/oidc-logout.service';
import { PrismaService } from '../prisma/prisma.service';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';

const SECRET = 'segredo-de-teste-local';
const SENHA = 'senha-de-teste-123';
const POS_LOGIN = 'https://front.exemplo.invalid/apos-google';

/** Google falso: guarda o nonce pedido e devolve as claims de cada code. */
class GoogleFalso extends GoogleIdentityProvider {
  claims = new Map<string, Partial<GoogleClaims>>();
  ultimoNonce = '';
  authorizationUrl(_s: GoogleSettings, p: AuthorizationParams) {
    this.ultimoNonce = p.nonce;
    return `https://accounts.google.test/auth?state=${p.state}&code_challenge=${p.codeChallenge}`;
  }
  async exchangeCode(_s: GoogleSettings, code: string): Promise<GoogleClaims> {
    const c = this.claims.get(code);
    if (!c) throw new Error('code desconhecido');
    return {
      email_verified: true,
      nonce: this.ultimoNonce,
      ...c,
    } as GoogleClaims;
  }
}

describe('1c-C4: login com Google', () => {
  let url: string;
  let app: INestApplication;
  let db: ReturnType<typeof cliente>;
  let admin: { id: number; role: string; unit: string };
  const falso = new GoogleFalso();
  let seq = 0;
  const sub = () =>
    `google-sub-${++seq}-${crypto.randomBytes(3).toString('hex')}`;

  beforeAll(async () => {
    url = novoSchema('tc4');
    expect(migrar(url).ok).toBe(true);
    Object.assign(process.env, {
      SUPABASE_URL_USERS: url,
      GOOGLE_OAUTH_CLIENT_ID:
        '1234567890-abcdefghij.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'segredo-de-teste-do-google',
      GOOGLE_OAUTH_REDIRECT_URI:
        'https://auth.exemplo.invalid/auth/api/google/callback',
      GOOGLE_POST_LOGIN_REDIRECT: POS_LOGIN,
      GOOGLE_WORKSPACE_DOMAINS: 'rede.example,filial.example=rede.example',
    });

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
          load: [() => ({ JWT_SECRET: SECRET })],
        }),
        JwtModule.register({ secret: SECRET }),
      ],
      controllers: [
        AuthController,
        InvitationAcceptController,
        InvitationsController,
        GoogleController,
      ],
      providers: [
        AuthService,
        AccessService,
        LoginLockService,
        OidcLogoutService,
        InvitationsService,
        GoogleLoginService,
        PrismaService,
        { provide: GoogleIdentityProvider, useValue: falso },
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

    const a = await pessoa('admin@rede.example', {
      role: 'ADMIN',
      unit: 'LHG',
    });
    admin = { id: a.id, role: 'ADMIN', unit: 'LHG' };
  });

  afterAll(async () => {
    for (const k of [
      'GOOGLE_OAUTH_CLIENT_ID',
      'GOOGLE_OAUTH_CLIENT_SECRET',
      'GOOGLE_OAUTH_REDIRECT_URI',
      'GOOGLE_POST_LOGIN_REDIRECT',
      'GOOGLE_WORKSPACE_DOMAINS',
    ]) {
      delete process.env[k];
    }
    await app?.close();
    await apagarSchema(url);
  });

  /** Pessoa com acesso ao Analytics e senha. */
  async function pessoa(
    email: string,
    o: Partial<{
      role: string;
      unit: string;
      googleSub: string;
      googleAllowed: boolean;
      status: 'ACTIVE' | 'INACTIVE';
    }> = {},
  ) {
    return db.user.create({
      data: {
        email,
        password: bcrypt.hashSync(SENHA, 4),
        role: (o.role ?? 'GERENTE_GERAL') as any,
        unit: (o.unit ?? 'TOUT') as any,
        status: o.status ?? 'ACTIVE',
        googleAllowed: o.googleAllowed ?? true,
        ...(o.googleSub && {
          googleSub: o.googleSub,
          googleLinkedAt: new Date(),
        }),
        systemAccesses: { create: { systemKey: 'analytics' } },
      },
    });
  }

  const http = () => request(app.getHttpServer());
  const cookies = (res: request.Response) =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookieHeader = (res: request.Response) =>
    cookies(res)
      .map((c) => c.split(';')[0])
      .join('; ');

  /**
   * Um login com Google de ponta a ponta: start (ou aceite do convite) →
   * callback com o code. Devolve o erro (ou null) e quem entrou.
   */
  async function google(
    claims: Partial<GoogleClaims>,
    o: {
      convite?: string;
      nonce?: string;
      state?: string;
      semCookie?: boolean;
    } = {},
  ) {
    let inicio: request.Response;
    let destino: string;
    if (o.convite) {
      inicio = await http()
        .post('/api/invitations/accept/google')
        .send({ token: o.convite })
        .expect(200);
      destino = inicio.body.url;
    } else {
      inicio = await http().get('/api/google/start').expect(302);
      destino = inicio.headers.location;
    }
    const state = o.state ?? new URL(destino).searchParams.get('state')!;
    const code = crypto.randomBytes(8).toString('hex');
    falso.claims.set(code, { ...claims, ...(o.nonce && { nonce: o.nonce }) });

    const cb = await http()
      .get(
        `/api/google/callback?code=${code}&state=${encodeURIComponent(state)}`,
      )
      .set('Cookie', o.semCookie ? '' : cookieHeader(inicio))
      .expect(302);
    const volta = new URL(cb.headers.location);
    expect(volta.origin + volta.pathname).toBe(POS_LOGIN);
    const access = cookies(cb).find((c) => c.startsWith('access_token='));
    const id = access
      ? (jwt.verify(access.split(';')[0].split('=')[1], SECRET) as any).id
      : null;
    return { erro: volta.searchParams.get('google_error'), id, cb };
  }

  const convidar = (corpo: Record<string, unknown>) =>
    http()
      .post('/api/invitations')
      .set('x-test-user', JSON.stringify(admin))
      .send({ systems: [], validity: '7', ...corpo })
      .expect(201);
  const contar = (email: string) => db.user.count({ where: { email } });

  describe('fluxo e segurança', () => {
    it('start: redirect para o Google com state e PKCE; o cookie de estado é httpOnly', async () => {
      const res = await http().get('/api/google/start').expect(302);
      const u = new URL(res.headers.location);
      expect(u.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(u.searchParams.get('code_challenge')).toMatch(
        /^[A-Za-z0-9_-]{43}$/,
      );
      const c = cookies(res).find((x) => x.startsWith('g_oauth='))!;
      expect(c).toMatch(/HttpOnly/i);
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    });

    it('state diferente, cookie ausente ou nonce diferente → recusa, sem sessão', async () => {
      const s = sub();
      await pessoa('seg@rede.example', { googleSub: s });
      const c = { sub: s, email: 'seg@rede.example', hd: 'rede.example' };
      expect((await google(c, { state: 'outro-state' })).erro).toBe('state');
      expect((await google(c, { semCookie: true })).erro).toBe('state');
      const r = await google(c, { nonce: 'nonce-forjado' });
      expect(r.erro).toBe('google');
      expect(r.id).toBeNull();
    });

    it('Google desligado (variável faltando) → disabled; a senha continua', async () => {
      const antes = process.env.GOOGLE_OAUTH_CLIENT_ID;
      process.env.GOOGLE_OAUTH_CLIENT_ID = 'invalido';
      try {
        const res = await http().get('/api/google/start').expect(302);
        expect(
          new URL(res.headers.location).searchParams.get('google_error'),
        ).toBe('disabled');
        await http()
          .post('/api/login')
          .send({ email: 'admin@rede.example', password: SENHA })
          .expect(200);
      } finally {
        process.env.GOOGLE_OAUTH_CLIENT_ID = antes;
      }
    });
  });

  describe('quem já existe', () => {
    it('3. googleSub já vinculado → a mesma pessoa, com o mesmo cookie de sessão', async () => {
      const s = sub();
      const u = await pessoa('vinculada@rede.example', { googleSub: s });
      const r = await google({
        sub: s,
        email: 'vinculada@rede.example',
        hd: 'rede.example',
      });
      expect(r.erro).toBeNull();
      expect(r.id).toBe(u.id);
      expect(cookies(r.cb).some((c) => c.startsWith('refresh_token='))).toBe(
        true,
      );
    });

    it('4. 1ª vez com o e-mail PRINCIPAL de quem existe → vincula à MESMA pessoa, sem convite; depois senha e Google levam ao mesmo usuário', async () => {
      const u = await pessoa('existe@filial.example');
      const s = sub();
      const r = await google({
        sub: s,
        email: 'existe@filial.example',
        hd: 'rede.example',
      });
      expect(r.erro).toBeNull();
      expect(r.id).toBe(u.id);
      const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(depois.googleSub).toBe(s);
      expect(depois.emailVerifiedAt).toBeInstanceOf(Date);
      expect(depois.publicId).toBe(u.publicId);

      const senha = await http()
        .post('/api/login')
        .send({ email: 'existe@filial.example', password: SENHA })
        .expect(200);
      expect(senha.body.user.id).toBe(u.id);
      expect(
        (
          await google({
            sub: s,
            email: 'existe@filial.example',
            hd: 'rede.example',
          })
        ).id,
      ).toBe(u.id);
      expect(await contar('existe@filial.example')).toBe(1);
    });

    it('4. e-mail SECUNDÁRIO verificado → vincula à mesma pessoa', async () => {
      const u = await pessoa('principal4@rede.example');
      await db.userEmail.create({
        data: {
          userId: u.id,
          email: 'pessoal4@gmail.com',
          verifiedAt: new Date(),
        },
      });
      const r = await google({ sub: sub(), email: 'pessoal4@gmail.com' });
      expect(r.erro).toBeNull();
      expect(r.id).toBe(u.id);
      expect(await contar('pessoal4@gmail.com')).toBe(0);
    });
  });

  describe('5. e-mail novo COM convite', () => {
    it('cria a pessoa com as flags do convite, createdVia=invite_google, convite aceito; o 2º login não cria outra', async () => {
      const inv = await convidar({
        email: 'novo5@gmail.com',
        systems: ['analytics', 'cms'],
        role: 'GERENTE_RESERVAS',
        unit: 'LIV',
      });
      const s = sub();
      const r = await google({
        sub: s,
        email: 'novo5@gmail.com',
        name: 'Pessoa do Google',
      });
      expect(r.erro).toBeNull();
      const u = await db.user.findUniqueOrThrow({
        where: { email: 'novo5@gmail.com' },
        include: { systemAccesses: true },
      });
      expect(r.id).toBe(u.id);
      expect(u).toMatchObject({
        createdVia: 'invite_google',
        googleSub: s,
        password: null,
        cpf: null,
        role: 'GERENTE_RESERVAS',
        unit: 'LIV',
        name: 'Pessoa do Google',
      });
      expect(u.emailVerifiedAt).toBeInstanceOf(Date);
      expect(u.systemAccesses.map((a) => a.systemKey).sort()).toEqual([
        'analytics',
        'cms',
      ]);
      const conv = await db.invitation.findUniqueOrThrow({
        where: { id: inv.body.id },
      });
      expect(conv).toMatchObject({
        acceptedMethod: 'google',
        acceptedUserId: u.id,
      });
      const ev = await db.auditEvent.findMany({
        where: { targetUserId: u.id },
      });
      expect(ev.map((e) => e.action)).toEqual(
        expect.arrayContaining([
          'user.created_via_google',
          'access.granted',
          'login.google',
        ]),
      );

      expect((await google({ sub: s, email: 'novo5@gmail.com' })).id).toBe(
        u.id,
      );
      expect(await contar('novo5@gmail.com')).toBe(1);
    });

    it('convite SEM flags → a pessoa nasce sem acesso; o Analytics recusa (no_access)', async () => {
      await convidar({ email: 'semflag5@gmail.com', systems: [] });
      const r = await google({ sub: sub(), email: 'semflag5@gmail.com' });
      expect(r.erro).toBe('no_access');
      expect(r.id).toBeNull();
      const u = await db.user.findUniqueOrThrow({
        where: { email: 'semflag5@gmail.com' },
        include: { systemAccesses: true },
      });
      expect(u.systemAccesses).toHaveLength(0);
    });
  });

  describe('6. recusas — SEM criar e SEM vincular', () => {
    it('e-mail novo SEM convite (inclusive de domínio da rede) → no_invite; auditoria só com o domínio', async () => {
      const r = await google({
        sub: sub(),
        email: 'semconvite@rede.example',
        hd: 'rede.example',
      });
      expect(r.erro).toBe('no_invite');
      expect(await contar('semconvite@rede.example')).toBe(0);
      const [ev] = await db.auditEvent.findMany({
        where: { action: 'google.no_invite' },
        orderBy: { id: 'desc' },
        take: 1,
      });
      expect(ev.metadata).toEqual({ domain: 'rede.example' });
    });

    it('convite vencido, revogado ou já aceito → no_invite', async () => {
      const v = await convidar({ email: 'vencido6@gmail.com' });
      await db.invitation.update({
        where: { id: v.body.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (await google({ sub: sub(), email: 'vencido6@gmail.com' })).erro,
      ).toBe('no_invite');

      const rv = await convidar({ email: 'revogado6@gmail.com' });
      await http()
        .delete(`/api/invitations/${rv.body.id}`)
        .set('x-test-user', JSON.stringify(admin))
        .expect(200);
      expect(
        (await google({ sub: sub(), email: 'revogado6@gmail.com' })).erro,
      ).toBe('no_invite');
      expect(await contar('vencido6@gmail.com')).toBe(0);
      expect(await contar('revogado6@gmail.com')).toBe(0);
    });

    it('email_verified=false → email_unverified', async () => {
      await convidar({ email: 'naoverif6@gmail.com' });
      const r = await google({
        sub: sub(),
        email: 'naoverif6@gmail.com',
        email_verified: false,
      });
      expect(r.erro).toBe('email_unverified');
      expect(await contar('naoverif6@gmail.com')).toBe(0);
    });

    it('domínio Workspace sem hd ou com hd diferente → hd (mesmo para quem existe: não vincula)', async () => {
      const u = await pessoa('hd6@rede.example');
      expect(
        (await google({ sub: sub(), email: 'hd6@rede.example' })).erro,
      ).toBe('hd');
      expect(
        (
          await google({
            sub: sub(),
            email: 'hd6@rede.example',
            hd: 'outra.example',
          })
        ).erro,
      ).toBe('hd');
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: u.id } })).googleSub,
      ).toBeNull();
    });

    it('pessoa INACTIVE → inactive (o Google nunca reativa)', async () => {
      const u = await pessoa('inativa6@rede.example', { status: 'INACTIVE' });
      expect(
        (
          await google({
            sub: sub(),
            email: 'inativa6@rede.example',
            hd: 'rede.example',
          })
        ).erro,
      ).toBe('inactive');
      const depois = await db.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(depois).toMatchObject({ status: 'INACTIVE', googleSub: null });
    });

    it('pessoa com OUTRO googleSub → link_conflict, auditado', async () => {
      const u = await pessoa('conflito6@rede.example', { googleSub: sub() });
      const r = await google({
        sub: sub(),
        email: 'conflito6@rede.example',
        hd: 'rede.example',
      });
      expect(r.erro).toBe('link_conflict');
      expect(
        await db.auditEvent.count({
          where: { action: 'google.denied.link_conflict', targetUserId: u.id },
        }),
      ).toBe(1);
    });

    it('e-mail que é secundário NÃO verificado de alguém → email_unverified_conflict', async () => {
      const u = await pessoa('dono6@rede.example');
      await db.userEmail.create({
        data: { userId: u.id, email: 'naover6@gmail.com' },
      });
      const r = await google({ sub: sub(), email: 'naover6@gmail.com' });
      expect(r.erro).toBe('email_unverified_conflict');
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: u.id } })).googleSub,
      ).toBeNull();
    });

    it('pessoa com googleAllowed=false → not_allowed (só senha)', async () => {
      const u = await pessoa('sosenha6@gmail.com', { googleAllowed: false });
      expect(
        (await google({ sub: sub(), email: 'sosenha6@gmail.com' })).erro,
      ).toBe('not_allowed');
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: u.id } })).googleSub,
      ).toBeNull();
    });

    it('domínio fora do Workspace e que não é gmail → domain', async () => {
      await convidar({ email: 'fora6@getan.example' });
      expect(
        (await google({ sub: sub(), email: 'fora6@getan.example' })).erro,
      ).toBe('domain');
      expect(await contar('fora6@getan.example')).toBe(0);
    });
  });

  describe('12c. aceite pelo Google, pelo link do convite', () => {
    it('e-mail do Google ≠ e-mail do convite → recusa sem criar nada (o convite continua pendente)', async () => {
      const inv = await convidar({ email: 'convidado12c@gmail.com' });
      const r = await google(
        { sub: sub(), email: 'outro12c@gmail.com' },
        { convite: inv.body.token },
      );
      expect(r.erro).toBe('invite_email_mismatch');
      expect(await contar('outro12c@gmail.com')).toBe(0);
      expect(await contar('convidado12c@gmail.com')).toBe(0);
      const conv = await db.invitation.findUniqueOrThrow({
        where: { id: inv.body.id },
      });
      expect(conv.acceptedAt).toBeNull();
    });

    it('domínio Workspace sem hd → hd; getan (fora do Workspace) → domain', async () => {
      const a = await convidar({ email: 'semhd12c@rede.example' });
      expect(
        (
          await google(
            { sub: sub(), email: 'semhd12c@rede.example' },
            { convite: a.body.token },
          )
        ).erro,
      ).toBe('hd');
      const b = await convidar({ email: 'getan12c@getan.example' });
      expect(
        (
          await google(
            { sub: sub(), email: 'getan12c@getan.example' },
            { convite: b.body.token },
          )
        ).erro,
      ).toBe('domain');
    });

    it('gmail com email_verified → cria pelo link; um link inválido → 400 já no início', async () => {
      const inv = await convidar({
        email: 'link12c@gmail.com',
        systems: ['analytics'],
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
      });
      const r = await google(
        { sub: sub(), email: 'link12c@gmail.com' },
        { convite: inv.body.token },
      );
      expect(r.erro).toBeNull();
      expect(await contar('link12c@gmail.com')).toBe(1);
      // O mesmo link de novo: o convite já foi usado.
      await http()
        .post('/api/invitations/accept/google')
        .send({ token: inv.body.token })
        .expect(400);
    });
  });

  describe('12d e 7. o outro método leva à MESMA pessoa; nunca duplica', () => {
    it('aceite por SENHA → depois o Google vincula à mesma pessoa', async () => {
      const inv = await convidar({
        email: 'senha12d@gmail.com',
        systems: ['analytics'],
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
      });
      await http()
        .post('/api/invitations/accept/password')
        .send({ token: inv.body.token, password: SENHA })
        .expect(201);
      const u = await db.user.findUniqueOrThrow({
        where: { email: 'senha12d@gmail.com' },
      });
      const s = sub();
      const r = await google({ sub: s, email: 'senha12d@gmail.com' });
      expect(r.id).toBe(u.id);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: u.id } })).googleSub,
      ).toBe(s);
    });

    it('aceite pelo GOOGLE → Google de novo, senha e convite usado: sempre UM só usuário', async () => {
      const inv = await convidar({
        email: 'google12d@gmail.com',
        systems: ['analytics'],
        role: 'GERENTE_GERAL',
        unit: 'TOUT',
      });
      const s = sub();
      const r1 = await google(
        { sub: s, email: 'google12d@gmail.com' },
        { convite: inv.body.token },
      );
      const r2 = await google({ sub: s, email: 'google12d@gmail.com' });
      expect(r2.id).toBe(r1.id);
      await http()
        .post('/api/invitations/accept/password')
        .send({ token: inv.body.token, password: SENHA })
        .expect(400);
      // Convite para um e-mail que já tem dono → 409.
      await http()
        .post('/api/invitations')
        .set('x-test-user', JSON.stringify(admin))
        .send({ email: 'google12d@gmail.com', systems: [], validity: '7' })
        .expect(409);
      expect(await contar('google12d@gmail.com')).toBe(1);
    });
  });
});

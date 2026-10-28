// 1c-C2: catálogo do launcher + GET /api/me/systems, no banco migrado de
// verdade. JWT simulado pelo cabeçalho x-test-user.
// Numeração = testes obrigatórios da especificação da etapa 1c.
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { LauncherService } from '../access/launcher.service';
import { MeController } from '../access/me.controller';
import { PrismaService } from '../prisma/prisma.service';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';

describe('1c-C2: catálogo do launcher e GET /api/me/systems', () => {
  let url: string;
  let app: INestApplication;
  let db: ReturnType<typeof cliente>;
  let seq = 0;

  beforeAll(async () => {
    url = novoSchema('tc2');
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
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [MeController],
      providers: [
        LauncherService,
        PrismaService,
        { provide: APP_GUARD, useValue: jwtSimulado },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = moduleRef.get(PrismaService).prismaOnline;

    // URLs de TESTE (fictícias), só neste banco descartável.
    await db.system.update({
      where: { key: 'analytics' },
      data: { launchUrl: 'https://analytics.exemplo.invalid/auth/hub/login' },
    });
    await db.system.update({
      where: { key: 'cms' },
      data: { launchUrl: 'https://cms.exemplo.invalid/auth/hub/login' },
    });
    await db.system.update({
      where: { key: 'rm' },
      data: { launchUrl: 'https://rm.exemplo.invalid/auth/hub/login' },
    });
    await db.system.update({
      where: { key: 'supplies' },
      data: {
        launchUrl: 'https://supplies.exemplo.invalid/auth/hub/login',
        active: false,
      },
    });
  });

  afterAll(async () => {
    delete process.env.HUB_BASE_URL;
    delete process.env.INVITE_LINK_BASE_URL;
    await app?.close();
    await apagarSchema(url);
  });

  async function pessoa(
    systems: string[],
    o: { revogados?: string[]; status?: 'ACTIVE' | 'INACTIVE' } = {},
  ) {
    const u = await db.user.create({
      data: {
        email: `launcher${++seq}@example.invalid`,
        status: o.status ?? 'ACTIVE',
      },
    });
    for (const systemKey of systems) {
      await db.systemAccess.create({ data: { userId: u.id, systemKey } });
    }
    for (const systemKey of o.revogados ?? []) {
      await db.systemAccess.create({
        data: { userId: u.id, systemKey, revokedAt: new Date() },
      });
    }
    return u;
  }
  const meusSistemas = (id: number) =>
    request(app.getHttpServer())
      .get('/api/me/systems')
      .set('x-test-user', JSON.stringify({ id }));

  it('o catálogo tem os nomes, textos, ícones e a ordem do launcher', async () => {
    const cat = await db.system.findMany({ orderBy: { order: 'asc' } });
    expect(cat.map((s) => [s.key, s.name, s.icon, s.order])).toEqual([
      ['analytics', 'LHG Analytics', 'chart', 1],
      ['rm', 'LHG RM', 'tag', 2],
      ['supplies', 'LHG Supplies', 'box', 3],
      ['cms', 'LHG CMS', 'layout', 4],
      ['chat-lhg', 'Chat LHG', 'chat', 5],
      ['helpdesk', 'Help Desk', 'lifebuoy', 6],
    ]);
    expect(cat.every((s) => !!s.description)).toBe(true);
  });

  it('o banco recusa launchUrl que não seja https ou que traga credenciais', async () => {
    for (const ruim of [
      'http://cms.exemplo.invalid/',
      'javascript:alert(1)',
      'https://usuario:senha@cms.exemplo.invalid/',
    ]) {
      await expect(
        db.system.update({
          where: { key: 'helpdesk' },
          data: { launchUrl: ruim },
        }),
      ).rejects.toThrow();
    }
  });

  it('11. devolve só as flags ATIVAS, do catálogo ATIVO, com URL segura, na ordem', async () => {
    delete process.env.HUB_BASE_URL;
    const u = await pessoa(
      ['cms', 'analytics', 'supplies', 'helpdesk', 'chat-lhg'],
      {
        revogados: ['rm'],
      },
    );
    const res = await meusSistemas(u.id).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    // supplies: catálogo inativo; helpdesk: sem URL; rm: flag revogada;
    // chat-lhg: sem o endereço do HUB configurado.
    expect(res.body).toEqual([
      {
        key: 'analytics',
        name: 'LHG Analytics',
        description: 'Indicadores e relatórios das unidades',
        launchUrl: 'https://analytics.exemplo.invalid/auth/hub/login',
        icon: 'chart',
        order: 1,
      },
      {
        key: 'cms',
        name: 'LHG CMS',
        description: 'Páginas e campanhas das marcas',
        launchUrl: 'https://cms.exemplo.invalid/auth/hub/login',
        icon: 'layout',
        order: 4,
      },
    ]);
  });

  it('11. Chat LHG: URL absoluta do HUB quando HUB_BASE_URL (ou INVITE_LINK_BASE_URL) existe', async () => {
    const u = await pessoa(['chat-lhg']);
    delete process.env.HUB_BASE_URL;
    process.env.INVITE_LINK_BASE_URL = 'https://hub.exemplo.invalid/convite';
    let res = await meusSistemas(u.id).expect(200);
    expect(res.body.map((s: any) => s.launchUrl)).toEqual([
      'https://hub.exemplo.invalid/ir/chat-lhg',
    ]);

    process.env.HUB_BASE_URL = 'https://hub2.exemplo.invalid';
    res = await meusSistemas(u.id).expect(200);
    expect(res.body[0].launchUrl).toBe(
      'https://hub2.exemplo.invalid/ir/chat-lhg',
    );

    // Endereço do HUB inseguro (http) = sem URL = fora da lista.
    process.env.HUB_BASE_URL = 'http://hub.exemplo.invalid';
    delete process.env.INVITE_LINK_BASE_URL;
    res = await meusSistemas(u.id).expect(200);
    expect(res.body).toEqual([]);
    delete process.env.HUB_BASE_URL;
  });

  it('11. quem só tem flags sem URL (ou nenhuma flag) recebe []', async () => {
    const semUrl = await pessoa(['helpdesk']);
    await meusSistemas(semUrl.id).expect(200, []);
    const nenhuma = await pessoa([]);
    await meusSistemas(nenhuma.id).expect(200, []);
  });

  it('pessoa INATIVA → 401', async () => {
    const u = await pessoa(['cms'], { status: 'INACTIVE' });
    await meusSistemas(u.id).expect(401);
  });
});

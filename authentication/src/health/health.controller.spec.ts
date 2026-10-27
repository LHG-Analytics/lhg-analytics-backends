import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

// Limite reduzido só para o teste (em produção: 100 req/min por IP).
const LIMITE = 3;

async function criarApp(queryRaw: jest.Mock): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: LIMITE }])],
    controllers: [HealthController],
    providers: [
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      {
        provide: PrismaService,
        useValue: { prismaOnline: { $queryRaw: queryRaw } },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('Health do authentication', () => {
  describe('rate limit', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await criarApp(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
    });
    afterAll(() => app.close());

    it('liveness /api/health NÃO sofre throttle', async () => {
      for (let i = 0; i < LIMITE * 4; i++) {
        await request(app.getHttpServer()).get('/api/health').expect(200);
      }
    });

    it('readiness /api/health/ready recebe 429 depois do limite', async () => {
      for (let i = 0; i < LIMITE; i++) {
        await request(app.getHttpServer()).get('/api/health/ready').expect(200);
      }
      await request(app.getHttpServer()).get('/api/health/ready').expect(429);
    });
  });

  describe('banco de usuários fora do ar', () => {
    let app: INestApplication;
    const queryRaw = jest.fn().mockRejectedValue(new Error('conexão recusada'));
    beforeAll(async () => {
      app = await criarApp(queryRaw);
    });
    afterAll(() => app.close());

    it('liveness continua 200 e não consulta o banco', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('readiness responde 503 sem detalhe interno', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health/ready')
        .expect(503);
      expect(res.body).toEqual({ status: 'unavailable' });
      expect(JSON.stringify(res.body)).not.toMatch(/conexão|recusada/);
    });
  });
});

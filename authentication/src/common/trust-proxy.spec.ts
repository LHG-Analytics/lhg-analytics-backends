import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import * as request from 'supertest';
import { HealthController } from '../health/health.controller';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_TRUST_PROXY_HOPS,
  applyTrustProxy,
  resolveTrustProxyHops,
} from './trust-proxy';

describe('resolveTrustProxyHops', () => {
  it('padrão do Render = 3 (borda + balanceador + proxy local)', () => {
    expect(DEFAULT_TRUST_PROXY_HOPS).toBe(3);
    expect(resolveTrustProxyHops(undefined)).toBe(3);
    expect(resolveTrustProxyHops('')).toBe(3);
  });

  it('aceita um inteiro >= 0 de TRUST_PROXY_HOPS', () => {
    expect(resolveTrustProxyHops('2')).toBe(2);
    expect(resolveTrustProxyHops('0')).toBe(0);
  });

  it('nunca vira "true": valores inválidos caem no padrão', () => {
    for (const v of ['true', 'abc', '-1', '1.5']) {
      expect(resolveTrustProxyHops(v)).toBe(3);
    }
  });
});

// Simula o caminho do Render até o Nest. O supertest conecta de 127.0.0.1,
// que faz o papel do proxy local; o X-Forwarded-For chega como a borda e o
// balanceador o deixam: "<cliente>, <borda>, <balanceador>".
const BORDA = '10.0.0.5';
const BALANCEADOR = '10.0.0.9';
const xff = (...cadeia: string[]) => [...cadeia, BORDA, BALANCEADOR].join(', ');
const LIMITE = 2;

describe('rate limit por IP real (trust proxy = 3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: LIMITE }])],
      controllers: [HealthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: PrismaService,
          useValue: {
            prismaOnline: { $queryRaw: jest.fn().mockResolvedValue([]) },
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    applyTrustProxy(app, DEFAULT_TRUST_PROXY_HOPS);
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  const ready = (cadeia: string) =>
    request(app.getHttpServer())
      .get('/api/health/ready')
      .set('X-Forwarded-For', cadeia);

  it('dois IPs distintos têm baldes separados', async () => {
    for (let i = 0; i < LIMITE; i++) {
      await ready(xff('198.51.100.1')).expect(200);
    }
    await ready(xff('198.51.100.1')).expect(429);
    // Outro cliente não é afetado pelo balde do primeiro.
    await ready(xff('198.51.100.2')).expect(200);
  });

  it('X-Forwarded-For forjado pelo cliente não muda o balde', async () => {
    // O cliente 198.51.100.1 (já no limite) manda um IP inventado; a borda
    // anexa o IP real dele à direita. O IP forjado precisa ser ignorado.
    await ready(xff('203.0.113.20', '198.51.100.1')).expect(429);
    await ready(xff('203.0.113.30', '203.0.113.31', '198.51.100.1')).expect(
      429,
    );
  });
});

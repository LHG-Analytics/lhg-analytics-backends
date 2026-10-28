import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserUnit } from '@prisma/client';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UnitsGuard } from '../auth/guards/units.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Validação de unidade/cargo no POST e no PATCH /users (sem banco: o service
// é mockado e os guards liberados; aqui só importa o ValidationPipe).
describe('POST/PATCH /users: unidades válidas = enum do Prisma', () => {
  let app: INestApplication;
  const create = jest.fn((dto) =>
    Promise.resolve({ user: { id: 1, ...dto }, legacyDefault: false }),
  );
  const update = jest.fn((id, dto) => Promise.resolve({ id, ...dto }));

  beforeAll(async () => {
    const liberado = { canActivate: () => true };
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: { create, update } }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(liberado)
      .overrideGuard(RolesGuard)
      .useValue(liberado)
      .overrideGuard(UnitsGuard)
      .useValue(liberado)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    // Mesmo pipe do main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  const novo = (unit: string, role = 'GERENTE_GERAL') =>
    request(app.getHttpServer()).post('/api/users').send({
      name: 'Pessoa Fictícia',
      email: 'ficticia@example.invalid',
      password: 'senha-de-teste-123',
      cpf: '90000000191',
      unit,
      role,
    });

  it.each(['GETAN_VERA_CRUZ', 'GETAN_GRID'])(
    'POST com %s → não dá 400',
    async (unit) => {
      const res = await novo(unit);
      expect(res.status).toBe(201);
      expect(res.body.unit).toBe(unit);
    },
  );

  it('POST com unidade inexistente → 400', async () => {
    const res = await novo('UNIDADE_INEXISTENTE');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain('unit');
  });

  it('POST com cargo inexistente → 400', async () => {
    expect((await novo('LHG', 'CARGO_INEXISTENTE')).status).toBe(400);
  });

  it('toda unidade do schema é aceita (não diverge de novo)', async () => {
    for (const unit of Object.values(UserUnit)) {
      expect((await novo(unit)).status).toBe(201);
    }
  });

  it('PATCH também valida pelo enum', async () => {
    const patch = (unit: string) =>
      request(app.getHttpServer()).patch('/api/users/1').send({ unit });
    expect((await patch('GETAN_GRID')).status).toBe(200);
    expect((await patch('GETAN_VERA_CRUZ')).status).toBe(200);
    expect((await patch('UNIDADE_INEXISTENTE')).status).toBe(400);
  });
});

// Painel TV: GET /painel/mes e /painel/historico, servidor → servidor, com
// token de serviço (o Render guarda só o SHA-256). No banco migrado de
// verdade, com o app montado como o main.ts; o lhg-api é um servidor FALSO
// que confere o JWT interno (ADMIN/LHG) e devolve a Visão Geral e as Reservas.
// Token e chaves de TESTE gerados aqui, na hora.
import { INestApplication } from '@nestjs/common';
import * as crypto from 'crypto';
import * as http from 'http';
import * as jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import { JWK } from 'jose';
import * as request from 'supertest';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import { JWT_TESTE, subirComoMain } from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const jwk = (kid: string) =>
  ({
    ...crypto
      .generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ format: 'jwk' }),
    kid,
  }) as JWK & { kid: string };
const segredo = () => crypto.randomBytes(32).toString('hex');
const TOKEN = crypto.randomBytes(32).toString('base64url');
const HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');

describe('Painel TV (/painel/mes e /painel/historico)', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let falso: http.Server;
  const chamadas: { caminho: string; inicio: string; fim: string }[] = [];
  const falhar = new Set<string>();

  const get = (caminho: string, token: string | null = TOKEN) => {
    let r = request(srv).get(caminho);
    if (token) r = r.set('Authorization', `Bearer ${token}`);
    return r;
  };

  beforeAll(async () => {
    url = novoSchema('tpainel');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.oidcClient.create({
      data: {
        clientId: 'hub',
        name: 'HUB',
        redirectUris: ['https://hub.exemplo.invalid/cb'],
      },
    });
    falso = http.createServer((req, res) => {
      const u = new URL(req.url!, 'http://x');
      let p: any;
      try {
        p = jwt.verify(
          String(req.headers.authorization ?? '').replace(/^Bearer /, ''),
          JWT_TESTE,
        );
      } catch {
        return void res.writeHead(401).end();
      }
      if (p.unit !== 'LHG' || p.role !== 'ADMIN')
        return void res.writeHead(403).end();
      const m =
        /^\/([a-z_]+)\/api\/(Company\/kpis|Bookings\/bookings)\/date-range$/.exec(
          u.pathname,
        );
      if (!m) return void res.writeHead(404).end();
      if (falhar.has(m[1])) return void res.writeHead(400).end();
      chamadas.push({
        caminho: `${m[1]}:${m[2]}`,
        inicio: u.searchParams.get('startDate')!,
        fim: u.searchParams.get('endDate')!,
      });
      const corpo =
        m[2] === 'Company/kpis'
          ? {
              TotalResult: {
                totalAllValue: 1000.5,
                totalAllRentalsApartments: 30,
              },
              Clientes: [{ cpf: '00000000000' }],
            }
          : {
              BigNumbers: [
                { currentDate: { totalAllValue: 200.25, totalAllBookings: 7 } },
              ],
            };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(corpo));
    });
    await new Promise<void>((ok) => falso.listen(0, '127.0.0.1', ok));
    Object.assign(process.env, {
      OIDC_ISSUER: ISSUER,
      OIDC_JWKS: JSON.stringify({ keys: [jwk('k1')] }),
      OIDC_COOKIE_KEYS: [segredo(), segredo()].join(','),
      OIDC_CLIENT_SECRET_HUB: segredo(),
      PAINEL_TV_TOKEN_SHA256: HASH,
      LHG_API_INTERNAL_URL: `http://127.0.0.1:${(falso.address() as AddressInfo).port}`,
    });
    ({ app } = await subirComoMain());
    srv = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise((ok) => falso?.close(ok));
    for (const k of [
      'OIDC_ISSUER',
      'OIDC_JWKS',
      'OIDC_COOKIE_KEYS',
      'OIDC_CLIENT_SECRET_HUB',
      'PAINEL_TV_TOKEN_SHA256',
      'LHG_API_INTERNAL_URL',
    ]) {
      delete process.env[k];
    }
    await db.$disconnect();
    await apagarSchema(url);
  });

  it('sem token, token errado ou com Origin de navegador → recusado; POST → 405', async () => {
    expect((await get('/painel/mes?ano=2026&mes=1', null)).status).toBe(401);
    expect((await get('/painel/mes?ano=2026&mes=1', TOKEN + 'x')).status).toBe(
      401,
    );
    expect(
      (
        await get('/painel/mes?ano=2026&mes=1').set(
          'Origin',
          'https://x.invalid',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(srv)
          .post('/painel/mes')
          .set('Authorization', `Bearer ${TOKEN}`)
      ).status,
    ).toBe(405);
    expect(chamadas).toHaveLength(0);
  });

  it('mês corrente: as 12 unidades com os 4 números (Visão Geral + Reservas), do dia 1 até hoje; a 2ª consulta vem do cache; auditado', async () => {
    const hoje = new Date();
    const ano = hoje.getUTCFullYear();
    const mes = hoje.getUTCMonth() + 1;
    // logo depois da virada do mês (antes das 06:00 de SP) o mês comercial ainda é o anterior
    const r = await get(`/painel/mes?ano=${ano}&mes=${mes}`);
    if (r.status === 400) return; // janela da virada do mês: coberto pelo teste do mês fechado
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.unidades).toHaveLength(12);
    expect(r.body.pendentes).toEqual([]);
    expect(r.body.unidades[0]).toMatchObject({
      moeda: 'BRL',
      faturamento: 1000.5,
      faturamentoReservas: 200.25,
      locacoes: 30,
      reservas: 7,
    });
    expect(r.body.unidades.map((u: any) => u.slug)).toContain('liv');
    expect(JSON.stringify(r.body)).not.toContain('00000000000');
    expect(
      chamadas.find((c) => c.caminho === 'liv:Company/kpis')?.inicio,
    ).toMatch(/^01\//);
    const antes = chamadas.length;
    expect((await get(`/painel/mes?ano=${ano}&mes=${mes}`)).status).toBe(200);
    expect(chamadas.length).toBe(antes);
    const ev = await db.auditEvent.findMany({
      where: { action: 'painel.consulta' },
    });
    expect(ev.length).toBeGreaterThanOrEqual(2);
    expect(ev[0].metadata).toMatchObject({
      rota: 'mes',
      unidades: 12,
      pendentes: 0,
    });
  });

  it('mês futuro ou parâmetros inválidos → 400', async () => {
    expect((await get('/painel/mes?ano=2099&mes=1')).status).toBe(400);
    expect((await get('/painel/mes?ano=2026&mes=13')).status).toBe(400);
    expect((await get('/painel/mes?ano=abc&mes=1')).status).toBe(400);
    expect((await get('/painel/historico?meses=0')).status).toBe(400);
    expect((await get('/painel/historico?meses=99')).status).toBe(400);
  });

  it('histórico: N meses FECHADOS (do 1º ao último dia), cada um com as 12 unidades e os 4 números', async () => {
    const r = await get('/painel/historico?meses=2');
    expect(r.status).toBe(200);
    expect(r.body.meses).toHaveLength(2);
    expect(r.body.pendentes).toBe(0);
    for (const m of r.body.meses) {
      expect(m.unidades).toHaveLength(12);
      expect(m.unidades[0]).toEqual({
        slug: expect.any(String),
        moeda: 'BRL',
        faturamento: 1000.5,
        faturamentoReservas: 200.25,
        locacoes: 30,
        reservas: 7,
      });
      const ultimo = new Date(Date.UTC(m.ano, m.mes, 0)).getUTCDate();
      const c = chamadas.find(
        (x) =>
          x.caminho === 'tout:Company/kpis' &&
          x.inicio === `01/${String(m.mes).padStart(2, '0')}/${m.ano}`,
      );
      expect(c?.fim).toBe(
        `${ultimo}/${String(m.mes).padStart(2, '0')}/${m.ano}`,
      );
    }
  });

  it('uma unidade com erro no lhg-api fica de fora e aparece em pendentes; as outras seguem', async () => {
    falhar.add('getan_grid');
    try {
      const r = await get('/painel/historico?meses=4');
      expect(r.status).toBe(200);
      const ultimo = r.body.meses[0];
      expect(ultimo.unidades.map((u: any) => u.slug)).not.toContain(
        'getan_grid',
      );
      expect(ultimo.unidades).toHaveLength(11);
      expect(r.body.pendentes).toBeGreaterThan(0);
    } finally {
      falhar.delete('getan_grid');
    }
  });

  it('rate limit: acima de 30 chamadas/min → 429', async () => {
    let ultima: any;
    for (let i = 0; i < 31; i++)
      ultima = await get('/painel/historico?meses=1');
    expect(ultima.status).toBe(429);
  });
});

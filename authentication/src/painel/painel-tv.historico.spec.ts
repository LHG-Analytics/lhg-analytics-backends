// Histórico do Painel TV: ordem (mais novo primeiro), meses fechados no store
// (Redis), pré-aquecimento, falha registrada por ~10 min e pendentesDetalhe.
// lhg-api falso (fetch injetado) e store em memória fazendo papel do Redis.
import * as crypto from 'crypto';
import * as express from 'express';
import * as request from 'supertest';
import { ItemPainelGuardado, PainelStore } from './painel-cache';
import {
  PAINEL_FALHA_MS,
  UnidadePainel,
  chaveDoMes,
  rotaDoPainelTv,
} from './painel-tv';

const TOKEN = crypto.randomBytes(32).toString('base64url');
const HASH = crypto.createHash('sha256').update(TOKEN).digest('hex');
const UNIDADES = 12;

/** Store que faz papel do Redis (sobrevive a uma "nova instância" do painel). */
function storeFalso() {
  const m = new Map<string, ItemPainelGuardado<UnidadePainel>>();
  const s: PainelStore<UnidadePainel> = {
    ler: async (chaves) =>
      new Map(chaves.filter((c) => m.has(c)).map((c) => [c, m.get(c)!])),
    gravar: async (c, item) => void m.set(c, item),
  };
  return { m, s };
}

/** lhg-api falso: registra as chamadas; falhas configuráveis por unidade. */
function lhgApiFalso() {
  const chamadas: { slug: string; inicio: string }[] = [];
  const erro = new Map<string, 'banco' | 'timeout'>();
  const buscar = (async (url: string) => {
    const u = new URL(url);
    const slug = u.pathname.split('/')[1];
    const company = u.pathname.includes('Company');
    if (company)
      chamadas.push({ slug, inicio: u.searchParams.get('startDate')! });
    const e = erro.get(slug);
    if (e === 'timeout')
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    if (e === 'banco')
      return new Response(
        JSON.stringify({
          message:
            'Failed to fetch Company KPIs: timeout exceeded when trying to connect',
        }),
        { status: 400 },
      );
    return new Response(
      JSON.stringify(
        company
          ? { TotalResult: { totalAllValue: 10, totalAllRentalsApartments: 1 } }
          : {
              BigNumbers: [
                { currentDate: { totalAllValue: 5, totalAllBookings: 1 } },
              ],
            },
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  return { chamadas, erro, buscar };
}

describe('Painel TV — histórico', () => {
  let agora = new Date('2026-11-18T15:00:00Z');
  const montar = (o: Partial<Parameters<typeof rotaDoPainelTv>[0]> = {}) => {
    const app = express();
    app.use(
      '/painel',
      rotaDoPainelTv({
        access: { audit: async () => undefined } as any,
        tokenSha256: HASH,
        jwtSecret: 'segredo-de-teste',
        lhgApiUrl: 'http://lhg-api.invalid',
        agora: () => agora,
        esperaMs: 5_000,
        ...o,
      }),
    );
    return app;
  };
  const get = (app: express.Express, caminho: string) =>
    request(app).get(caminho).set('Authorization', `Bearer ${TOKEN}`);
  const flush = () => new Promise((ok) => setTimeout(ok, 50));

  beforeEach(() => {
    agora = new Date('2026-11-18T15:00:00Z');
  });

  it('calcula do mês MAIS NOVO para o mais antigo (a saída segue do mais antigo ao mais novo)', async () => {
    const api = lhgApiFalso();
    const r = await get(
      montar({ buscar: api.buscar }),
      '/painel/historico?meses=3',
    );
    expect(r.status).toBe(200);
    expect(r.body.pendentes).toBe(0);
    expect(r.body.pendentesDetalhe).toEqual([]);
    expect(r.body.meses.map((m: any) => m.mes)).toEqual([8, 9, 10]);
    // as primeiras chamadas são de outubro (o mês mais recente)
    expect(
      api.chamadas.slice(0, UNIDADES).every((c) => c.inicio === '01/10/2026'),
    ).toBe(true);
    expect(api.chamadas.at(-1)!.inicio).toBe('01/08/2026');
  });

  it('meses fechados vão para o store (Redis): depois de um "deploy", o histórico sai completo SEM chamar o lhg-api', async () => {
    const { m, s } = storeFalso();
    const api1 = lhgApiFalso();
    await get(
      montar({ buscar: api1.buscar, store: s }),
      '/painel/historico?meses=2',
    );
    expect(m.size).toBe(2 * UNIDADES);
    expect([...m.keys()]).toContain(chaveDoMes('tout', 2026, 10));
    expect(m.get(chaveDoMes('tout', 2026, 10))!.fim).toBe('31/10/2026');

    const api2 = lhgApiFalso(); // nova instância: memória vazia, mesmo store
    const r = await get(
      montar({ buscar: api2.buscar, store: s }),
      '/painel/historico?meses=2',
    );
    expect(r.body.pendentes).toBe(0);
    expect(r.body.meses[1].unidades).toHaveLength(UNIDADES);
    expect(api2.chamadas).toHaveLength(0);
  });

  it('o mês corrente NÃO vai para o store; um valor guardado de outro período (parcial) não é usado', async () => {
    const { m, s } = storeFalso();
    const api = lhgApiFalso();
    await get(
      montar({ buscar: api.buscar, store: s }),
      '/painel/mes?ano=2026&mes=11',
    );
    expect(m.size).toBe(0);

    // parcial de outubro guardado (fim 15/10): para o mês fechado tem de recalcular
    m.set(chaveDoMes('tout', 2026, 10), {
      em: agora.getTime(),
      fim: '15/10/2026',
      valor: { slug: 'tout' } as UnidadePainel,
    });
    const api2 = lhgApiFalso();
    await get(
      montar({ buscar: api2.buscar, store: s }),
      '/painel/historico?meses=1',
    );
    expect(api2.chamadas.some((c) => c.slug === 'tout')).toBe(true);
    expect(m.get(chaveDoMes('tout', 2026, 10))!.fim).toBe('31/10/2026');
  });

  it('falha fica registrada por ~10 min com o motivo (banco_inacessivel / timeout) e não volta à fila antes', async () => {
    const api = lhgApiFalso();
    api.erro.set('getan_pq_oeste', 'banco');
    api.erro.set('liv', 'timeout');
    const app = montar({ buscar: api.buscar });
    const r1 = await get(app, '/painel/historico?meses=1');
    expect(r1.body.pendentes).toBe(2);
    expect(r1.body.pendentesDetalhe).toEqual(
      expect.arrayContaining([
        {
          slug: 'getan_pq_oeste',
          ano: 2026,
          mes: 10,
          motivo: 'banco_inacessivel',
        },
        { slug: 'liv', ano: 2026, mes: 10, motivo: 'timeout' },
      ]),
    );
    const antes = api.chamadas.length;
    const r2 = await get(app, '/painel/historico?meses=1');
    expect(r2.body.pendentes).toBe(2);
    expect(api.chamadas.length).toBe(antes); // não voltou à fila

    agora = new Date(agora.getTime() + PAINEL_FALHA_MS + 1000);
    api.erro.clear();
    const r3 = await get(app, '/painel/historico?meses=1');
    expect(r3.body.pendentes).toBe(0);
    expect(api.chamadas.length).toBe(antes + 2);
  });

  it('/mes também traz pendentesDetalhe (e mantém "pendentes" como lista de slugs)', async () => {
    const api = lhgApiFalso();
    api.erro.set('getan_novo_mundo', 'banco');
    const r = await get(
      montar({ buscar: api.buscar }),
      '/painel/mes?ano=2026&mes=11',
    );
    expect(r.body.pendentes).toEqual(['getan_novo_mundo']);
    expect(r.body.pendentesDetalhe).toEqual([
      { slug: 'getan_novo_mundo', motivo: 'banco_inacessivel' },
    ]);
  });

  it('pré-aquecimento: os 3 últimos meses fechados das 12 unidades, mais novo primeiro, gravados no store', async () => {
    const { m, s } = storeFalso();
    const api = lhgApiFalso();
    montar({ buscar: api.buscar, store: s, preaquecerMs: 0 });
    for (let i = 0; i < 40 && m.size < 3 * UNIDADES; i++) await flush();
    expect(m.size).toBe(3 * UNIDADES);
    expect(api.chamadas).toHaveLength(3 * UNIDADES);
    expect(api.chamadas[0].inicio).toBe('01/10/2026');
    expect(api.chamadas.at(-1)!.inicio).toBe('01/08/2026');
  });

  it('sem preaquecerMs não pré-aquece', async () => {
    const api = lhgApiFalso();
    montar({ buscar: api.buscar });
    await flush();
    expect(api.chamadas).toHaveLength(0);
  });

  it('nunca calcula dois meses da MESMA unidade ao mesmo tempo (no máximo 2 cálculos, de unidades diferentes)', async () => {
    // Todas as unidades prontas no store, menos a LIV: só sobram meses dela.
    const { m, s } = storeFalso();
    for (const mes of [8, 9, 10])
      for (const slug of [
        'lush_ipiranga',
        'lush_lapa',
        'tout',
        'andar_de_cima',
        'altana',
        'getan_garavelo',
        'getan_pq_oeste',
        'getan_independencia',
        'getan_novo_mundo',
        'getan_vera_cruz',
        'getan_grid',
      ])
        m.set(chaveDoMes(slug, 2026, mes), {
          em: agora.getTime(),
          fim: `${mes === 9 ? 30 : 31}/${String(mes).padStart(2, '0')}/2026`,
          valor: { slug } as UnidadePainel,
        });
    const api = lhgApiFalso();
    const emVoo = new Map<string, number>();
    let maxUnidade = 0;
    let maxTotal = 0;
    const lento = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const slug = u.pathname.split('/')[1];
      if (!u.pathname.includes('Company')) return api.buscar(url, init);
      emVoo.set(slug, (emVoo.get(slug) ?? 0) + 1);
      maxUnidade = Math.max(maxUnidade, emVoo.get(slug)!);
      maxTotal = Math.max(
        maxTotal,
        [...emVoo.values()].reduce((a, b) => a + b, 0),
      );
      await new Promise((ok) => setTimeout(ok, 40));
      emVoo.set(slug, emVoo.get(slug)! - 1);
      return api.buscar(url, init);
    }) as unknown as typeof fetch;
    const r = await get(
      montar({ buscar: lento, store: s }),
      '/painel/historico?meses=3',
    );
    expect(r.body.pendentes).toBe(0);
    // Só a LIV foi calculada: um mês por vez, do mais novo para o mais antigo.
    expect(api.chamadas.map((c) => `${c.slug} ${c.inicio}`)).toEqual([
      'liv 01/10/2026',
      'liv 01/09/2026',
      'liv 01/08/2026',
    ]);
    expect(maxUnidade).toBe(1);
    expect(maxTotal).toBe(1);
  });

  it('com várias unidades na fila: até 2 cálculos ao mesmo tempo, nunca 2 da mesma unidade', async () => {
    const api = lhgApiFalso();
    const emVoo = new Map<string, number>();
    let maxUnidade = 0;
    let maxTotal = 0;
    const lento = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const slug = u.pathname.split('/')[1];
      if (!u.pathname.includes('Company')) return api.buscar(url, init);
      emVoo.set(slug, (emVoo.get(slug) ?? 0) + 1);
      maxUnidade = Math.max(maxUnidade, emVoo.get(slug)!);
      maxTotal = Math.max(
        maxTotal,
        [...emVoo.values()].reduce((a, b) => a + b, 0),
      );
      await new Promise((ok) => setTimeout(ok, 10));
      emVoo.set(slug, emVoo.get(slug)! - 1);
      return api.buscar(url, init);
    }) as unknown as typeof fetch;
    const r = await get(montar({ buscar: lento }), '/painel/historico?meses=2');
    expect(r.body.pendentes).toBe(0);
    expect(api.chamadas).toHaveLength(2 * UNIDADES);
    expect(maxUnidade).toBe(1);
    expect(maxTotal).toBe(2);
  });

  it('timeout: meses fechados usam o limite maior (timeoutFechadoMs); o mês corrente segue com o de sempre (timeoutMs)', async () => {
    // A LIV demora 300 ms (respeitando o cancelamento, como o fetch real).
    const api = lhgApiFalso();
    const lento = ((url: string, init?: RequestInit) => {
      if (!new URL(url).pathname.startsWith('/liv/'))
        return api.buscar(url, init);
      return new Promise<Response>((ok, falha) => {
        const t = setTimeout(() => ok(api.buscar(url, init)), 300);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          falha(init.signal!.reason);
        });
      });
    }) as unknown as typeof fetch;
    const app = montar({
      buscar: lento,
      timeoutMs: 100,
      timeoutFechadoMs: 1_000,
    });
    const h = await get(app, '/painel/historico?meses=1');
    expect(h.body.pendentes).toBe(0);
    expect(h.body.meses[0].unidades.map((u: any) => u.slug)).toContain('liv');

    const m = await get(app, '/painel/mes?ano=2026&mes=11');
    expect(m.body.pendentesDetalhe).toEqual([
      { slug: 'liv', motivo: 'timeout' },
    ]);
  });
});

// MCP do LHG Analytics (conector do Claude): POST /mcp com o access token do
// login central EMITIDO para o cliente analytics-mcp. No banco migrado de
// verdade, com o app montado como o main.ts; o lhg-api é um servidor FALSO
// local que confere o JWT interno e aplica a regra de unidade do UnitsGuard.
// Chaves e segredos de TESTE gerados aqui, na hora.
import { INestApplication, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as http from 'http';
import * as jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import { JWK } from 'jose';
import * as request from 'supertest';
import { apagarSchema, cliente, migrar, novoSchema } from './db-helpers';
import {
  JWT_TESTE,
  Pote,
  fluxo,
  local,
  pkce,
  subirComoMain,
} from './oidc-harness';

const ISSUER = 'https://hub.exemplo.invalid/auth/oidc';
const MCP_URL = 'https://analytics.exemplo.invalid/auth/mcp';
const CALLBACK_CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const SENHA = 'senha-de-teste-123';
const jwk = (kid: string) =>
  ({
    ...crypto
      .generateKeyPairSync('rsa', { modulusLength: 2048 })
      .privateKey.export({ format: 'jwk' }),
    kid,
  }) as JWK & { kid: string };
const K1 = jwk('chave-mcp');
const segredo = () => crypto.randomBytes(32).toString('hex');
const CLIENTES = {
  'analytics-mcp': { segredo: segredo(), redirect: CALLBACK_CLAUDE },
  hub: { segredo: segredo(), redirect: 'https://hub.exemplo.invalid/cb' },
};

/** Resposta FALSA do lhg-api, com campos que NÃO podem sair do MCP. */
const KPIS = (unidade: string) => ({
  Company: unidade,
  BigNumbers: [
    {
      currentDate: {
        totalAllValue: 1000,
        totalAverageOccupationTime: '02:10:00',
      },
      monthlyForecast: {
        totalAllValueForecast: 3100,
        totalAllRentalsApartmentsForecast: 90,
        totalAllTicketAverageForecast: 34.4,
        totalAllGiroForecast: 2.1,
        totalAllTrevparForecast: 70.5,
      },
    },
  ],
  TotalResult: {
    totalAllRentalsApartments: 30,
    totalAllValue: 1000.5,
    totalAllTicketAverage: 33.35,
    totalGiro: 1.9,
    totalRevpar: 60.1,
    totalTrevpar: 65.2,
    totalAverageOccupationTime: '02:10:00',
    totalOccupancyRate: 41.25,
  },
  DataTableSuiteCategory: [
    {
      LUSH: {
        totalRentalsApartments: 20,
        totalValue: 700.5,
        totalTicketAverage: 35.03,
        giro: 2.1,
        revpar: 70.1,
        trevpar: 75.2,
        averageOccupationTime: '02:00:00',
        occupancyRate: 45.5,
        cliente: 'NOME-QUE-NAO-PODE-SAIR',
        cpf: '00000000000',
      },
    },
    {
      STANDARD: {
        totalRentalsApartments: 10,
        totalValue: 300,
        totalTicketAverage: 30,
        giro: 1.5,
        revpar: 40,
        trevpar: 42,
        averageOccupationTime: '02:30:00',
        occupancyRate: 30.25,
      },
    },
  ],
  DataTableGiroByWeek: [
    {
      LUSH: Object.fromEntries(
        [
          'domingo',
          'segunda-feira',
          'terça-feira',
          'quarta-feira',
          'quinta-feira',
          'sexta-feira',
          'sábado',
        ].map((d, i) => [
          d,
          { giro: i + 0.5, totalGiro: i + 1, telefone: '11999999999' },
        ]),
      ),
    },
    {
      STANDARD: Object.fromEntries(
        [
          'domingo',
          'segunda-feira',
          'terça-feira',
          'quarta-feira',
          'quinta-feira',
          'sexta-feira',
          'sábado',
        ].map((d, i) => [d, { giro: i + 0.25, totalGiro: i + 1 }]),
      ),
    },
  ],
  DataTableRevparByWeek: [
    {
      LUSH: Object.fromEntries(
        [
          'domingo',
          'segunda-feira',
          'terça-feira',
          'quarta-feira',
          'quinta-feira',
          'sexta-feira',
          'sábado',
        ].map((d, i) => [d, { revpar: 10 * i, totalRevpar: 10 * i + 5 }]),
      ),
    },
  ],
  DataTableOccupancyRateByWeek: [
    {
      LUSH: Object.fromEntries(
        [
          'domingo',
          'segunda-feira',
          'terça-feira',
          'quarta-feira',
          'quinta-feira',
          'sexta-feira',
          'sábado',
        ].map((d, i) => [
          d,
          { occupancyRate: 20 + i, totalOccupancyRate: 30 + i },
        ]),
      ),
    },
  ],
  RevenueByDate: [{ x: 1 }],
});

describe('MCP do LHG Analytics (/mcp, conector do Claude)', () => {
  let url: string;
  let db: ReturnType<typeof cliente>;
  let app: INestApplication;
  let srv: any;
  let f: ReturnType<typeof fluxo>;
  let falso: http.Server;
  const chamadasLhgApi: {
    slug: string;
    unit: string;
    inicio: string;
    fim: string;
  }[] = [];
  let n = 0;

  async function pessoa(
    d: { role?: string; unit?: string; flag?: boolean } = {},
  ) {
    return db.user.create({
      data: {
        email: `mcp-${++n}@example.invalid`,
        name: `Pessoa ${n}`,
        password: bcrypt.hashSync(SENHA, 4),
        role: (d.role ?? 'GERENTE_GERAL') as any,
        unit: (d.unit ?? 'TOUT') as any,
        systemAccesses:
          d.flag === false
            ? undefined
            : { create: [{ systemKey: 'analytics' }] },
      },
    });
  }
  const tokenDe = async (email: string) =>
    (await f.entrar(new Pote(), 'analytics-mcp', email, SENHA)).tokens
      .access_token as string;
  const rpc = (token: string | null, corpo: unknown) => {
    let r = request(srv).post('/mcp');
    if (token) r = r.set('Authorization', `Bearer ${token}`);
    return r.send(corpo as object);
  };
  const ferramenta = (token: string, name: string, args: unknown = {}) =>
    rpc(token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    });

  beforeAll(async () => {
    url = novoSchema('tmcp');
    expect(migrar(url).ok).toBe(true);
    process.env.SUPABASE_URL_USERS = url;
    db = cliente(url);
    await db.oidcClient.createMany({
      data: [
        {
          clientId: 'analytics-mcp',
          name: 'LHG Analytics no Claude',
          systemKey: 'analytics',
          redirectUris: [CALLBACK_CLAUDE],
        },
        { clientId: 'hub', name: 'HUB', redirectUris: [CLIENTES.hub.redirect] },
      ],
    });
    // lhg-api FALSO: confere o JWT interno e aplica a regra do UnitsGuard.
    falso = http.createServer((req, res) => {
      const u = new URL(req.url!, 'http://x');
      const m = /^\/([a-z_]+)\/api\/Company\/kpis\/date-range$/.exec(
        u.pathname,
      );
      const tok = String(req.headers.authorization ?? '').replace(
        /^Bearer /,
        '',
      );
      let p: any;
      try {
        p = jwt.verify(tok, JWT_TESTE);
      } catch {
        res.writeHead(401).end();
        return;
      }
      if (!m) return void res.writeHead(404).end();
      if (p.unit !== 'LHG' && p.unit.toLowerCase() !== m[1]) {
        return void res.writeHead(403).end();
      }
      // Altana: consulta "pesada", passa do tempo do MCP (1,5 s no teste).
      if (m[1] === 'altana') {
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(KPIS(m[1])));
        }, 3000);
        return;
      }
      chamadasLhgApi.push({
        slug: m[1],
        unit: p.unit,
        inicio: u.searchParams.get('startDate')!,
        fim: u.searchParams.get('endDate')!,
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(KPIS(m[1])));
    });
    await new Promise<void>((ok) => falso.listen(0, '127.0.0.1', ok));
    Object.assign(process.env, {
      OIDC_ISSUER: ISSUER,
      OIDC_JWKS: JSON.stringify({ keys: [K1] }),
      OIDC_COOKIE_KEYS: [segredo(), segredo()].join(','),
      OIDC_CLIENT_SECRET_ANALYTICS_MCP: CLIENTES['analytics-mcp'].segredo,
      OIDC_CLIENT_SECRET_HUB: CLIENTES.hub.segredo,
      OIDC_MINIMAL_LOGIN_PAGE: 'true',
      ANALYTICS_MCP_URL: MCP_URL,
      LHG_API_INTERNAL_URL: `http://127.0.0.1:${(falso.address() as AddressInfo).port}`,
      MCP_LHG_API_TIMEOUT_MS: '1500',
    });
    ({ app } = await subirComoMain());
    srv = app.getHttpServer();
    f = fluxo(srv, ISSUER, CLIENTES);
  });

  afterAll(async () => {
    await app?.close();
    await new Promise((ok) => falso?.close(ok));
    for (const k of [
      'OIDC_ISSUER',
      'OIDC_JWKS',
      'OIDC_COOKIE_KEYS',
      'OIDC_CLIENT_SECRET_ANALYTICS_MCP',
      'OIDC_CLIENT_SECRET_HUB',
      'OIDC_MINIMAL_LOGIN_PAGE',
      'ANALYTICS_MCP_URL',
      'LHG_API_INTERNAL_URL',
      'MCP_LHG_API_TIMEOUT_MS',
    ]) {
      delete process.env[k];
    }
    await db.$disconnect();
    await apagarSchema(url);
  });

  it('descoberta: sem token → 401 com o ponteiro do protected resource metadata; o metadata aponta o issuer e a URL exata', async () => {
    const r = await rpc(null, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    expect(r.status).toBe(401);
    expect(r.headers['www-authenticate']).toBe(
      `Bearer resource_metadata="${MCP_URL}/.well-known/oauth-protected-resource", scope="openid email profile"`,
    );
    const g = await request(srv).get('/mcp');
    expect(g.status).toBe(401);
    const md = await request(srv).get(
      '/mcp/.well-known/oauth-protected-resource',
    );
    expect(md.status).toBe(200);
    expect(md.body).toMatchObject({
      resource: MCP_URL,
      authorization_servers: [ISSUER],
    });
    // O discovery do provedor anuncia PKCE S256 e client_secret_basic.
    const disc = await request(srv).get(
      '/oidc/.well-known/openid-configuration',
    );
    expect(disc.body.code_challenge_methods_supported).toContain('S256');
    expect(disc.body.token_endpoint_auth_methods_supported).toContain(
      'client_secret_basic',
    );
  });

  it('login do Claude com resource (RFC 8707) no authorize e no token: aceito, e o token resultante abre o MCP', async () => {
    const u = await pessoa();
    const pote = new Pote();
    const p = pkce();
    const a = pote.guardar(
      await request(srv).get('/oidc/auth').query({
        client_id: 'analytics-mcp',
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: CALLBACK_CLAUDE,
        code_challenge: p.challenge,
        code_challenge_method: 'S256',
        state: p.state,
        resource: MCP_URL,
      }),
    );
    expect(a.headers.location).toMatch(/\/interaction\//);
    const uid = f.uidDa(a.headers.location);
    const l = pote.guardar(
      await request(srv)
        .post(`/oidc/interaction/${uid}/login`)
        .set('Cookie', pote.header())
        .type('form')
        .send({ email: u.email, password: SENHA }),
    );
    const fim = await f.ateOCliente(pote, l.headers.location);
    expect(fim.origin + fim.pathname).toBe(CALLBACK_CLAUDE);
    const code = fim.searchParams.get('code')!;
    expect(code).toBeTruthy();
    const t0 = Date.now();
    const t = await f.trocar('analytics-mcp', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: CALLBACK_CLAUDE,
      code_verifier: p.verifier,
      resource: MCP_URL,
    });
    const ms = Date.now() - t0;
    expect(t.status).toBe(200);
    expect(t.body.access_token).toBeTruthy();
    expect(t.body.refresh_token).toBeTruthy();
    expect(ms).toBeLessThan(10_000); // o Claude dá 10 s ao token endpoint
    const init = await rpc(t.body.access_token, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'teste' },
      },
    });
    expect(init.status).toBe(200);
    expect(init.body.result.protocolVersion).toBe('2025-06-18');
    expect(init.body.result.capabilities.tools).toBeDefined();
    // refresh também funciona (o Claude renova antes de vencer)
    const rf = await f.refresh('analytics-mcp', t.body.refresh_token);
    expect(rf.status).toBe(200);
    expect(rf.body.access_token).toBeTruthy();
  });

  it('resource do MCP pedido por OUTRO cliente (hub) ou resource desconhecido → invalid_target, como antes', async () => {
    for (const [clientId, resource] of [
      ['hub', MCP_URL],
      ['analytics-mcp', 'https://outro.exemplo.invalid/api'],
    ] as const) {
      const p = pkce();
      const a = await request(srv).get('/oidc/auth').query({
        client_id: clientId,
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: CLIENTES[clientId].redirect,
        code_challenge: p.challenge,
        code_challenge_method: 'S256',
        state: p.state,
        resource,
      });
      expect(new URL(a.headers.location).searchParams.get('error')).toBe(
        'invalid_target',
      );
    }
  });

  /** Login até o code, SEM trocar (para os casos do /token). */
  async function ateOCodigo(clientId: 'analytics-mcp' | 'hub', email: string) {
    const pote = new Pote();
    const p = pkce();
    const a = await f.autorizar(pote, clientId, p);
    const uid = f.uidDa(a.headers.location);
    const l = pote.guardar(
      await request(srv)
        .post(`/oidc/interaction/${uid}/login`)
        .set('Cookie', pote.header())
        .type('form')
        .send({ email, password: SENHA }),
    );
    const fim = await f.ateOCliente(pote, l.headers.location);
    return { code: fim.searchParams.get('code')!, verifier: p.verifier };
  }

  it('o Claude manda o segredo no CORPO (client_secret_post): aceito SÓ para o analytics-mcp; o hub com segredo no corpo → 401; o log diz o motivo e o método, sem o segredo', async () => {
    const avisos: string[] = [];
    const espiao = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((m: any) => void avisos.push(String(m)));
    const info: string[] = [];
    const espiaoLog = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((m: any) => void info.push(String(m)));
    try {
      const u = await pessoa();
      const c = await ateOCodigo('analytics-mcp', u.email);
      const ok = await request(srv).post('/oidc/token').type('form').send({
        grant_type: 'authorization_code',
        code: c.code,
        redirect_uri: CALLBACK_CLAUDE,
        code_verifier: c.verifier,
        client_id: 'analytics-mcp',
        client_secret: CLIENTES['analytics-mcp'].segredo,
      });
      expect(ok.status).toBe(200);
      expect(ok.body.access_token).toBeTruthy();
      expect(info.join('\n')).toContain(
        'oidc: token emitido client=analytics-mcp metodo=post grant=authorization_code',
      );
      // o hub segue SÓ com Basic
      const h = await pessoa();
      const ch = await ateOCodigo('hub', h.email);
      const nao = await request(srv).post('/oidc/token').type('form').send({
        grant_type: 'authorization_code',
        code: ch.code,
        redirect_uri: CLIENTES.hub.redirect,
        code_verifier: ch.verifier,
        client_id: 'hub',
        client_secret: CLIENTES.hub.segredo,
      });
      expect(nao.status).toBe(401);
      expect(nao.body.error).toBe('invalid_client');
      // segredo errado (Basic): o provedor recusa e o log diz o motivo
      const c2 = await ateOCodigo('analytics-mcp', u.email);
      const errado = await request(srv)
        .post('/oidc/token')
        .auth('analytics-mcp', 'segredo-errado-de-teste')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code: c2.code,
          redirect_uri: CALLBACK_CLAUDE,
          code_verifier: c2.verifier,
        });
      expect(errado.status).toBe(401);
      const log = avisos.join('\n');
      expect(log).toMatch(
        /oidc: token recusado erro=invalid_client descricao="[^"]*" client=analytics-mcp metodo=basic grant=authorization_code/,
      );
      expect(log).not.toContain('segredo-errado-de-teste');
      expect(log).not.toContain(CLIENTES['analytics-mcp'].segredo);
      expect(log).not.toContain(c2.code);
    } finally {
      espiao.mockRestore();
      espiaoLog.mockRestore();
    }
  });

  it('quem não tem a flag analytics não consegue nem o token (o provedor recusa o login do cliente)', async () => {
    const u = await pessoa({ flag: false });
    const r = await f.entrar(new Pote(), 'analytics-mcp', u.email, SENHA);
    expect(r.tokens).toBeNull();
  });

  it('tools/list: só as 3 ferramentas, todas só leitura; notificação → 202', async () => {
    const tok = await tokenDe((await pessoa()).email);
    const r = await rpc(tok, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(r.body.result.tools.map((t: any) => t.name)).toEqual([
      'listar_unidades',
      'visao_geral',
      'comparar_periodos',
      'resumo_por_categoria',
      'giro_por_dia_semana',
    ]);
    for (const t of r.body.result.tools)
      expect(t.annotations.readOnlyHint).toBe(true);
    const nt = await rpc(tok, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(nt.status).toBe(202);
  });

  it('listar_unidades: GERENTE_GERAL vê só a dele; ADMIN/LHG vê todas; GERENTE_OPERACIONAL não vê nenhuma', async () => {
    const g = await tokenDe((await pessoa({ unit: 'TOUT' })).email);
    const rg = await ferramenta(g, 'listar_unidades');
    expect(rg.body.result.structuredContent.unidades).toEqual([
      { slug: 'tout', nome: 'Tout', moeda: 'BRL' },
    ]);
    const a = await tokenDe(
      (await pessoa({ role: 'ADMIN', unit: 'LHG' })).email,
    );
    const ra = await ferramenta(a, 'listar_unidades');
    expect(ra.body.result.structuredContent.unidades).toHaveLength(12);
    // O LIV opera em dólar (os endpoints por unidade não convertem); o resto em reais.
    const moedas = Object.fromEntries(
      ra.body.result.structuredContent.unidades.map((x: any) => [
        x.slug,
        x.moeda,
      ]),
    );
    expect(moedas.liv).toBe('USD');
    expect(moedas.tout).toBe('BRL');
    expect(moedas.altana).toBe('BRL');
    const o = await tokenDe(
      (await pessoa({ role: 'GERENTE_OPERACIONAL', unit: 'TOUT' })).email,
    );
    const ro = await ferramenta(o, 'listar_unidades');
    expect(ro.body.result.structuredContent.unidades).toEqual([]);
  });

  it('visao_geral: só os campos da lista fechada (nada de nome/CPF nem séries); período por datas e por atalho; auditoria sem números', async () => {
    const u = await pessoa({ unit: 'TOUT' });
    const tok = await tokenDe(u.email);
    const r = await ferramenta(tok, 'visao_geral', {
      unidade: 'tout',
      inicio: '2026-10-01',
      fim: '2026-10-31',
    });
    expect(r.body.result.isError).toBeUndefined();
    const d = r.body.result.structuredContent;
    expect(Object.keys(d).sort()).toEqual(
      [
        'faturamento',
        'giro',
        'locacoes',
        'moeda',
        'periodo',
        'previsao_do_mes',
        'revpar',
        'taxa_ocupacao_percentual',
        'tempo_medio_ocupacao',
        'ticket_medio',
        'trevpar',
        'unidade',
      ].sort(),
    );
    expect(d).toMatchObject({
      unidade: 'Tout',
      faturamento: 1000.5,
      locacoes: 30,
    });
    expect(d.periodo).toEqual({ inicio: '01/10/2026', fim: '31/10/2026' });
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain('NOME-QUE-NAO-PODE-SAIR');
    expect(texto).not.toContain('00000000000');
    expect(chamadasLhgApi.at(-1)).toMatchObject({
      slug: 'tout',
      unit: 'TOUT',
      inicio: '01/10/2026',
      fim: '31/10/2026',
    });
    const at = await ferramenta(tok, 'visao_geral', {
      unidade: 'tout',
      periodo: 'ontem',
    });
    expect(at.body.result.structuredContent.periodo.inicio).toBe(
      at.body.result.structuredContent.periodo.fim,
    );
    const [ev] = await db.auditEvent.findMany({
      where: { action: 'mcp.tool', targetUserId: u.id },
      orderBy: { id: 'asc' },
    });
    expect(ev.metadata).toEqual({
      ferramenta: 'visao_geral',
      resultado: 'ok',
      unidade: 'tout',
      inicio: '01/10/2026',
      fim: '31/10/2026',
    });
    expect(JSON.stringify(ev.metadata)).not.toContain('1000.5');
  });

  it('outra unidade, período inválido ou futuro → erro da ferramenta (isError), sem chamar o lhg-api', async () => {
    const tok = await tokenDe((await pessoa({ unit: 'TOUT' })).email);
    const antes = chamadasLhgApi.length;
    for (const args of [
      { unidade: 'liv', periodo: 'ontem' },
      { unidade: 'tout', inicio: '2026-02-30', fim: '2026-03-01' },
      { unidade: 'tout', inicio: '2099-01-01', fim: '2099-01-02' },
      { unidade: 'tout', periodo: 'ano_passado' },
    ]) {
      const r = await ferramenta(tok, 'visao_geral', args);
      expect(r.body.result.isError).toBe(true);
    }
    expect(chamadasLhgApi.length).toBe(antes);
  });

  it('resumo_por_categoria: os KPIs por categoria do MESMO endpoint, em lista fechada, mais o total; outra unidade → erro', async () => {
    const u = await pessoa({ unit: 'TOUT' });
    const tok = await tokenDe(u.email);
    const r = await ferramenta(tok, 'resumo_por_categoria', {
      unidade: 'tout',
      inicio: '2026-10-22',
      fim: '2026-10-31',
    });
    const d = r.body.result.structuredContent;
    expect(d.periodo).toEqual({ inicio: '22/10/2026', fim: '31/10/2026' });
    expect(d.categorias).toEqual([
      {
        categoria: 'LUSH',
        faturamento: 700.5,
        locacoes: 20,
        ticket_medio: 35.03,
        giro: 2.1,
        revpar: 70.1,
        trevpar: 75.2,
        taxa_ocupacao_percentual: 45.5,
        tempo_medio_ocupacao: '02:00:00',
      },
      {
        categoria: 'STANDARD',
        faturamento: 300,
        locacoes: 10,
        ticket_medio: 30,
        giro: 1.5,
        revpar: 40,
        trevpar: 42,
        taxa_ocupacao_percentual: 30.25,
        tempo_medio_ocupacao: '02:30:00',
      },
    ]);
    expect(d.total).toMatchObject({ faturamento: 1000.5, locacoes: 30 });
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain('NOME-QUE-NAO-PODE-SAIR');
    expect(texto).not.toContain('00000000000');
    const outra = await ferramenta(tok, 'resumo_por_categoria', {
      unidade: 'liv',
      periodo: 'ontem',
    });
    expect(outra.body.result.isError).toBe(true);
    const ev = await db.auditEvent.findMany({
      where: { action: 'mcp.tool', targetUserId: u.id },
      orderBy: { id: 'asc' },
    });
    expect(ev[0].metadata).toMatchObject({
      ferramenta: 'resumo_por_categoria',
      resultado: 'ok',
      unidade: 'tout',
    });
  });

  it('giro_por_dia_semana: domingo a sábado com giro, RevPAR e ocupação do dia (os totais da tela) e o giro por categoria; nada fora da lista', async () => {
    const tok = await tokenDe((await pessoa({ unit: 'TOUT' })).email);
    const r = await ferramenta(tok, 'giro_por_dia_semana', {
      unidade: 'tout',
      periodo: 'mes_anterior',
    });
    const d = r.body.result.structuredContent;
    expect(d.dias.map((x: any) => x.dia)).toEqual([
      'domingo',
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
    ]);
    expect(d.dias[5]).toEqual({
      dia: 'sexta-feira',
      giro: 6,
      revpar: 55,
      taxa_ocupacao_percentual: 35,
    });
    expect(d.dias[6]).toMatchObject({ dia: 'sábado', giro: 7 });
    expect(d.giro_por_categoria.map((c: any) => c.categoria)).toEqual([
      'LUSH',
      'STANDARD',
    ]);
    expect(d.giro_por_categoria[1].dias['sábado']).toBe(6.25);
    expect(JSON.stringify(r.body)).not.toContain('11999999999');
  });

  it('consulta pesada (passa do tempo do MCP): mensagem clara para perguntar de novo; o ERRO é auditado com a unidade e o(s) período(s)', async () => {
    const u = await pessoa({ role: 'ADMIN', unit: 'LHG' });
    const tok = await tokenDe(u.email);
    const r = await ferramenta(tok, 'visao_geral', {
      unidade: 'altana',
      inicio: '2026-10-01',
      fim: '2026-10-31',
    });
    expect(r.body.result.isError).toBe(true);
    expect(r.body.result.content[0].text).toBe(
      'consulta pesada em processamento; o resultado fica pronto em 1–2 min, pergunte de novo',
    );
    const c = await ferramenta(tok, 'comparar_periodos', {
      unidade: 'altana',
      periodo_a: { inicio: '2026-09-01', fim: '2026-09-30' },
      periodo_b: { inicio: '2026-10-01', fim: '2026-10-31' },
    });
    expect(c.body.result.isError).toBe(true);
    const ev = await db.auditEvent.findMany({
      where: { action: 'mcp.tool', targetUserId: u.id },
      orderBy: { id: 'asc' },
    });
    expect(ev.map((e) => e.metadata)).toEqual([
      {
        ferramenta: 'visao_geral',
        resultado: 'erro',
        unidade: 'altana',
        inicio: '01/10/2026',
        fim: '31/10/2026',
        motivo: expect.stringContaining('consulta pesada'),
      },
      {
        ferramenta: 'comparar_periodos',
        resultado: 'erro',
        unidade: 'altana',
        inicio_a: '01/09/2026',
        fim_a: '30/09/2026',
        inicio_b: '01/10/2026',
        fim_b: '31/10/2026',
        motivo: expect.stringContaining('consulta pesada'),
      },
    ]);
  });

  it('comparar_periodos: valores de A e B, diferença e variação %', async () => {
    const tok = await tokenDe(
      (await pessoa({ role: 'ADMIN', unit: 'LHG' })).email,
    );
    const r = await ferramenta(tok, 'comparar_periodos', {
      unidade: 'liv',
      periodo_a: { inicio: '2026-09-01', fim: '2026-09-30' },
      periodo_b: { inicio: '2026-10-01', fim: '2026-10-31' },
    });
    const c = r.body.result.structuredContent.comparacao;
    expect(c.faturamento).toEqual({
      a: 1000.5,
      b: 1000.5,
      diferenca: 0,
      variacao_percentual: 0,
    });
    expect(Object.keys(c)).toContain('taxa_ocupacao_percentual');
  });

  it('tirar o acesso no HUB corta na chamada seguinte; token de OUTRO cliente não abre o MCP; Origin de navegador → 403', async () => {
    const u = await pessoa();
    const tok = await tokenDe(u.email);
    expect((await ferramenta(tok, 'listar_unidades')).status).toBe(200);
    await db.systemAccess.updateMany({
      where: { userId: u.id, systemKey: 'analytics' },
      data: { revokedAt: new Date() },
    });
    expect((await ferramenta(tok, 'listar_unidades')).status).toBe(401);
    // token emitido para o 'hub' não serve
    const h = await pessoa();
    const th = (await f.entrar(new Pote(), 'hub', h.email, SENHA)).tokens
      .access_token;
    expect((await ferramenta(th, 'listar_unidades')).status).toBe(401);
    const o = await request(srv)
      .post('/mcp')
      .set('Authorization', `Bearer ${await tokenDe((await pessoa()).email)}`)
      .set('Origin', 'https://atacante.invalid')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(o.status).toBe(403);
  });

  it('rate limit: acima de 60 chamadas/min por pessoa → erro da ferramenta, auditado como limite', async () => {
    const u = await pessoa();
    const tok = await tokenDe(u.email);
    let ultima: any;
    for (let i = 0; i < 61; i++)
      ultima = await ferramenta(tok, 'listar_unidades');
    expect(ultima.body.result.isError).toBe(true);
    expect(
      await db.auditEvent.count({
        where: {
          action: 'mcp.tool',
          targetUserId: u.id,
          metadata: { path: ['resultado'], equals: 'limite' },
        },
      }),
    ).toBe(1);
  });

  it('JSON-RPC: método desconhecido → -32601; corpo inválido → 400', async () => {
    const tok = await tokenDe((await pessoa()).email);
    const r = await rpc(tok, {
      jsonrpc: '2.0',
      id: 9,
      method: 'resources/list',
    });
    expect(r.body.error.code).toBe(-32601);
    expect(
      (await rpc(tok, [{ jsonrpc: '2.0', id: 1, method: 'ping' }])).status,
    ).toBe(400);
    expect(local).toBeDefined();
  });
});

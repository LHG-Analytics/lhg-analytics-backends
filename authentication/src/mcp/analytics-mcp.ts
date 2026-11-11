import { Logger } from '@nestjs/common';
import { PrismaClient, UserStatus } from '@prisma/client';
import { NextFunction, Request, Response, Router, json } from 'express';
import * as jwt from 'jsonwebtoken';
import {
  ANALYTICS,
  ANALYTICS_ACCESS_INCLUDE,
  AccessService,
  analyticsDenial,
  requestContext,
} from '../access/access.service';
import {
  ATALHOS,
  camposDaVisaoGeral,
  camposPorCategoria,
  camposPorDiaDaSemana,
  compararCampos,
  resolverPeriodo,
  unidadesDe,
  type Periodo,
} from './analytics-mcp-dados';

/** Cliente OIDC do conector do Claude (o token TEM de ser dele). */
export const CLIENTE_MCP = 'analytics-mcp';
/** Versões do protocolo MCP aceitas (a 1ª é a preferida). */
export const VERSOES_MCP = ['2025-11-25', '2025-06-18', '2025-03-26'];
/** Chamadas por minuto, por pessoa. */
export const MCP_LIMITE_MIN = 60;

export interface McpDeps {
  provider: any;
  prisma: PrismaClient;
  access: AccessService;
  /** URL pública EXATA do MCP (a que se cadastra no Claude). */
  urlPublica: string;
  /** Issuer do login central (o authorization server do MCP). */
  issuer: string;
  jwtSecret: string;
  /** lhg-api pela rede interna (no Render: http://127.0.0.1:3010). */
  lhgApiUrl: string;
  /** fetch para o lhg-api (os testes trocam). */
  buscar?: typeof fetch;
  agora?: () => Date;
}

type Pessoa = {
  id: number;
  email: string;
  name: string;
  role: string | null;
  unit: string | null;
};

const FERRAMENTAS = [
  {
    name: 'listar_unidades',
    title: 'Listar unidades',
    description:
      'Lista as unidades (motéis) da LHG que você pode consultar, com o identificador (slug) usado nas outras ferramentas.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'visao_geral',
    title: 'Visão Geral da unidade',
    description:
      'KPIs agregados da Visão Geral do LHG Analytics para UMA unidade num período: faturamento, locações, ticket médio, giro, RevPAR, TRevPAR, taxa de ocupação e tempo médio. O dia é o dia comercial (06:00 às 05:59). Use "periodo" (atalho) OU "inicio" e "fim".',
    inputSchema: {
      type: 'object',
      properties: {
        unidade: {
          type: 'string',
          description: 'slug da unidade (veja listar_unidades)',
        },
        periodo: { type: 'string', enum: [...ATALHOS] },
        inicio: { type: 'string', description: 'AAAA-MM-DD ou DD/MM/AAAA' },
        fim: {
          type: 'string',
          description: 'AAAA-MM-DD ou DD/MM/AAAA (inclusivo)',
        },
      },
      required: ['unidade'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'comparar_periodos',
    title: 'Comparar dois períodos',
    description:
      'Compara os KPIs da Visão Geral de UMA unidade entre o período A e o período B (valor de cada um, diferença e variação % de B em relação a A).',
    inputSchema: {
      type: 'object',
      properties: {
        unidade: { type: 'string' },
        periodo_a: {
          type: 'object',
          properties: {
            periodo: { type: 'string', enum: [...ATALHOS] },
            inicio: { type: 'string' },
            fim: { type: 'string' },
          },
          additionalProperties: false,
        },
        periodo_b: {
          type: 'object',
          properties: {
            periodo: { type: 'string', enum: [...ATALHOS] },
            inicio: { type: 'string' },
            fim: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      required: ['unidade', 'periodo_a', 'periodo_b'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'resumo_por_categoria',
    title: 'Resumo por categoria de suíte',
    description:
      'Os KPIs da Visão Geral de UMA unidade num período, quebrados por categoria de suíte (a tela "Resumo por Categoria" do LHG Analytics): faturamento, locações, ticket médio, giro, RevPAR, TRevPAR, taxa de ocupação e tempo médio de cada categoria, mais o total. Use "periodo" (atalho) OU "inicio" e "fim".',
    inputSchema: {
      type: 'object',
      properties: {
        unidade: {
          type: 'string',
          description: 'slug da unidade (veja listar_unidades)',
        },
        periodo: { type: 'string', enum: [...ATALHOS] },
        inicio: { type: 'string', description: 'AAAA-MM-DD ou DD/MM/AAAA' },
        fim: {
          type: 'string',
          description: 'AAAA-MM-DD ou DD/MM/AAAA (inclusivo)',
        },
      },
      required: ['unidade'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'giro_por_dia_semana',
    title: 'Giro por dia da semana',
    description:
      'Giro, RevPAR e taxa de ocupação de UMA unidade por dia da semana (domingo a sábado) no período, como o LHG Analytics mostra, mais o giro de cada categoria por dia. Faturamento e locações por dia da semana não fazem parte desta tela. Use "periodo" (atalho) OU "inicio" e "fim".',
    inputSchema: {
      type: 'object',
      properties: {
        unidade: {
          type: 'string',
          description: 'slug da unidade (veja listar_unidades)',
        },
        periodo: { type: 'string', enum: [...ATALHOS] },
        inicio: { type: 'string', description: 'AAAA-MM-DD ou DD/MM/AAAA' },
        fim: {
          type: 'string',
          description: 'AAAA-MM-DD ou DD/MM/AAAA (inclusivo)',
        },
      },
      required: ['unidade'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

class ErroDeFerramenta extends Error {}

/**
 * MCP do LHG Analytics (Streamable HTTP, só POST com resposta JSON), para o
 * conector do Claude. SÓ LEITURA.
 * - Autenticação: access token do login central EMITIDO PARA o cliente
 *   analytics-mcp (conferido no próprio provedor, sem rede). Sem token ou
 *   inválido → 401 com o ponteiro do protected resource metadata (RFC 9728).
 * - A cada chamada, a pessoa é relida no banco: ATIVA, acesso 'analytics'
 *   não revogado, perfil e unidade (a mesma regra do login do Analytics).
 *   Tirar o acesso no HUB corta na chamada seguinte.
 * - Dados: o lhg-api local, com um JWT interno de 5 min da própria pessoa
 *   (os guards de perfil e unidade dele valem de novo). Só uma lista fechada
 *   de campos agregados volta ao Claude.
 * - Rate limit por pessoa; auditoria mcp.tool sem os números nem tokens.
 */
export function rotaDoMcp(d: McpDeps): Router {
  const logger = new Logger('MCP');
  const r = Router();
  const agora = d.agora ?? (() => new Date());
  const buscar = d.buscar ?? fetch;
  const metadata = `${d.urlPublica}/.well-known/oauth-protected-resource`;
  const contas = new Map<number, { inicio: number; n: number }>();

  // Protected resource metadata (RFC 9728): resource = a URL EXATA do MCP.
  r.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      resource: d.urlPublica,
      authorization_servers: [d.issuer],
      scopes_supported: ['openid', 'email', 'profile'],
      bearer_methods_supported: ['header'],
      resource_name: 'LHG Analytics',
    });
  });

  const naoAutorizado = (res: Response) =>
    res
      .status(401)
      .setHeader(
        'WWW-Authenticate',
        `Bearer resource_metadata="${metadata}", scope="openid email profile"`,
      )
      .json({ error: 'invalid_token' });

  /** Token → pessoa ativa com acesso ao Analytics (ou null). */
  async function pessoaDoToken(req: Request): Promise<Pessoa | null> {
    const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{10,})$/.exec(
      String(req.headers.authorization ?? ''),
    );
    if (!m) return null;
    const at = await d.provider.AccessToken.find(m[1]).catch(() => null);
    // Do cliente analytics-mcp, e para ESTE MCP: aud = a URL do MCP (token
    // pedido com resource, RFC 8707) ou, sem resource, com o escopo openid.
    const aud: string[] = Array.isArray(at?.aud)
      ? at.aud
      : at?.aud
        ? [at.aud]
        : [];
    if (
      !at ||
      at.clientId !== CLIENTE_MCP ||
      (aud.length
        ? !aud.includes(d.urlPublica)
        : !String(at.scope ?? '')
            .split(' ')
            .includes('openid'))
    ) {
      return null;
    }
    const u = await d.prisma.user.findUnique({
      where: { publicId: at.accountId },
      include: ANALYTICS_ACCESS_INCLUDE,
    });
    if (!u || u.status !== UserStatus.ACTIVE || analyticsDenial(u)) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name ?? '',
      role: u.role,
      unit: u.unit,
    };
  }

  function dentroDoLimite(id: number): boolean {
    const t = agora().getTime();
    let c = contas.get(id);
    if (!c || t - c.inicio >= 60_000) {
      c = { inicio: t, n: 0 };
      contas.set(id, c);
    }
    c.n++;
    return c.n <= MCP_LIMITE_MIN;
  }

  /** KPIs da Visão Geral no lhg-api, como a própria pessoa (lista fechada). */
  async function kpis(p: Pessoa, slug: string, per: Periodo) {
    return camposDaVisaoGeral(await kpisBrutos(p, slug, per));
  }

  /**
   * A resposta do endpoint da Visão Geral (a MESMA do dashboard), como a
   * própria pessoa. NUNCA sai crua: cada ferramenta tira dela só a sua lista
   * fechada de campos.
   */
  async function kpisBrutos(p: Pessoa, slug: string, per: Periodo) {
    const token = jwt.sign(
      { id: p.id, email: p.email, name: p.name, unit: p.unit, role: p.role },
      d.jwtSecret,
      { expiresIn: 300 },
    );
    const u = new URL(`${d.lhgApiUrl}/${slug}/api/Company/kpis/date-range`);
    u.searchParams.set('startDate', per.inicio);
    u.searchParams.set('endDate', per.fim);
    const resp = await buscar(u.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(45_000),
    });
    if (resp.status === 403)
      throw new ErroDeFerramenta('sem acesso a esta unidade');
    if (!resp.ok) {
      throw new ErroDeFerramenta(
        `o Analytics não respondeu agora (${resp.status}); tente de novo`,
      );
    }
    return resp.json();
  }

  function unidadePermitida(p: Pessoa, slug: unknown) {
    const u = unidadesDe(p).find((x) => x.slug === slug);
    if (!u) {
      throw new ErroDeFerramenta(
        'unidade desconhecida ou sem acesso; use listar_unidades',
      );
    }
    return u;
  }

  function periodo(args: unknown): Periodo {
    const a = (args && typeof args === 'object' ? args : {}) as Record<
      string,
      unknown
    >;
    const p = resolverPeriodo(a, agora());
    if (typeof p === 'string') throw new ErroDeFerramenta(p);
    return p;
  }

  async function chamar(p: Pessoa, nome: string, args: any) {
    switch (nome) {
      case 'listar_unidades': {
        const us = unidadesDe(p);
        return {
          resumo: { unidades: us.length },
          dados: {
            unidades: us.map((u) => ({ slug: u.slug, nome: u.nome })),
            ...(us.length
              ? {}
              : {
                  aviso: 'seu perfil não tem acesso à Visão Geral do Analytics',
                }),
          },
        };
      }
      case 'visao_geral': {
        const u = unidadePermitida(p, args?.unidade);
        const per = periodo(args);
        const k = await kpis(p, u.slug, per);
        return {
          resumo: { unidade: u.slug, ...per },
          dados: { unidade: u.nome, periodo: per, ...k },
        };
      }
      case 'comparar_periodos': {
        const u = unidadePermitida(p, args?.unidade);
        const pa = periodo(args?.periodo_a);
        const pb = periodo(args?.periodo_b);
        const [ka, kb] = await Promise.all([
          kpis(p, u.slug, pa),
          kpis(p, u.slug, pb),
        ]);
        return {
          resumo: { unidade: u.slug, a: pa, b: pb },
          dados: {
            unidade: u.nome,
            periodo_a: pa,
            periodo_b: pb,
            comparacao: compararCampos(ka, kb),
          },
        };
      }
      case 'resumo_por_categoria': {
        const u = unidadePermitida(p, args?.unidade);
        const per = periodo(args);
        const bruto = await kpisBrutos(p, u.slug, per);
        const geral = camposDaVisaoGeral(bruto);
        return {
          resumo: { unidade: u.slug, ...per },
          dados: {
            unidade: u.nome,
            periodo: per,
            categorias: camposPorCategoria(bruto),
            total: {
              faturamento: geral.faturamento,
              locacoes: geral.locacoes,
              ticket_medio: geral.ticket_medio,
              giro: geral.giro,
              revpar: geral.revpar,
              trevpar: geral.trevpar,
              taxa_ocupacao_percentual: geral.taxa_ocupacao_percentual,
              tempo_medio_ocupacao: geral.tempo_medio_ocupacao,
            },
          },
        };
      }
      case 'giro_por_dia_semana': {
        const u = unidadePermitida(p, args?.unidade);
        const per = periodo(args);
        const bruto = await kpisBrutos(p, u.slug, per);
        return {
          resumo: { unidade: u.slug, ...per },
          dados: {
            unidade: u.nome,
            periodo: per,
            ...camposPorDiaDaSemana(bruto),
          },
        };
      }
      default:
        throw new ErroDeFerramenta(`ferramenta desconhecida: ${nome}`);
    }
  }

  const erroRpc = (id: unknown, code: number, message: string) => ({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  });

  r.post(
    '/',
    async (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store');
      // Navegador de terceiros não fala com o MCP (anti DNS rebinding):
      // o Claude chama de servidor, sem Origin.
      if (req.headers.origin) {
        return res
          .status(403)
          .json(erroRpc(null, -32000, 'Origem não permitida'));
      }
      try {
        const p = await pessoaDoToken(req);
        if (!p) return naoAutorizado(res);
        res.locals.pessoa = p;
        next();
      } catch (e) {
        next(e);
      }
    },
    json({ limit: '64kb' }),
    async (req: Request, res: Response, next: NextFunction) => {
      const p: Pessoa = res.locals.pessoa;
      const m = req.body;
      if (
        !m ||
        typeof m !== 'object' ||
        Array.isArray(m) ||
        m.jsonrpc !== '2.0'
      ) {
        return res
          .status(400)
          .json(erroRpc(null, -32600, 'Requisição inválida'));
      }
      // Notificação (sem id): só confirma.
      if (m.id === undefined) return res.status(202).end();
      try {
        switch (m.method) {
          case 'initialize': {
            const pedida = m.params?.protocolVersion;
            return res.json({
              jsonrpc: '2.0',
              id: m.id,
              result: {
                protocolVersion: VERSOES_MCP.includes(pedida)
                  ? pedida
                  : VERSOES_MCP[0],
                capabilities: { tools: { listChanged: false } },
                serverInfo: {
                  name: 'lhg-analytics',
                  title: 'LHG Analytics',
                  version: '1.0.0',
                },
                instructions:
                  'Dados da Visão Geral do LHG Analytics (só leitura, números agregados). Comece por listar_unidades. Valores em reais (BRL); o dia é o dia comercial (06:00 às 05:59).',
              },
            });
          }
          case 'ping':
            return res.json({ jsonrpc: '2.0', id: m.id, result: {} });
          case 'tools/list':
            return res.json({
              jsonrpc: '2.0',
              id: m.id,
              result: { tools: FERRAMENTAS },
            });
          case 'tools/call': {
            const nome = String(m.params?.name ?? '');
            const args = m.params?.arguments ?? {};
            const auditar = (
              resultado: string,
              extra: Record<string, unknown> = {},
            ) =>
              d.access.audit({
                action: 'mcp.tool',
                actorUserId: p.id,
                targetUserId: p.id,
                systemKey: ANALYTICS,
                metadata: { ferramenta: nome, resultado, ...extra },
                ctx: requestContext(req),
              });
            if (!dentroDoLimite(p.id)) {
              await auditar('limite');
              return res.json({
                jsonrpc: '2.0',
                id: m.id,
                result: {
                  isError: true,
                  content: [
                    {
                      type: 'text',
                      text: 'Muitas consultas em pouco tempo. Tente de novo em 1 minuto.',
                    },
                  ],
                },
              });
            }
            try {
              const { resumo, dados } = await chamar(p, nome, args);
              await auditar('ok', resumo);
              return res.json({
                jsonrpc: '2.0',
                id: m.id,
                result: {
                  content: [{ type: 'text', text: JSON.stringify(dados) }],
                  structuredContent: dados,
                },
              });
            } catch (e) {
              if (!(e instanceof ErroDeFerramenta)) {
                logger.warn(
                  `mcp: falha em ${nome} (${(e as Error)?.name ?? 'erro'})`,
                );
              }
              const texto =
                e instanceof ErroDeFerramenta
                  ? e.message
                  : 'o Analytics não respondeu agora; tente de novo';
              await auditar('erro', {
                unidade:
                  typeof args?.unidade === 'string'
                    ? args.unidade.slice(0, 40)
                    : null,
                motivo: texto.slice(0, 80),
              });
              return res.json({
                jsonrpc: '2.0',
                id: m.id,
                result: {
                  isError: true,
                  content: [{ type: 'text', text: texto }],
                },
              });
            }
          }
          default:
            return res.json(
              erroRpc(m.id, -32601, `Método não suportado: ${m.method}`),
            );
        }
      } catch (e) {
        next(e);
      }
    },
  );

  // Sem SSE: GET e DELETE não são usados (o servidor não guarda sessão).
  r.all('/', (req, res) =>
    req.headers.authorization
      ? res.status(405).setHeader('Allow', 'POST').end()
      : naoAutorizado(res),
  );

  r.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json(erroRpc(null, -32700, 'JSON inválido'));
    }
    if (err?.type === 'entity.too.large') {
      return res
        .status(413)
        .json(erroRpc(null, -32600, 'Requisição grande demais'));
    }
    next(err);
  });

  return r;
}

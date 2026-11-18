import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import * as jwt from 'jsonwebtoken';
import { AccessService, requestContext } from '../access/access.service';
import { clientIp } from '../common/client-ip';
import {
  Moeda,
  UNIDADES,
  hojeComercial,
  moedaDe,
} from '../mcp/analytics-mcp-dados';
import {
  ItemPainelGuardado,
  PainelStore,
  storeSoMemoria,
} from './painel-cache';

/**
 * Dados do Painel TV (lhg-painel-tv), SÓ LEITURA, servidor → servidor:
 * - GET /painel/mes?ano=AAAA&mes=MM: por unidade, o mês até agora (dia
 *   comercial): faturamento, faturamento de reservas, locações e reservas;
 * - GET /painel/historico?meses=15: os mesmos números por mês FECHADO.
 * Por canal (só as reservas daquele canal): e-commerce (site) e Guia de Motéis.
 * Os números vêm dos MESMOS endpoints do dashboard no lhg-api (Visão Geral:
 * Company/kpis/date-range; Reservas: Bookings/bookings/date-range), como uma
 * identidade de serviço ADMIN/LHG com JWT interno de 5 min.
 * Autenticação: token de serviço (Bearer), conferido pelo SHA-256 guardado
 * no Render (PAINEL_TV_TOKEN_SHA256), em tempo constante. O token em si fica
 * só no painel (Vercel). Rate limit por IP e auditoria painel.consulta.
 * Histórico: os meses FECHADOS ficam também no Redis do cache de KPIs (não
 * se perdem no deploy); a fila calcula do mês mais novo para o mais antigo;
 * no boot, pré-aquece os 3 últimos meses fechados; uma falha fica registrada
 * por ~10 min (não volta à fila a cada consulta); 'pendentesDetalhe' diz o
 * motivo de cada pendência.
 */

export interface PainelDeps {
  access: AccessService;
  /** SHA-256 (hex) do token de serviço do painel. */
  tokenSha256: string;
  jwtSecret: string;
  lhgApiUrl: string;
  buscar?: typeof fetch;
  agora?: () => Date;
  /** Espera por chamada ao lhg-api (mês corrente). Padrão: 100 s. */
  timeoutMs?: number;
  /**
   * Espera por chamada ao lhg-api nos MESES FECHADOS (calculados em segundo
   * plano e guardados no Redis; a resposta não espera por eles). Padrão: 300 s
   * — a LIV passa dos 100 s a partir do Render. Variável PAINEL_LHG_API_TIMEOUT_MS.
   */
  timeoutFechadoMs?: number;
  /** Quanto a requisição espera pelos cálculos antes de responder com o que tem. */
  esperaMs?: number;
  /** Onde guardar os meses fechados (Redis); padrão: só memória. */
  store?: PainelStore<UnidadePainel>;
  /** Pré-aquecimento dos últimos meses fechados N ms após subir; null = não pré-aquece. */
  preaquecerMs?: number | null;
}

/** Por que uma unidade/mês ainda não veio. */
export type MotivoPendencia =
  | 'calculando'
  | 'timeout'
  | 'banco_inacessivel'
  | 'erro_lhg_api'
  | 'erro';

export type UnidadePainel = {
  slug: string;
  moeda: Moeda;
  faturamento: number;
  faturamentoReservas: number;
  locacoes: number;
  reservas: number;
  /** E-commerce (site oficial, origem 4): WEBSITE_IMMEDIATE + WEBSITE_SCHEDULED. */
  reservasEcommerce: number;
  receitaEcommerce: number;
  /** Guia de Motéis (origem 3): GUIA_GO + GUIA_SCHEDULED. */
  reservasGuia: number;
  receitaGuia: number;
  atualizadoEm: string;
};

/** Canais do Guia de Motéis (chaves do KpiTableByChannelType do lhg-api). */
const CANAIS_GUIA = ['GUIA_GO', 'GUIA_SCHEDULED'];

/** Cache do mês corrente (o painel consulta a cada 5 min). */
export const PAINEL_CACHE_MES_MS = 5 * 60 * 1000;
/** Mês fechado quase não muda: 24 h. */
export const PAINEL_CACHE_FECHADO_MS = 24 * 60 * 60 * 1000;
/** Chamadas por minuto, por IP. */
export const PAINEL_LIMITE_MIN = 30;
/** Cálculos ao mesmo tempo no lhg-api (não sobrecarregar os bancos). */
const PARALELO = 2;
/** Tempo por chamada ao lhg-api no mês corrente. */
export const PAINEL_TIMEOUT_MS = 100_000;
/** Tempo por chamada ao lhg-api nos meses fechados (segundo plano; a LIV passa de 100 s). */
export const PAINEL_TIMEOUT_FECHADO_MS = 300_000;
/** Uma falha fica registrada por este tempo: a unidade/mês não volta à fila antes. */
export const PAINEL_FALHA_MS = 10 * 60 * 1000;
/** Expiração no Redis de um mês fechado (é recalculado a cada 24 h de uso). */
export const PAINEL_REDIS_TTL_S = 30 * 24 * 60 * 60;
/** Meses fechados pré-aquecidos no boot (o que o painel usa para as metas). */
export const PAINEL_PREAQUECER_MESES = 3;

/** Chave de cache de uma unidade num mês (AAAA-MM). */
export const chaveDoMes = (slug: string, ano: number, mes: number) =>
  `${slug}:${ano}-${String(mes).padStart(2, '0')}`;

/** Erro do lhg-api com o corpo (a mensagem diz se o banco da unidade não respondeu). */
class ErroLhgApi extends Error {
  constructor(
    readonly status: number,
    readonly corpo: string,
  ) {
    super(`lhg-api ${status}`);
  }
}

/** Classifica a falha de um cálculo para 'pendentesDetalhe'. */
export function motivoDaFalha(e: unknown): MotivoPendencia {
  const nome = (e as Error)?.name ?? '';
  if (nome === 'TimeoutError' || nome === 'AbortError') return 'timeout';
  if (e instanceof ErroLhgApi) {
    if (
      /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|timeout exceeded when trying to connect|Connection terminated/i.test(
        e.corpo,
      )
    )
      return 'banco_inacessivel';
    return 'erro_lhg_api';
  }
  return 'erro';
}

const dd = (n: number) => String(n).padStart(2, '0');
const ddmmaaaa = (a: number, m: number, d: number) => `${dd(d)}/${dd(m)}/${a}`;

/** SHA-256 hex de um texto. */
export const sha256hex = (v: string) =>
  crypto.createHash('sha256').update(v, 'utf8').digest('hex');

function mesmoHash(token: string, esperadoHex: string): boolean {
  const a = Buffer.from(sha256hex(token), 'hex');
  const b = Buffer.from(esperadoHex.trim().toLowerCase(), 'hex');
  return (
    a.length === b.length && a.length === 32 && crypto.timingSafeEqual(a, b)
  );
}

/** Período do mês: do dia 1 ao último dia (fechado) ou ao dia comercial de hoje (corrente). */
export function periodoDoMes(
  ano: number,
  mes: number,
  agora: Date,
): { inicio: string; fim: string; corrente: boolean } | null {
  const hoje = hojeComercial(agora);
  const ha = hoje.getUTCFullYear();
  const hm = hoje.getUTCMonth() + 1;
  if (ano > ha || (ano === ha && mes > hm)) return null; // futuro
  const corrente = ano === ha && mes === hm;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return {
    inicio: ddmmaaaa(ano, mes, 1),
    fim: corrente
      ? ddmmaaaa(ha, hm, hoje.getUTCDate())
      : ddmmaaaa(ano, mes, ultimo),
    corrente,
  };
}

/** Os N meses FECHADOS antes do mês comercial corrente (o mais antigo primeiro). */
export function mesesFechados(
  n: number,
  agora: Date,
): { ano: number; mes: number }[] {
  const hoje = hojeComercial(agora);
  const out: { ano: number; mes: number }[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(
      Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1),
    );
    out.push({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });
  }
  return out;
}

const num = (v: unknown) => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/**
 * Reservas e receita SÓ das reservas de cada canal, da resposta de
 * Bookings/bookings/date-range (mesmo período e mesmo filtro por
 * dataatendimento do total de reservas). E-commerce = BigNumbersEcommerce;
 * Guia = GUIA_GO + GUIA_SCHEDULED do KpiTableByChannelType. Canal que a
 * unidade não tem (ex.: site nas Getan) = 0.
 */
export function canaisDasReservas(bookings: any): {
  reservasEcommerce: number;
  receitaEcommerce: number;
  reservasGuia: number;
  receitaGuia: number;
} {
  const e = Array.isArray(bookings?.BigNumbersEcommerce)
    ? (bookings.BigNumbersEcommerce[0]?.currentDate ?? {})
    : {};
  const k = Array.isArray(bookings?.KpiTableByChannelType)
    ? (bookings.KpiTableByChannelType[0] ?? {})
    : {};
  const qtd = k.bookingsTotalRentalsByChannelType ?? {};
  const val = k.bookingsRevenueByChannelType ?? {};
  const soma = (m: Record<string, unknown>) =>
    CANAIS_GUIA.reduce((s, c) => s + num(m[c]), 0);
  return {
    reservasEcommerce: num(e.totalAllBookings),
    receitaEcommerce: num(e.totalAllValue),
    reservasGuia: soma(qtd),
    receitaGuia: Math.round(soma(val) * 100) / 100,
  };
}

export function rotaDoPainelTv(d: PainelDeps): Router {
  const logger = new Logger('PainelTV');
  const r = Router();
  const agora = d.agora ?? (() => new Date());
  const buscar = d.buscar ?? fetch;
  const espera = d.esperaMs ?? 25_000;
  const store = d.store ?? storeSoMemoria<UnidadePainel>();
  const cache = new Map<string, ItemPainelGuardado<UnidadePainel>>();
  const falhas = new Map<string, { em: number; motivo: MotivoPendencia }>();
  const emCurso = new Map<string, Promise<void>>();
  const fila: { slug: string; rodar: () => Promise<void> }[] = [];
  /** Unidades com um cálculo em andamento (no máximo 1 por unidade). */
  const ocupadas = new Set<string>();
  const contas = new Map<string, { inicio: number; n: number }>();

  /**
   * Até PARALELO cálculos ao mesmo tempo, mas NUNCA dois da mesma unidade
   * (dois meses da LIV juntos esgotavam as conexões do lhg-api com o banco
   * dela). Pega o 1º da fila cuja unidade está livre; a ordem da fila (mês
   * mais novo primeiro) é mantida.
   */
  const proximo = () => {
    while (ocupadas.size < PARALELO) {
      const i = fila.findIndex((t) => !ocupadas.has(t.slug));
      if (i < 0) return;
      const [t] = fila.splice(i, 1);
      ocupadas.add(t.slug);
      t.rodar().finally(() => {
        ocupadas.delete(t.slug);
        proximo();
      });
    }
  };

  async function lhgApi(
    caminho: string,
    inicio: string,
    fim: string,
    timeoutMs: number,
  ) {
    const token = jwt.sign(
      {
        id: 0,
        email: 'painel-tv@servico.invalid',
        name: 'Painel TV',
        unit: 'LHG',
        role: 'ADMIN',
      },
      d.jwtSecret,
      { expiresIn: 300 },
    );
    const u = new URL(`${d.lhgApiUrl}${caminho}`);
    u.searchParams.set('startDate', inicio);
    u.searchParams.set('endDate', fim);
    const resp = await buscar(u.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      throw new ErroLhgApi(resp.status, await resp.text().catch(() => ''));
    }
    return resp.json() as Promise<any>;
  }

  /** Os números de UMA unidade num período (os mesmos endpoints do dashboard). */
  async function calcular(
    slug: string,
    inicio: string,
    fim: string,
    fechado: boolean,
  ): Promise<UnidadePainel> {
    // Mês fechado: tempo maior (em segundo plano); mês corrente: o de sempre.
    const limite = fechado
      ? (d.timeoutFechadoMs ?? PAINEL_TIMEOUT_FECHADO_MS)
      : (d.timeoutMs ?? PAINEL_TIMEOUT_MS);
    const [company, bookings] = await Promise.all([
      lhgApi(`/${slug}/api/Company/kpis/date-range`, inicio, fim, limite),
      lhgApi(`/${slug}/api/Bookings/bookings/date-range`, inicio, fim, limite),
    ]);
    const t = company?.TotalResult ?? {};
    const b = Array.isArray(bookings?.BigNumbers)
      ? (bookings.BigNumbers[0]?.currentDate ?? {})
      : {};
    return {
      slug,
      moeda: moedaDe(slug),
      faturamento: num(t.totalAllValue),
      faturamentoReservas: num(b.totalAllValue),
      locacoes: num(t.totalAllRentalsApartments),
      reservas: num(b.totalAllBookings),
      ...canaisDasReservas(bookings),
      atualizadoEm: agora().toISOString(),
    };
  }

  /**
   * Atualiza a chave (uma vez só por chave; fila com PARALELO). Mês fechado
   * calculado vai também para o Redis; a falha fica registrada por ~10 min.
   */
  function atualizar(
    chave: string,
    slug: string,
    inicio: string,
    fim: string,
    fechado: boolean,
  ): Promise<void> {
    const ja = emCurso.get(chave);
    if (ja) return ja;
    const p = new Promise<void>((ok) => {
      fila.push({
        slug,
        rodar: async () => {
          try {
            const item = {
              em: agora().getTime(),
              fim,
              valor: await calcular(slug, inicio, fim, fechado),
            };
            cache.set(chave, item);
            falhas.delete(chave);
            if (fechado) await store.gravar(chave, item, PAINEL_REDIS_TTL_S);
          } catch (e) {
            const motivo = motivoDaFalha(e);
            falhas.set(chave, { em: agora().getTime(), motivo });
            logger.warn(
              `painel: falha em ${slug} ${inicio}–${fim} (${motivo}: ${(e as Error)?.message ?? 'erro'})`,
            );
          } finally {
            emCurso.delete(chave);
            ok();
          }
        },
      });
      proximo();
    });
    emCurso.set(chave, p);
    return p;
  }

  /**
   * Valor para a chave: do cache se ainda vale (mesmo período); senão dispara
   * a atualização (o valor antigo serve enquanto o novo é calculado). Com
   * falha recente, NÃO volta à fila: responde com o motivo.
   */
  function pedir(
    chave: string,
    slug: string,
    inicio: string,
    fim: string,
    validade: number,
    fechado: boolean,
  ): { valor?: UnidadePainel; pendente: Promise<void> | null } {
    const c = cache.get(chave);
    // Mês fechado só aproveita o valor do MESMO período (não um parcial antigo).
    const util = c && (c.fim === fim || !fechado) ? c : undefined;
    if (util && util.fim === fim && agora().getTime() - util.em < validade) {
      return { valor: util.valor, pendente: null };
    }
    const f = falhas.get(chave);
    if (
      f &&
      agora().getTime() - f.em < PAINEL_FALHA_MS &&
      !emCurso.has(chave)
    ) {
      return { valor: util?.valor, pendente: null };
    }
    return {
      valor: util?.valor,
      pendente: atualizar(chave, slug, inicio, fim, fechado),
    };
  }

  /** Traz do Redis (para a memória) os meses fechados que ainda não estão nela. */
  async function hidratar(itens: { chave: string; fim: string }[]) {
    const faltam = itens.filter((i) => cache.get(i.chave)?.fim !== i.fim);
    if (!faltam.length) return;
    const lidos = await store.ler(faltam.map((i) => i.chave));
    for (const i of faltam) {
      const v = lidos.get(i.chave);
      if (v && v.fim === i.fim && v.valor) cache.set(i.chave, v);
    }
  }

  /** Por que a chave ainda não tem valor. */
  const motivo = (chave: string): MotivoPendencia =>
    emCurso.has(chave)
      ? 'calculando'
      : (falhas.get(chave)?.motivo ?? 'calculando');

  /** Espera os cálculos até 'espera' ms (e solta o timer quando terminam antes). */
  const esperar = async (ps: (Promise<void> | null)[]) => {
    let t: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.all(ps.filter(Boolean)),
      new Promise((ok) => (t = setTimeout(ok, espera))),
    ]);
    clearTimeout(t);
  };

  /** Itens (unidade × mês fechado) de uma lista de meses, do MAIS NOVO ao mais antigo. */
  function itensFechados(meses: { ano: number; mes: number }[]) {
    return [...meses]
      .sort((a, b) => b.ano - a.ano || b.mes - a.mes)
      .flatMap(({ ano, mes }) => {
        const per = periodoDoMes(ano, mes, agora())!;
        return UNIDADES.map((u) => ({
          ano,
          mes,
          slug: u.slug,
          chave: chaveDoMes(u.slug, ano, mes),
          inicio: per.inicio,
          fim: per.fim,
        }));
      });
  }

  /** Pré-aquecimento: os últimos meses fechados de todas as unidades, mais novo primeiro. */
  async function preaquecer() {
    const itens = itensFechados(
      mesesFechados(PAINEL_PREAQUECER_MESES, agora()),
    );
    await hidratar(itens);
    let n = 0;
    for (const i of itens) {
      const p = pedir(
        i.chave,
        i.slug,
        i.inicio,
        i.fim,
        PAINEL_CACHE_FECHADO_MS,
        true,
      );
      if (p.pendente) n++;
    }
    logger.log(
      `painel: pré-aquecimento de ${PAINEL_PREAQUECER_MESES} meses fechados — ${itens.length - n} prontos, ${n} na fila`,
    );
  }
  if (d.preaquecerMs != null && d.preaquecerMs >= 0) {
    setTimeout(() => {
      preaquecer().catch((e) =>
        logger.warn(
          `painel: pré-aquecimento falhou (${(e as Error)?.message})`,
        ),
      );
    }, d.preaquecerMs).unref?.();
  }

  // Autenticação, rate limit e cabeçalhos — antes de qualquer cálculo.
  r.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET')
      return res.status(405).setHeader('Allow', 'GET').end();
    if (req.headers.origin)
      return res.status(403).json({ error: 'origem_nao_permitida' });
    const m = /^Bearer\s+(\S{20,})$/.exec(
      String(req.headers.authorization ?? ''),
    );
    if (!m || !mesmoHash(m[1], d.tokenSha256)) {
      return res
        .status(401)
        .setHeader('WWW-Authenticate', 'Bearer')
        .json({ error: 'nao_autorizado' });
    }
    const ip = clientIp(req) ?? 'sem-ip';
    const t = agora().getTime();
    let c = contas.get(ip);
    if (!c || t - c.inicio >= 60_000) {
      c = { inicio: t, n: 0 };
      contas.set(ip, c);
    }
    if (++c.n > PAINEL_LIMITE_MIN) {
      return res
        .status(429)
        .setHeader('Retry-After', '60')
        .json({ error: 'limite' });
    }
    next();
  });

  const auditar = (req: Request, metadata: Record<string, string | number>) =>
    d.access
      .audit({ action: 'painel.consulta', metadata, ctx: requestContext(req) })
      .catch(() => undefined);

  r.get('/mes', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ano = Number(req.query.ano);
      const mes = Number(req.query.mes);
      if (
        !Number.isInteger(ano) ||
        !Number.isInteger(mes) ||
        mes < 1 ||
        mes > 12 ||
        ano < 2020
      ) {
        return res.status(400).json({ error: 'parametros_invalidos' });
      }
      const per = periodoDoMes(ano, mes, agora());
      if (!per) return res.status(400).json({ error: 'mes_futuro' });
      const fechado = !per.corrente;
      const validade = per.corrente
        ? PAINEL_CACHE_MES_MS
        : PAINEL_CACHE_FECHADO_MS;
      // Uma chave por unidade e mês (o fim do mês corrente avança: vale o 'fim' guardado).
      const pedidos = UNIDADES.map((u) => ({
        u,
        chave: chaveDoMes(u.slug, ano, mes),
        fim: per.fim,
      }));
      if (fechado) await hidratar(pedidos);
      let itens = pedidos.map(({ u, chave }) => ({
        u,
        chave,
        ...pedir(chave, u.slug, per.inicio, per.fim, validade, fechado),
      }));
      if (itens.some((i) => !i.valor)) {
        await esperar(itens.filter((i) => !i.valor).map((i) => i.pendente));
        itens = itens.map((i) => {
          const c = cache.get(i.chave);
          return {
            ...i,
            valor: c && (c.fim === per.fim || !fechado) ? c.valor : i.valor,
          };
        });
      }
      const unidades = itens.filter((i) => i.valor).map((i) => i.valor!);
      const faltam = itens.filter((i) => !i.valor);
      const pendentes = faltam.map((i) => i.u.slug);
      const pendentesDetalhe = faltam.map((i) => ({
        slug: i.u.slug,
        motivo: motivo(i.chave),
      }));
      await auditar(req, {
        rota: 'mes',
        ano,
        mes,
        unidades: unidades.length,
        pendentes: pendentes.length,
      });
      return res.json({
        geradoEm: agora().toISOString(),
        unidades,
        pendentes,
        pendentesDetalhe,
      });
    } catch (e) {
      next(e);
    }
  });

  r.get(
    '/historico',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const n = req.query.meses === undefined ? 15 : Number(req.query.meses);
        if (!Number.isInteger(n) || n < 1 || n > 24) {
          return res.status(400).json({ error: 'parametros_invalidos' });
        }
        const meses = mesesFechados(n, agora());
        // Do mais NOVO para o mais antigo: os meses que o painel usa saem primeiro.
        const base = itensFechados(meses);
        await hidratar(base);
        const todos = base.map((i) => ({
          ...i,
          ...pedir(
            i.chave,
            i.slug,
            i.inicio,
            i.fim,
            PAINEL_CACHE_FECHADO_MS,
            true,
          ),
        }));
        const faltando = todos.filter((i) => !i.valor);
        if (faltando.length) await esperar(faltando.map((i) => i.pendente));
        const valorDe = (i: (typeof todos)[number]) => {
          const c = cache.get(i.chave);
          return c && c.fim === i.fim ? c.valor : i.valor;
        };
        // Saída na ordem de sempre (do mais antigo ao mais novo).
        const saida = meses.map(({ ano, mes }) => ({
          ano,
          mes,
          unidades: UNIDADES.map((u) =>
            todos.find(
              (i) => i.ano === ano && i.mes === mes && i.slug === u.slug,
            ),
          )
            .map((i) => (i ? valorDe(i) : undefined))
            .filter((v): v is UnidadePainel => !!v)
            .map(({ atualizadoEm: _a, ...v }) => v),
        }));
        const pendentesDetalhe = todos
          .filter((i) => !valorDe(i))
          .map((i) => ({
            slug: i.slug,
            ano: i.ano,
            mes: i.mes,
            motivo: motivo(i.chave),
          }));
        const pendentes = pendentesDetalhe.length;
        await auditar(req, { rota: 'historico', meses: n, pendentes });
        return res.json({
          geradoEm: agora().toISOString(),
          meses: saida,
          pendentes,
          pendentesDetalhe,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}

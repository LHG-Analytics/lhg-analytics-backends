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

/**
 * Dados do Painel TV (lhg-painel-tv), SÓ LEITURA, servidor → servidor:
 * - GET /painel/mes?ano=AAAA&mes=MM: por unidade, o mês até agora (dia
 *   comercial): faturamento, faturamento de reservas, locações e reservas;
 * - GET /painel/historico?meses=15: os mesmos 4 números por mês FECHADO.
 * Os números vêm dos MESMOS endpoints do dashboard no lhg-api (Visão Geral:
 * Company/kpis/date-range; Reservas: Bookings/bookings/date-range), como uma
 * identidade de serviço ADMIN/LHG com JWT interno de 5 min.
 * Autenticação: token de serviço (Bearer), conferido pelo SHA-256 guardado
 * no Render (PAINEL_TV_TOKEN_SHA256), em tempo constante. O token em si fica
 * só no painel (Vercel). Rate limit por IP e auditoria painel.consulta.
 */

export interface PainelDeps {
  access: AccessService;
  /** SHA-256 (hex) do token de serviço do painel. */
  tokenSha256: string;
  jwtSecret: string;
  lhgApiUrl: string;
  buscar?: typeof fetch;
  agora?: () => Date;
  /** Espera por chamada ao lhg-api. */
  timeoutMs?: number;
  /** Quanto a requisição espera pelos cálculos antes de responder com o que tem. */
  esperaMs?: number;
}

export type UnidadePainel = {
  slug: string;
  moeda: Moeda;
  faturamento: number;
  faturamentoReservas: number;
  locacoes: number;
  reservas: number;
  atualizadoEm: string;
};

/** Cache do mês corrente (o painel consulta a cada 5 min). */
export const PAINEL_CACHE_MES_MS = 5 * 60 * 1000;
/** Mês fechado quase não muda: 24 h. */
export const PAINEL_CACHE_FECHADO_MS = 24 * 60 * 60 * 1000;
/** Chamadas por minuto, por IP. */
export const PAINEL_LIMITE_MIN = 30;
/** Cálculos ao mesmo tempo no lhg-api (não sobrecarregar os bancos). */
const PARALELO = 2;

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

export function rotaDoPainelTv(d: PainelDeps): Router {
  const logger = new Logger('PainelTV');
  const r = Router();
  const agora = d.agora ?? (() => new Date());
  const buscar = d.buscar ?? fetch;
  const espera = d.esperaMs ?? 25_000;
  const cache = new Map<string, { em: number; valor: UnidadePainel }>();
  const emCurso = new Map<string, Promise<void>>();
  const fila: (() => Promise<void>)[] = [];
  let rodando = 0;
  const contas = new Map<string, { inicio: number; n: number }>();

  const proximo = () => {
    while (rodando < PARALELO && fila.length) {
      const t = fila.shift()!;
      rodando++;
      t().finally(() => {
        rodando--;
        proximo();
      });
    }
  };

  async function lhgApi(caminho: string, inicio: string, fim: string) {
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
      signal: AbortSignal.timeout(d.timeoutMs ?? 100_000),
    });
    if (!resp.ok) throw new Error(`lhg-api ${resp.status}`);
    return resp.json() as Promise<any>;
  }

  /** Os 4 números de UMA unidade num período (os mesmos endpoints do dashboard). */
  async function calcular(
    slug: string,
    inicio: string,
    fim: string,
  ): Promise<UnidadePainel> {
    const [company, bookings] = await Promise.all([
      lhgApi(`/${slug}/api/Company/kpis/date-range`, inicio, fim),
      lhgApi(`/${slug}/api/Bookings/bookings/date-range`, inicio, fim),
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
      atualizadoEm: agora().toISOString(),
    };
  }

  /** Atualiza a chave no cache (uma vez só por chave; fila com PARALELO). */
  function atualizar(
    chave: string,
    slug: string,
    inicio: string,
    fim: string,
  ): Promise<void> {
    const ja = emCurso.get(chave);
    if (ja) return ja;
    const p = new Promise<void>((ok) => {
      fila.push(async () => {
        try {
          cache.set(chave, {
            em: agora().getTime(),
            valor: await calcular(slug, inicio, fim),
          });
        } catch (e) {
          logger.warn(
            `painel: falha em ${slug} ${inicio}–${fim} (${(e as Error)?.message ?? 'erro'})`,
          );
        } finally {
          emCurso.delete(chave);
          ok();
        }
      });
      proximo();
    });
    emCurso.set(chave, p);
    return p;
  }

  /**
   * Valor para a chave: do cache se ainda vale; senão dispara a atualização
   * (o valor antigo continua servindo enquanto o novo é calculado).
   */
  function pedir(
    chave: string,
    slug: string,
    inicio: string,
    fim: string,
    validade: number,
  ): { valor?: UnidadePainel; pendente: Promise<void> | null } {
    const c = cache.get(chave);
    if (!c || agora().getTime() - c.em >= validade) {
      return { valor: c?.valor, pendente: atualizar(chave, slug, inicio, fim) };
    }
    return { valor: c.valor, pendente: null };
  }

  const esperar = (ps: (Promise<void> | null)[]) =>
    Promise.race([
      Promise.all(ps.filter(Boolean)),
      new Promise((ok) => setTimeout(ok, espera)),
    ]);

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
      const validade = per.corrente
        ? PAINEL_CACHE_MES_MS
        : PAINEL_CACHE_FECHADO_MS;
      const pedidos = UNIDADES.map((u) => ({
        u,
        chave: `${u.slug}|${per.inicio}|${per.fim.slice(3)}`,
      }));
      // A chave do mês corrente não depende do dia (o fim avança): uma por mês.
      let itens = pedidos.map(({ u, chave }) => ({
        u,
        chave,
        ...pedir(chave, u.slug, per.inicio, per.fim, validade),
      }));
      if (itens.some((i) => !i.valor)) {
        await esperar(itens.filter((i) => !i.valor).map((i) => i.pendente));
        itens = itens.map((i) => ({
          ...i,
          valor: cache.get(i.chave)?.valor ?? i.valor,
        }));
      }
      const unidades = itens.filter((i) => i.valor).map((i) => i.valor!);
      const pendentes = itens.filter((i) => !i.valor).map((i) => i.u.slug);
      await auditar(req, {
        rota: 'mes',
        ano,
        mes,
        unidades: unidades.length,
        pendentes: pendentes.length,
      });
      return res.json({ geradoEm: agora().toISOString(), unidades, pendentes });
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
        const todos = meses.flatMap(({ ano, mes }) => {
          const per = periodoDoMes(ano, mes, agora())!;
          return UNIDADES.map((u) => {
            const chave = `${u.slug}|${per.inicio}|${per.fim}`;
            return {
              ano,
              mes,
              chave,
              ...pedir(
                chave,
                u.slug,
                per.inicio,
                per.fim,
                PAINEL_CACHE_FECHADO_MS,
              ),
            };
          });
        });
        const faltando = todos.filter((i) => !i.valor);
        if (faltando.length) await esperar(faltando.map((i) => i.pendente));
        const saida = meses.map(({ ano, mes }) => ({
          ano,
          mes,
          unidades: todos
            .filter((i) => i.ano === ano && i.mes === mes)
            .map((i) => cache.get(i.chave)?.valor ?? i.valor)
            .filter((v): v is UnidadePainel => !!v)
            .map(({ atualizadoEm: _a, ...v }) => v),
        }));
        const pendentes = todos.filter(
          (i) => !(cache.get(i.chave)?.valor ?? i.valor),
        ).length;
        await auditar(req, { rota: 'historico', meses: n, pendentes });
        return res.json({
          geradoEm: agora().toISOString(),
          meses: saida,
          pendentes,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}

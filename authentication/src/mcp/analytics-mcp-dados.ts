/**
 * Regras puras do MCP do LHG Analytics (sem rede nem banco): unidades que a
 * pessoa pode ver, períodos, e a lista FECHADA de campos devolvidos.
 */

/** Unidades do lhg-api: slug da rota (:unit) e o enum da unidade no perfil. */
export const UNIDADES: { slug: string; unidade: string; nome: string }[] = [
  { slug: 'lush_ipiranga', unidade: 'LUSH_IPIRANGA', nome: 'Lush Ipiranga' },
  { slug: 'lush_lapa', unidade: 'LUSH_LAPA', nome: 'Lush Lapa' },
  { slug: 'tout', unidade: 'TOUT', nome: 'Tout' },
  { slug: 'andar_de_cima', unidade: 'ANDAR_DE_CIMA', nome: 'Andar de Cima' },
  { slug: 'liv', unidade: 'LIV', nome: 'Liv' },
  { slug: 'altana', unidade: 'ALTANA', nome: 'Altana' },
  { slug: 'getan_garavelo', unidade: 'GETAN_GARAVELO', nome: 'Getan Garavelo' },
  {
    slug: 'getan_pq_oeste',
    unidade: 'GETAN_PQ_OESTE',
    nome: 'Getan Parque Oeste',
  },
  {
    slug: 'getan_independencia',
    unidade: 'GETAN_INDEPENDENCIA',
    nome: 'Getan Independência',
  },
  {
    slug: 'getan_novo_mundo',
    unidade: 'GETAN_NOVO_MUNDO',
    nome: 'Getan Novo Mundo',
  },
  {
    slug: 'getan_vera_cruz',
    unidade: 'GETAN_VERA_CRUZ',
    nome: 'Getan Vera Cruz',
  },
  { slug: 'getan_grid', unidade: 'GETAN_GRID', nome: 'Getan Grid' },
];

/** Perfis que veem a Visão Geral (Company), os mesmos do lhg-api. */
export const PERFIS_VISAO_GERAL = [
  'ADMIN',
  'GERENTE_GERAL',
  'GERENTE_FINANCEIRO',
];

/** Unidades que a pessoa pode consultar (a MESMA regra do Analytics). */
export function unidadesDe(p: { role: string | null; unit: string | null }) {
  if (!p.role || !PERFIS_VISAO_GERAL.includes(p.role) || !p.unit) return [];
  if (p.unit === 'LHG') return UNIDADES;
  return UNIDADES.filter((u) => u.unidade === p.unit);
}

export const ATALHOS = [
  'ontem',
  'ultimos_7_dias',
  'ultimos_30_dias',
  'mes_atual',
  'mes_anterior',
] as const;
export type Atalho = (typeof ATALHOS)[number];

export interface Periodo {
  inicio: string; // DD/MM/AAAA
  fim: string; // DD/MM/AAAA (inclusivo; dia comercial 06:00 → 05:59)
}

const ddmmaaaa = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

/**
 * "Hoje" comercial em São Paulo (UTC−3, sem horário de verão): antes das
 * 06:00, ainda é o dia anterior. Devolve a data à meia-noite UTC.
 */
export function hojeComercial(agora: Date): Date {
  const sp = new Date(agora.getTime() - 3 * 3600_000 - 6 * 3600_000);
  return new Date(
    Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate()),
  );
}

const DIA = 86_400_000;

/** Atalho → período (o dia comercial em andamento NÃO entra). */
export function periodoDoAtalho(a: Atalho, agora: Date): Periodo {
  const hoje = hojeComercial(agora);
  const ontem = new Date(hoje.getTime() - DIA);
  switch (a) {
    case 'ontem':
      return { inicio: ddmmaaaa(ontem), fim: ddmmaaaa(ontem) };
    case 'ultimos_7_dias':
      return {
        inicio: ddmmaaaa(new Date(hoje.getTime() - 7 * DIA)),
        fim: ddmmaaaa(ontem),
      };
    case 'ultimos_30_dias':
      return {
        inicio: ddmmaaaa(new Date(hoje.getTime() - 30 * DIA)),
        fim: ddmmaaaa(ontem),
      };
    case 'mes_atual': {
      const ini = new Date(
        Date.UTC(ontem.getUTCFullYear(), ontem.getUTCMonth(), 1),
      );
      return { inicio: ddmmaaaa(ini), fim: ddmmaaaa(ontem) };
    }
    case 'mes_anterior': {
      const ini = new Date(
        Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1),
      );
      const fim = new Date(
        Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 0),
      );
      return { inicio: ddmmaaaa(ini), fim: ddmmaaaa(fim) };
    }
  }
}

/** Data "AAAA-MM-DD" ou "DD/MM/AAAA" → "DD/MM/AAAA" (null se inválida). */
export function normalizarData(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let d: number, m: number, a: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (r) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else {
    r = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
    if (!r) return null;
    [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
  }
  const t = new Date(Date.UTC(a, m - 1, d));
  if (
    t.getUTCFullYear() !== a ||
    t.getUTCMonth() !== m - 1 ||
    t.getUTCDate() !== d
  ) {
    return null;
  }
  return ddmmaaaa(t);
}

const paraData = (s: string) => {
  const [d, m, a] = s.split('/').map(Number);
  return Date.UTC(a, m - 1, d);
};

/** Período limite por consulta (o lhg-api aceita intervalos grandes, mas pesa). */
export const MAX_DIAS = 366;

/**
 * Período pedido: um atalho OU início e fim. Erro em texto (para a pessoa)
 * quando inválido, futuro ou longo demais.
 */
export function resolverPeriodo(
  args: { periodo?: unknown; inicio?: unknown; fim?: unknown },
  agora: Date,
): Periodo | string {
  if (args.periodo !== undefined) {
    if (!ATALHOS.includes(args.periodo as Atalho)) {
      return `periodo inválido; use um de: ${ATALHOS.join(', ')}`;
    }
    return periodoDoAtalho(args.periodo as Atalho, agora);
  }
  const inicio = normalizarData(args.inicio);
  const fim = normalizarData(args.fim);
  if (!inicio || !fim) {
    return 'informe periodo (atalho) ou inicio e fim (AAAA-MM-DD ou DD/MM/AAAA)';
  }
  if (paraData(inicio) > paraData(fim)) return 'inicio depois do fim';
  if (paraData(fim) >= hojeComercial(agora).getTime() + DIA) {
    return 'fim no futuro';
  }
  if ((paraData(fim) - paraData(inicio)) / DIA + 1 > MAX_DIAS) {
    return `período maior que ${MAX_DIAS} dias`;
  }
  return { inicio, fim };
}

const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v)
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const txt = (v: unknown) => (typeof v === 'string' ? v : null);

/**
 * Lista FECHADA de campos da Visão Geral: só os totais agregados do período
 * (nunca o JSON cru do lhg-api). Campo novo no lhg-api não vaza sozinho.
 */
export function camposDaVisaoGeral(bruto: any) {
  const t = bruto?.TotalResult ?? {};
  const b = Array.isArray(bruto?.BigNumbers) ? bruto.BigNumbers[0] : undefined;
  const atual = b?.currentDate ?? {};
  const prev = b?.monthlyForecast;
  return {
    faturamento: num(t.totalAllValue),
    locacoes: num(t.totalAllRentalsApartments),
    ticket_medio: num(t.totalAllTicketAverage),
    giro: num(t.totalGiro),
    revpar: num(t.totalRevpar),
    trevpar: num(t.totalTrevpar),
    taxa_ocupacao_percentual: num(t.totalOccupancyRate),
    tempo_medio_ocupacao: txt(
      t.totalAverageOccupationTime ?? atual.totalAverageOccupationTime,
    ),
    previsao_do_mes: prev
      ? {
          faturamento: num(prev.totalAllValueForecast),
          locacoes: num(prev.totalAllRentalsApartmentsForecast),
          ticket_medio: num(prev.totalAllTicketAverageForecast),
          giro: num(prev.totalAllGiroForecast),
          trevpar: num(prev.totalAllTrevparForecast),
        }
      : null,
  };
}

/** Diferença de A para B, campo a campo (valor e %), só nos numéricos. */
export function compararCampos(
  a: ReturnType<typeof camposDaVisaoGeral>,
  b: ReturnType<typeof camposDaVisaoGeral>,
) {
  const out: Record<
    string,
    {
      a: number | null;
      b: number | null;
      diferenca: number | null;
      variacao_percentual: number | null;
    }
  > = {};
  for (const k of [
    'faturamento',
    'locacoes',
    'ticket_medio',
    'giro',
    'revpar',
    'trevpar',
    'taxa_ocupacao_percentual',
  ] as const) {
    const va = a[k];
    const vb = b[k];
    const dif =
      va !== null && vb !== null ? Number((vb - va).toFixed(2)) : null;
    const pct =
      va !== null && vb !== null && va !== 0
        ? Number((((vb - va) / Math.abs(va)) * 100).toFixed(2))
        : null;
    out[k] = { a: va, b: vb, diferenca: dif, variacao_percentual: pct };
  }
  return out;
}

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

/** Nome de categoria de suíte (texto curto; nunca dado de pessoa). */
const nomeCategoria = (v: unknown) =>
  typeof v === 'string' ? v.slice(0, 60) : '';

/**
 * "Resumo por Categoria" do dashboard: os KPIs da Visão Geral quebrados por
 * categoria de suíte (DataTableSuiteCategory do MESMO endpoint), em lista
 * fechada. A ordem é a do dashboard.
 */
export function camposPorCategoria(bruto: any) {
  const linhas: any[] = Array.isArray(bruto?.DataTableSuiteCategory)
    ? bruto.DataTableSuiteCategory
    : [];
  return linhas
    .map((linha) => {
      const [nome, v] = Object.entries(linha ?? {})[0] ?? [];
      const k: any = v ?? {};
      return {
        categoria: nomeCategoria(nome),
        faturamento: num(k.totalValue),
        locacoes: num(k.totalRentalsApartments),
        ticket_medio: num(k.totalTicketAverage),
        giro: num(k.giro),
        revpar: num(k.revpar),
        trevpar: num(k.trevpar),
        taxa_ocupacao_percentual: num(k.occupancyRate),
        tempo_medio_ocupacao: txt(k.averageOccupationTime),
      };
    })
    .filter((c) => c.categoria);
}

/** Dias da semana na ordem do dashboard. */
export const DIAS_DA_SEMANA = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

/** Valor de um dia numa tabela "por semana" do dashboard ([{categoria: {dia: {...}}}]). */
function porDia(tabela: unknown, campoTotal: string, campo: string) {
  const linhas: any[] = Array.isArray(tabela) ? tabela : [];
  const total: Record<string, number | null> = {};
  const porCategoria: {
    categoria: string;
    dias: Record<string, number | null>;
  }[] = [];
  for (const linha of linhas) {
    const [nome, dias] = Object.entries(linha ?? {})[0] ?? [];
    if (!nomeCategoria(nome)) continue;
    const d: any = dias ?? {};
    const valores: Record<string, number | null> = {};
    for (const dia of DIAS_DA_SEMANA) {
      valores[dia] = num(d[dia]?.[campo]);
      // O total do dia é o mesmo em todas as categorias (valor global do dia).
      if (total[dia] === undefined || total[dia] === null) {
        total[dia] = num(d[dia]?.[campoTotal]);
      }
    }
    porCategoria.push({ categoria: nomeCategoria(nome), dias: valores });
  }
  return { total, porCategoria };
}

/**
 * Giro por dia da semana do dashboard (DataTableGiroByWeek do MESMO
 * endpoint), com RevPAR e taxa de ocupação do dia (as outras duas tabelas
 * por semana da tela). Faturamento e locações por dia da semana NÃO existem
 * nessa tela, então não entram.
 */
export function camposPorDiaDaSemana(bruto: any) {
  const giro = porDia(bruto?.DataTableGiroByWeek, 'totalGiro', 'giro');
  const revpar = porDia(bruto?.DataTableRevparByWeek, 'totalRevpar', 'revpar');
  const ocup = porDia(
    bruto?.DataTableOccupancyRateByWeek,
    'totalOccupancyRate',
    'occupancyRate',
  );
  return {
    dias: DIAS_DA_SEMANA.map((dia) => ({
      dia,
      giro: giro.total[dia] ?? null,
      revpar: revpar.total[dia] ?? null,
      taxa_ocupacao_percentual: ocup.total[dia] ?? null,
    })),
    giro_por_categoria: giro.porCategoria,
  };
}

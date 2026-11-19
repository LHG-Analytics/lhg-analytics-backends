/**
 * Somas do resumo do Painel TV, com a MESMA aritmética dos endpoints do
 * dashboard (para os números baterem com /painel/mes e /painel/historico):
 * - faturamento/locações = TotalResult da Visão Geral (company.service):
 *   soma das categorias, faturamento arredondado a 2 casas no fim;
 * - reservas/faturamento de reservas = BigNumbers das Reservas
 *   (bookings.service): soma dos canais da unidade (tenant.bookingChannels);
 * - e-commerce = WEBSITE_IMMEDIATE + WEBSITE_SCHEDULED (BigNumbersEcommerce);
 * - Guia = GUIA_GO + GUIA_SCHEDULED, arredondado a 2 casas (como o painel).
 */

export interface LinhaCategoria {
  total_rentals: unknown;
  total_value: unknown;
}

export interface LinhaCanal {
  channel_type: string;
  totalValue: unknown;
  totalBookings: unknown;
}

export interface ResumoPainel {
  faturamento: number;
  locacoes: number;
  faturamentoReservas: number;
  reservas: number;
  reservasEcommerce: number;
  receitaEcommerce: number;
  reservasGuia: number;
  receitaGuia: number;
}

/** TotalResult: soma das categorias (o mesmo reduce do company.service). */
export function totaisDasCategorias(linhas: LinhaCategoria[]): {
  faturamento: number;
  locacoes: number;
} {
  let locacoes = 0;
  let valor = 0;
  for (const l of linhas) {
    locacoes += Number(l.total_rentals) || 0;
    valor += Number(l.total_value) || 0;
  }
  return { faturamento: Number(valor.toFixed(2)), locacoes };
}

/** Reservas por canal (a mesma montagem do KpiTableByChannelType/BigNumbers do bookings.service). */
export function totaisDasReservas(
  linhas: LinhaCanal[],
  canaisDaUnidade: string[]
): Omit<ResumoPainel, 'faturamento' | 'locacoes'> {
  const dados = new Map<string, { receita: number; qtd: number }>();
  for (const l of linhas) {
    dados.set(l.channel_type, {
      receita: Number(l.totalValue),
      qtd: Number(l.totalBookings),
    });
  }
  const qtdPorCanal: Record<string, number> = {};
  const receitaPorCanal: Record<string, number> = {};
  let totalQtd = 0;
  let totalReceita = 0;
  for (const canal of canaisDaUnidade) {
    const d = dados.get(canal) ?? { receita: 0, qtd: 0 };
    qtdPorCanal[canal] = d.qtd;
    receitaPorCanal[canal] = Number(d.receita.toFixed(2));
    totalQtd += d.qtd;
    totalReceita += d.receita;
  }
  const n = (v: number | undefined) => v || 0;
  const guia = n(receitaPorCanal.GUIA_GO) + n(receitaPorCanal.GUIA_SCHEDULED);
  return {
    faturamentoReservas: Number(totalReceita.toFixed(2)),
    reservas: totalQtd,
    reservasEcommerce:
      n(qtdPorCanal.WEBSITE_IMMEDIATE) + n(qtdPorCanal.WEBSITE_SCHEDULED),
    receitaEcommerce:
      n(receitaPorCanal.WEBSITE_IMMEDIATE) +
      n(receitaPorCanal.WEBSITE_SCHEDULED),
    reservasGuia: n(qtdPorCanal.GUIA_GO) + n(qtdPorCanal.GUIA_SCHEDULED),
    receitaGuia: Math.round(guia * 100) / 100,
  };
}

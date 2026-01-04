/**
 * Queries SQL para cálculo de KPIs de Restaurant unificados
 * Cada query é parametrizada para aceitar datas e IDs de tipos de produtos A&B
 *
 * IMPORTANTE: O dia operacional começa às 06:00:00 e termina às 05:59:59 do dia seguinte
 * Exemplo: Dia 01/01/2025 = 01/01/2025 06:00:00 até 02/01/2025 05:59:59
 */

import { UnitKey, UNIT_CONFIGS } from '../../database/database.interfaces';

// Configuração de tipos de produtos A&B por unidade
export interface UnitABConfig {
  abProductTypes: number[];
  aProductTypes: number[];
  bProductTypes: number[];
}

export const UNIT_AB_CONFIGS: Record<UnitKey, UnitABConfig> = {
  lush_ipiranga: {
    abProductTypes: [78, 64, 77, 57, 56, 79, 54, 55, 80, 53, 62, 59, 61, 58, 63],
    aProductTypes: [78, 64, 77, 57, 62, 59, 61, 58, 63],
    bProductTypes: [56, 79, 54, 55, 80, 53],
  },
  lush_lapa: {
    abProductTypes: [40, 47, 33, 34, 32, 15, 13, 44, 10, 11, 31, 41, 27, 26, 25, 35],
    aProductTypes: [47, 32, 13, 44, 10, 11, 31, 41, 27],
    bProductTypes: [40, 34, 15, 26, 25, 35],
  },
  tout: {
    abProductTypes: [35, 59, 49, 50, 60, 62, 23, 1, 4, 12, 46, 11, 14, 42, 13],
    aProductTypes: [13, 1, 4, 12, 46, 11, 14, 42],
    bProductTypes: [49, 50, 60, 62, 23, 35, 59],
  },
  andar_de_cima: {
    abProductTypes: [6, 13, 2, 4, 5, 3, 20, 14, 16, 18, 7, 15, 17],
    aProductTypes: [14, 16, 18, 7, 15, 17],
    bProductTypes: [6, 13, 2, 4, 5, 3, 20],
  },
};

/**
 * Formata data DD/MM/YYYY para YYYY-MM-DD
 */
export function formatDateForSQL(dateStr: string): string {
  const [day, month, year] = dateStr.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Calcula os timestamps de início e fim considerando o corte das 6h
 * startDate 06:00:00 até endDate+1 05:59:59
 */
export function getDateRangeWithCutoff(
  startDate: string,
  endDate: string,
): { startTimestamp: string; endTimestamp: string } {
  const formattedStart = formatDateForSQL(startDate);
  const formattedEnd = formatDateForSQL(endDate);

  // Parse endDate para calcular D+1
  const [day, month, year] = endDate.split('/').map(Number);
  const endDateObj = new Date(year, month - 1, day);
  endDateObj.setDate(endDateObj.getDate() + 1); // D+1

  const nextDay = endDateObj.toISOString().split('T')[0]; // YYYY-MM-DD

  return {
    startTimestamp: `${formattedStart} 06:00:00`,
    endTimestamp: `${nextDay} 05:59:59`,
  };
}

/**
 * Obtém os IDs de produtos A&B formatados para SQL IN clause
 */
export function getAbProductIds(unit: UnitKey): string {
  return UNIT_AB_CONFIGS[unit].abProductTypes.join(',');
}

/**
 * Obtém os IDs de categorias de suítes formatados para SQL IN clause
 */
export function getCategoryIds(unit: UnitKey): string {
  return UNIT_CONFIGS[unit].suiteConfig.categoryIds.join(',');
}

/**
 * Query para BigNumbers do Restaurant - totais do período
 * Retorna: total de receita A&B líquida, vendas com A&B, e total de locações
 */
export function getRestaurantBigNumbersSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const abProductIds = getAbProductIds(unit);
  const categoryIds = getCategoryIds(unit);
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    WITH vendas_ab AS (
      SELECT
        la.id_apartamentostate,
        SUM(soi.precovenda * soi.quantidade) as valor_bruto_ab,
        COALESCE(v.desconto, 0) as desconto_total,
        SUM(soi_total.total_bruto) as total_bruto_venda
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      LEFT JOIN vendalocacao sl ON sl.id_locacaoapartamento = la.id_apartamentostate
      LEFT JOIN saidaestoque so ON so.id = sl.id_saidaestoque
      LEFT JOIN saidaestoqueitem soi ON soi.id_saidaestoque = so.id AND soi.cancelado IS NULL
      LEFT JOIN produtoestoque ps ON ps.id = soi.id_produtoestoque
      LEFT JOIN produto p ON p.id = ps.id_produto
      LEFT JOIN tipoproduto tp ON tp.id = p.id_tipoproduto
      LEFT JOIN venda v ON v.id_saidaestoque = so.id
      LEFT JOIN (
        SELECT
          id_saidaestoque,
          SUM(precovenda * quantidade) as total_bruto
        FROM saidaestoqueitem
        WHERE cancelado IS NULL
        GROUP BY id_saidaestoque
      ) soi_total ON soi_total.id_saidaestoque = so.id
      WHERE la.datainicialdaocupacao >= '${startTimestamp}'::timestamp
        AND la.datainicialdaocupacao <= '${endTimestamp}'::timestamp
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca.id IN (${categoryIds})
        AND tp.id IN (${abProductIds})
      GROUP BY la.id_apartamentostate, v.desconto
    ),
    locacoes AS (
      SELECT COUNT(*) as total_rentals
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE la.datainicialdaocupacao >= '${startTimestamp}'::timestamp
        AND la.datainicialdaocupacao <= '${endTimestamp}'::timestamp
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca.id IN (${categoryIds})
    )
    SELECT
      COALESCE(SUM(
        valor_bruto_ab - (valor_bruto_ab * desconto_total / NULLIF(total_bruto_venda, 0))
      ), 0) as total_ab_value,
      COUNT(*) as total_sales_with_ab,
      (SELECT total_rentals FROM locacoes) as total_rentals
    FROM vendas_ab
    WHERE valor_bruto_ab > 0
  `;
}

/**
 * Query para receita A&B por data
 */
export function getRevenueAbByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const abProductIds = getAbProductIds(unit);
  const categoryIds = getCategoryIds(unit);
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COALESCE(SUM(
        (soi.precovenda * soi.quantidade) *
        (1 - COALESCE(v.desconto, 0) / NULLIF(so_total.total_bruto, 0))
      ), 0) as total_ab_value
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    INNER JOIN apartamento a ON aps.id_apartamento = a.id
    INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
    LEFT JOIN vendalocacao sl ON sl.id_locacaoapartamento = la.id_apartamentostate
    LEFT JOIN saidaestoque so ON so.id = sl.id_saidaestoque
    LEFT JOIN saidaestoqueitem soi ON soi.id_saidaestoque = so.id AND soi.cancelado IS NULL
    LEFT JOIN produtoestoque ps ON ps.id = soi.id_produtoestoque
    LEFT JOIN produto p ON p.id = ps.id_produto
    LEFT JOIN tipoproduto tp ON tp.id = p.id_tipoproduto
    LEFT JOIN venda v ON v.id_saidaestoque = so.id
    LEFT JOIN (
      SELECT
        id_saidaestoque,
        SUM(precovenda * quantidade) as total_bruto
      FROM saidaestoqueitem
      WHERE cancelado IS NULL
      GROUP BY id_saidaestoque
    ) so_total ON so_total.id_saidaestoque = so.id
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'::timestamp
      AND la.datainicialdaocupacao <= '${endTimestamp}'::timestamp
      AND la.fimocupacaotipo = 'FINALIZADA'
      AND ca.id IN (${categoryIds})
      AND tp.id IN (${abProductIds})
    GROUP BY CASE
      WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
      ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
    END
    ORDER BY date
  `;
}

/**
 * Query para receita total por data (para calcular percentual A&B)
 */
export function getTotalRevenueByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const categoryIds = getCategoryIds(unit);
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    SELECT
      date,
      SUM(valor) as total_revenue
    FROM (
      -- Receita de locações (valortotal já inclui consumo)
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END as date,
        la.valortotal as valor
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE la.datainicialdaocupacao >= '${startTimestamp}'::timestamp
        AND la.datainicialdaocupacao <= '${endTimestamp}'::timestamp
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca.id IN (${categoryIds})

      UNION ALL

      -- Receita de vendas diretas
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM so.datasaida) >= 6 THEN DATE(so.datasaida)
          ELSE DATE(so.datasaida - INTERVAL '1 day')
        END as date,
        COALESCE(SUM(soi.precovenda * soi.quantidade), 0) - COALESCE(v.desconto, 0) as valor
      FROM vendadireta vd
      INNER JOIN saidaestoque so ON so.id = vd.id_saidaestoque
      LEFT JOIN saidaestoqueitem soi ON soi.id_saidaestoque = so.id AND soi.cancelado IS NULL
      LEFT JOIN venda v ON v.id_saidaestoque = so.id
      WHERE so.datasaida >= '${startTimestamp}'::timestamp
        AND so.datasaida <= '${endTimestamp}'::timestamp
      GROUP BY CASE
        WHEN EXTRACT(HOUR FROM so.datasaida) >= 6 THEN DATE(so.datasaida)
        ELSE DATE(so.datasaida - INTERVAL '1 day')
      END, v.desconto
    ) all_revenues
    GROUP BY date
    ORDER BY date
  `;
}

/**
 * Query para contagem de locações com A&B por data
 */
export function getSalesWithAbByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const abProductIds = getAbProductIds(unit);
  const categoryIds = getCategoryIds(unit);
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COUNT(DISTINCT la.id_apartamentostate) as rentals_with_ab
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    INNER JOIN apartamento a ON aps.id_apartamento = a.id
    INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
    LEFT JOIN vendalocacao sl ON sl.id_locacaoapartamento = la.id_apartamentostate
    LEFT JOIN saidaestoque so ON so.id = sl.id_saidaestoque
    LEFT JOIN saidaestoqueitem soi ON soi.id_saidaestoque = so.id AND soi.cancelado IS NULL
    LEFT JOIN produtoestoque ps ON ps.id = soi.id_produtoestoque
    LEFT JOIN produto p ON p.id = ps.id_produto
    LEFT JOIN tipoproduto tp ON tp.id = p.id_tipoproduto
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'::timestamp
      AND la.datainicialdaocupacao <= '${endTimestamp}'::timestamp
      AND la.fimocupacaotipo = 'FINALIZADA'
      AND ca.id IN (${categoryIds})
      AND tp.id IN (${abProductIds})
    GROUP BY CASE
      WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
      ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
    END
    ORDER BY date
  `;
}

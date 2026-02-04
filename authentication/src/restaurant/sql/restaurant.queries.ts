/**
 * Queries SQL para cálculo de KPIs de Restaurant unificados
 * Cada query é parametrizada para aceitar datas e IDs de tipos de produtos A&B
 *
 * IMPORTANTE: O dia operacional começa às 06:00:00 e termina às 05:59:59 do dia seguinte
 * Exemplo: Dia 01/01/2025 = 01/01/2025 06:00:00 até 02/01/2025 05:59:59
 */

import { UnitKey } from '../../database/database.interfaces';
import { QueryUtilsService } from '@lhg/utils';

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
  liv: {
    abProductTypes: [26, 23, 24, 6, 7, 2, 22, 5, 31, 15, 12, 16, 9],
    aProductTypes: [26, 23, 24, 6, 7, 2, 22, 5],
    bProductTypes: [31, 15, 12, 16, 9],
  },
};

/**
 * Formata data DD/MM/YYYY para YYYY-MM-DD usando QueryUtilsService
 */
export function formatDateForSQL(dateStr: string): string {
  return QueryUtilsService.formatDateStrToSQLDate(dateStr);
}

/**
 * Calcula os timestamps de início e fim considerando o corte das 6h
 * startDate 06:00:00 até endDate+1 05:59:59 usando QueryUtilsService
 */
export function getDateRangeWithCutoff(
  startDate: string,
  endDate: string,
): { startTimestamp: string; endTimestamp: string } {
  const formattedStart = QueryUtilsService.formatDateStrToSQLDate(startDate);
  const formattedEnd = QueryUtilsService.formatDateStrToSQLDate(endDate);

  // Calcula D+1 usando QueryUtilsService
  const nextDay = QueryUtilsService.getNextDay(formattedEnd);

  return {
    startTimestamp: QueryUtilsService.createSQLTimestamp(formattedStart, '06:00:00'),
    endTimestamp: QueryUtilsService.createSQLTimestamp(nextDay, '05:59:59'),
  };
}

/**
 * Obtém os IDs de produtos A&B formatados para SQL IN clause usando QueryUtilsService
 */
export function getAbProductIds(unit: UnitKey): string {
  return QueryUtilsService.sanitizeIdList(UNIT_AB_CONFIGS[unit].abProductTypes);
}


/**
 * Query para BigNumbers do Restaurant - totais do período
 * Retorna: total de receita A&B líquida, vendas com A&B, e total de locações
 * CORRIGIDO: Igual ao individual - calcula abTotal via CASE WHEN, não filtra no WHERE
 * O desconto proporcional é baseado no total bruto de TODOS os itens, não só A&B
 */
export function getRestaurantBigNumbersSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const abProductIds = getAbProductIds(unit);
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    WITH vendas_por_locacao AS (
      SELECT
        la.id_apartamentostate,
        so.id as id_saidaestoque,
        COALESCE(SUM(soi.precovenda * soi.quantidade), 0) as total_gross,
        COALESCE(v.desconto, 0) as desconto,
        COALESCE(SUM(
          CASE
            WHEN tp.id IN (${abProductIds})
            THEN soi.precovenda * soi.quantidade
            ELSE 0
          END
        ), 0) as ab_total
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      LEFT JOIN vendalocacao sl ON sl.id_locacaoapartamento = la.id_apartamentostate
      LEFT JOIN saidaestoque so ON so.id = sl.id_saidaestoque
      LEFT JOIN saidaestoqueitem soi ON soi.id_saidaestoque = so.id AND soi.cancelado IS NULL
      LEFT JOIN produtoestoque ps ON ps.id = soi.id_produtoestoque
      LEFT JOIN produto p ON p.id = ps.id_produto
      LEFT JOIN tipoproduto tp ON tp.id = p.id_tipoproduto
      LEFT JOIN venda v ON v.id_saidaestoque = so.id
      WHERE la.datainicialdaocupacao >= '${startTimestamp}'::timestamp
        AND la.datainicialdaocupacao <= '${endTimestamp}'::timestamp
        AND la.fimocupacaotipo = 'FINALIZADA'
      GROUP BY la.id_apartamentostate, so.id, v.desconto
    )
    SELECT
      COALESCE(SUM(
        CASE
          WHEN ab_total > 0 THEN
            ab_total - (desconto * ab_total / NULLIF(total_gross, 0))
          ELSE 0
        END
      ), 0) as total_ab_value,
      COUNT(CASE WHEN ab_total > 0 THEN 1 END) as total_sales_with_ab,
      COUNT(CASE WHEN total_gross > 0 THEN 1 END) as total_all_sales,
      COUNT(DISTINCT id_apartamentostate) as total_rentals
    FROM vendas_por_locacao
  `;
}

/**
 * Query para receita total de vendas (todos produtos) e receita total
 * Retorna: total de receita de vendas de todos os produtos e receita total (locações + vendas diretas)
 * CORRIGIDO: Sem filtro de categoria, igual ao individual
 */
export function getTotalSalesAndRevenueSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    WITH vendas_em_locacoes AS (
      -- Receita de vendas (todos os produtos) dentro de locações
      SELECT
        COALESCE(SUM(
          (soi.precovenda * soi.quantidade) *
          (1 - COALESCE(v.desconto, 0) / NULLIF(so_total.total_bruto, 0))
        ), 0) as total_sales_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      LEFT JOIN vendalocacao sl ON sl.id_locacaoapartamento = la.id_apartamentostate
      LEFT JOIN saidaestoque so ON so.id = sl.id_saidaestoque
      LEFT JOIN saidaestoqueitem soi ON soi.id_saidaestoque = so.id AND soi.cancelado IS NULL
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
    ),
    receita_locacoes AS (
      -- Receita total de locações (valortotal já inclui consumo)
      SELECT COALESCE(SUM(la.valortotal), 0) as total_rentals_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      WHERE la.datainicialdaocupacao >= '${startTimestamp}'::timestamp
        AND la.datainicialdaocupacao <= '${endTimestamp}'::timestamp
        AND la.fimocupacaotipo = 'FINALIZADA'
    ),
    vendas_diretas AS (
      -- Receita de vendas diretas (fora de locações)
      SELECT COALESCE(SUM(
        COALESCE(soi_total.total_bruto, 0) - COALESCE(v.desconto, 0)
      ), 0) as total_direct_sales_revenue
      FROM vendadireta vd
      INNER JOIN saidaestoque so ON so.id = vd.id_saidaestoque
      LEFT JOIN venda v ON v.id_saidaestoque = so.id
      LEFT JOIN (
        SELECT
          id_saidaestoque,
          SUM(precovenda * quantidade) as total_bruto
        FROM saidaestoqueitem
        WHERE cancelado IS NULL
        GROUP BY id_saidaestoque
      ) soi_total ON soi_total.id_saidaestoque = so.id
      WHERE so.datasaida >= '${startTimestamp}'::timestamp
        AND so.datasaida <= '${endTimestamp}'::timestamp
    )
    SELECT
      (SELECT total_sales_revenue FROM vendas_em_locacoes) as total_sales_revenue,
      (SELECT total_rentals_revenue FROM receita_locacoes) + (SELECT total_direct_sales_revenue FROM vendas_diretas) as total_revenue
  `;
}

/**
 * Query para receita A&B por data
 * CORRIGIDO: Sem filtro de categoria, igual ao individual
 */
export function getRevenueAbByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const abProductIds = getAbProductIds(unit);
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
 * CORRIGIDO: Sem filtro de categoria, igual ao individual
 */
export function getTotalRevenueByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
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
      WHERE la.datainicialdaocupacao >= '${startTimestamp}'::timestamp
        AND la.datainicialdaocupacao <= '${endTimestamp}'::timestamp
        AND la.fimocupacaotipo = 'FINALIZADA'

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
 * CORRIGIDO: Sem filtro de categoria, igual ao individual
 */
export function getSalesWithAbByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const abProductIds = getAbProductIds(unit);
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
    LEFT JOIN vendalocacao sl ON sl.id_locacaoapartamento = la.id_apartamentostate
    LEFT JOIN saidaestoque so ON so.id = sl.id_saidaestoque
    LEFT JOIN saidaestoqueitem soi ON soi.id_saidaestoque = so.id AND soi.cancelado IS NULL
    LEFT JOIN produtoestoque ps ON ps.id = soi.id_produtoestoque
    LEFT JOIN produto p ON p.id = ps.id_produto
    LEFT JOIN tipoproduto tp ON tp.id = p.id_tipoproduto
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'::timestamp
      AND la.datainicialdaocupacao <= '${endTimestamp}'::timestamp
      AND la.fimocupacaotipo = 'FINALIZADA'
      AND tp.id IN (${abProductIds})
    GROUP BY CASE
      WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
      ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
    END
    ORDER BY date
  `;
}

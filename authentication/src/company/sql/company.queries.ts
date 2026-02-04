/**
 * Queries SQL para cálculo de KPIs unificados
 * Cada query é parametrizada para aceitar datas e IDs de categorias
 *
 * IMPORTANTE: O dia operacional começa às 06:00:00 e termina às 05:59:59 do dia seguinte
 * Exemplo: Dia 01/01/2025 = 01/01/2025 06:00:00 até 02/01/2025 05:59:59
 */

import { UnitKey, UNIT_CONFIGS } from '../../database/database.interfaces';
import { QueryUtilsService } from '@lhg/utils';

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
 * Obtém os IDs de categorias formatados para SQL IN clause usando QueryUtilsService
 */
export function getCategoryIds(unit: UnitKey): string {
  return QueryUtilsService.sanitizeIdList(UNIT_CONFIGS[unit].suiteConfig.categoryIds);
}

/**
 * Query para BigNumbers - totais do período
 */
export function getBigNumbersSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const categoryIds = getCategoryIds(unit);
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );

  return `
    WITH receita_consumo AS (
      SELECT
        la.id_apartamentostate as id_locacao,
        COALESCE(SUM(
          CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))
        ), 0) as valor_consumo_bruto
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca_apt ON a.id_categoriaapartamento = ca_apt.id
      INNER JOIN vendalocacao vl ON la.id_apartamentostate = vl.id_locacaoapartamento
      INNER JOIN saidaestoque se ON vl.id_saidaestoque = se.id
      INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
      WHERE la.datainicialdaocupacao >= '${startTimestamp}'
        AND la.datainicialdaocupacao <= '${endTimestamp}'
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND sei.cancelado IS NULL
        AND ca_apt.id IN (${categoryIds})
      GROUP BY la.id_apartamentostate, vl.id_locacaoapartamento
    )
    SELECT
      COUNT(*) as total_rentals,
      COALESCE(SUM(
        COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
        COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) +
        COALESCE(rc.valor_consumo_bruto, 0) -
        COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
      ), 0) as total_all_value,
      COALESCE(SUM(
        COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
        COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) -
        COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
      ), 0) as total_rental_revenue,
      COALESCE(SUM(
        EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao)
      ), 0) as total_occupied_time,
      COALESCE(SUM(CAST(la.gorjeta AS DECIMAL(15,4))), 0) as total_tips
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    INNER JOIN apartamento a ON aps.id_apartamento = a.id
    INNER JOIN categoriaapartamento ca_apt ON a.id_categoriaapartamento = ca_apt.id
    LEFT JOIN receita_consumo rc ON la.id_apartamentostate = rc.id_locacao
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'
      AND la.datainicialdaocupacao <= '${endTimestamp}'
      AND la.fimocupacaotipo = 'FINALIZADA'
      AND ca_apt.id IN (${categoryIds})
  `;
}

/**
 * Query para Revenue por data
 * CORRIGIDO: Usa valorliquidolocacao igual ao individual (company.service.ts)
 * Sem filtro de categoria, pois o individual também não filtra
 */
export function getRevenueByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );

  return `
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COALESCE(SUM(CAST(la.valorliquidolocacao AS DECIMAL)), 0) as daily_revenue
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'
      AND la.datainicialdaocupacao <= '${endTimestamp}'
      AND la.fimocupacaotipo = 'FINALIZADA'
    GROUP BY CASE
      WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
      ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
    END
    ORDER BY date
  `;
}

/**
 * Query para Rentals (locações) por data
 */
export function getRentalsByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const categoryIds = getCategoryIds(unit);
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );

  return `
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COUNT(*) as total_rentals
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    INNER JOIN apartamento a ON aps.id_apartamento = a.id
    INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'
      AND la.datainicialdaocupacao <= '${endTimestamp}'
      AND la.fimocupacaotipo = 'FINALIZADA'
      AND ca.id IN (${categoryIds})
    GROUP BY CASE
      WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
      ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
    END
    ORDER BY date
  `;
}

/**
 * Query para TRevPAR por data (inclui gorjetas)
 * CORRIGIDO: Usa valorliquidolocacao + gorjeta igual ao individual
 * Sem filtro de categoria, pois o individual também não filtra
 * Retorna total_revenue (soma), divisão por suítes feita no processamento
 */
export function getTrevparByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );
  const totalSuites = UNIT_CONFIGS[unit].suiteConfig.totalSuites;

  return `
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COALESCE(SUM(
        COALESCE(CAST(la.valorliquidolocacao AS DECIMAL), 0) +
        COALESCE(CAST(la.gorjeta AS DECIMAL), 0)
      ), 0) / ${totalSuites} as trevpar
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'
      AND la.datainicialdaocupacao <= '${endTimestamp}'
      AND la.fimocupacaotipo = 'FINALIZADA'
    GROUP BY CASE
      WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
      ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
    END
    ORDER BY date
  `;
}

/**
 * Query para Revpar por data
 * Revpar = SOMENTE receita de locação (permanencia + ocupadicional - desconto) / total de suítes
 * NÃO inclui consumo, vendas diretas ou gorjetas
 */
export function getRevparByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );
  const totalSuites = UNIT_CONFIGS[unit].suiteConfig.totalSuites;

  return `
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COALESCE(SUM(
        COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
        COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) -
        COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
      ), 0) / ${totalSuites} as revpar
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'
      AND la.datainicialdaocupacao <= '${endTimestamp}'
      AND la.fimocupacaotipo = 'FINALIZADA'
    GROUP BY CASE
      WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
      ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
    END
    ORDER BY date
  `;
}

/**
 * Query para Taxa de Ocupação por data
 */
export function getOccupancyRateByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const categoryIds = getCategoryIds(unit);
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );
  const totalSuites = UNIT_CONFIGS[unit].suiteConfig.totalSuites;
  // 18 horas úteis por dia em segundos (6h às 24h = 18h)
  const availableSecondsPerDay = 18 * 3600;

  return `
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COALESCE(SUM(
        EXTRACT(EPOCH FROM (la.datafinaldaocupacao - la.datainicialdaocupacao))
      ), 0) as total_occupied_seconds,
      (${totalSuites} * ${availableSecondsPerDay}) as available_seconds,
      CASE
        WHEN (${totalSuites} * ${availableSecondsPerDay}) > 0 THEN
          (COALESCE(SUM(EXTRACT(EPOCH FROM (la.datafinaldaocupacao - la.datainicialdaocupacao))), 0) * 100.0) /
          (${totalSuites} * ${availableSecondsPerDay})
        ELSE 0
      END as occupancy_rate
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    INNER JOIN apartamento a ON aps.id_apartamento = a.id
    INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'
      AND la.datainicialdaocupacao <= '${endTimestamp}'
      AND la.fimocupacaotipo = 'FINALIZADA'
      AND ca.id IN (${categoryIds})
    GROUP BY CASE
      WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
      ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
    END
    ORDER BY date
  `;
}

/**
 * Query para Giro por data (locações por suíte)
 */
export function getGiroByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const categoryIds = getCategoryIds(unit);
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );
  const totalSuites = UNIT_CONFIGS[unit].suiteConfig.totalSuites;

  return `
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COUNT(*)::DECIMAL / ${totalSuites} as giro
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    INNER JOIN apartamento a ON aps.id_apartamento = a.id
    INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'
      AND la.datainicialdaocupacao <= '${endTimestamp}'
      AND la.fimocupacaotipo = 'FINALIZADA'
      AND ca.id IN (${categoryIds})
    GROUP BY CASE
      WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
      ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
    END
    ORDER BY date
  `;
}

/**
 * Query para Vendas Diretas - receita de vendas não vinculadas a locações
 * Igual ao individual: divide desconto proporcionalmente entre itens da venda
 */
export function getSaleDirectSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );

  return `
    SELECT
      COALESCE(SUM(receita_item), 0) AS receita_bruta,
      COALESCE(SUM(desconto_proporcional), 0) AS total_descontos,
      COALESCE(SUM(receita_item - desconto_proporcional), 0) AS total_sale_direct,
      COUNT(*) AS total_itens,
      COUNT(DISTINCT venda_id) AS total_vendas_diretas
    FROM (
      SELECT
        se.id as venda_id,
        CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4)) as receita_item,
        COALESCE(CAST(v.desconto AS DECIMAL(15,4)), 0) /
          NULLIF((SELECT COUNT(*) FROM saidaestoqueitem sei2
                  WHERE sei2.id_saidaestoque = se.id
                  AND sei2.cancelado IS NULL), 0) as desconto_proporcional
      FROM saidaestoque se
      INNER JOIN vendadireta vd ON se.id = vd.id_saidaestoque
      INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
      LEFT JOIN venda v ON se.id = v.id_saidaestoque
      WHERE vd.venda_completa = true
        AND sei.cancelado IS NULL
        AND sei.datasaidaitem >= '${startTimestamp}'
        AND sei.datasaidaitem <= '${endTimestamp}'
    ) vendas_diretas_detalhadas
  `;
}

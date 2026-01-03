/**
 * Queries SQL para cálculo de KPIs unificados
 * Cada query é parametrizada para aceitar datas e IDs de categorias
 *
 * IMPORTANTE: O dia operacional começa às 06:00:00 e termina às 05:59:59 do dia seguinte
 * Exemplo: Dia 01/01/2025 = 01/01/2025 06:00:00 até 02/01/2025 05:59:59
 */

import { UnitKey, UNIT_CONFIGS } from '../../database/database.interfaces';

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
 * Obtém os IDs de categorias formatados para SQL IN clause
 */
export function getCategoryIds(unit: UnitKey): string {
  return UNIT_CONFIGS[unit].suiteConfig.categoryIds.join(',');
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
 */
export function getRevenueByDateSQL(
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
      GROUP BY la.id_apartamentostate
    )
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COALESCE(SUM(
        COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
        COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) +
        COALESCE(rc.valor_consumo_bruto, 0) -
        COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
      ), 0) as daily_revenue
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    INNER JOIN apartamento a ON aps.id_apartamento = a.id
    INNER JOIN categoriaapartamento ca_apt ON a.id_categoriaapartamento = ca_apt.id
    LEFT JOIN receita_consumo rc ON la.id_apartamentostate = rc.id_locacao
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'
      AND la.datainicialdaocupacao <= '${endTimestamp}'
      AND la.fimocupacaotipo = 'FINALIZADA'
      AND ca_apt.id IN (${categoryIds})
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
 */
export function getTrevparByDateSQL(
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
      GROUP BY la.id_apartamentostate
    )
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END as date,
      COALESCE(SUM(
        COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
        COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) +
        COALESCE(rc.valor_consumo_bruto, 0) -
        COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0) +
        COALESCE(CAST(la.gorjeta AS DECIMAL(15,4)), 0)
      ), 0) / ${totalSuites} as trevpar
    FROM locacaoapartamento la
    INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
    INNER JOIN apartamento a ON aps.id_apartamento = a.id
    INNER JOIN categoriaapartamento ca_apt ON a.id_categoriaapartamento = ca_apt.id
    LEFT JOIN receita_consumo rc ON la.id_apartamentostate = rc.id_locacao
    WHERE la.datainicialdaocupacao >= '${startTimestamp}'
      AND la.datainicialdaocupacao <= '${endTimestamp}'
      AND la.fimocupacaotipo = 'FINALIZADA'
      AND ca_apt.id IN (${categoryIds})
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

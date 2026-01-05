/**
 * Queries SQL para cálculo de KPIs de Bookings
 * Cada query é parametrizada para aceitar datas
 *
 * IMPORTANTE: O dia operacional começa às 06:00:00 e termina às 05:59:59 do dia seguinte
 * Para reservas: id_tipoorigemreserva IN (7, 8) usa datainicio, outros usa dataatendimento
 * Guia Go (id_tipoorigemreserva = 3 e reserva_programada_guia = false) aplica desconto_reserva
 */

import { UnitKey } from '../../database/database.interfaces';

/**
 * Formata data DD/MM/YYYY para YYYY-MM-DD HH:mm:ss
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
 * Query para BigNumbers de Bookings - totais do período
 * Retorna: totalValue, totalBookings, totalRevenue (para representatividade)
 */
export function getBookingsBigNumbersSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    WITH booking_data AS (
      SELECT
        CASE
          WHEN r."id_tipoorigemreserva" = 3 AND r."reserva_programada_guia" = false THEN
            r."valorcontratado" - COALESCE(r."desconto_reserva", 0)
          ELSE
            r."valorcontratado"
        END AS valor_efetivo
      FROM "reserva" r
      WHERE r."cancelada" IS NULL
        AND r."valorcontratado" IS NOT NULL
        AND (
          (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${startTimestamp}' AND '${endTimestamp}')
          OR
          (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}')
        )
    ),
    vendas_diretas AS (
      SELECT COALESCE(SUM((sei."precovenda" * sei."quantidade") - COALESCE(v."desconto", 0)), 0) AS total
      FROM "saidaestoqueitem" sei
      JOIN "saidaestoque" se ON sei."id_saidaestoque" = se."id"
      JOIN "vendadireta" vd ON se."id" = vd."id_saidaestoque"
      LEFT JOIN "venda" v ON se."id" = v."id_saidaestoque"
      WHERE se."datasaida" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
        AND sei."cancelado" IS NULL
        AND sei."tipoprecovenda" IS NOT NULL
    ),
    locacoes AS (
      SELECT COALESCE(SUM(la."valortotal"), 0) AS total
      FROM "locacaoapartamento" la
      JOIN "apartamentostate" ast ON la."id_apartamentostate" = ast."id"
      WHERE ast."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
        AND la."fimocupacaotipo" = 'FINALIZADA'
    )
    SELECT
      ROUND(COALESCE(SUM(bd.valor_efetivo), 0)::numeric, 2) AS total_booking_value,
      COUNT(*) AS total_bookings,
      ROUND((COALESCE((SELECT total FROM vendas_diretas), 0) + COALESCE((SELECT total FROM locacoes), 0))::numeric, 2) AS total_revenue
    FROM booking_data bd
  `;
}

/**
 * Query para Faturamento de Reservas por data
 */
export function getBillingByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    SELECT
      CASE
        WHEN r."id_tipoorigemreserva" IN (7, 8) THEN
          CASE
            WHEN EXTRACT(HOUR FROM r."datainicio") >= 6 THEN DATE(r."datainicio")
            ELSE DATE(r."datainicio" - INTERVAL '1 day')
          END
        ELSE
          CASE
            WHEN EXTRACT(HOUR FROM r."dataatendimento") >= 6 THEN DATE(r."dataatendimento")
            ELSE DATE(r."dataatendimento" - INTERVAL '1 day')
          END
      END as date,
      ROUND(SUM(
        CASE
          WHEN r."id_tipoorigemreserva" = 3 AND r."reserva_programada_guia" = false THEN
            r."valorcontratado" - COALESCE(r."desconto_reserva", 0)
          ELSE
            r."valorcontratado"
        END
      )::numeric, 2) AS total_value,
      COUNT(*) AS total_bookings
    FROM "reserva" r
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND (
        (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${startTimestamp}' AND '${endTimestamp}')
        OR
        (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}')
      )
    GROUP BY CASE
      WHEN r."id_tipoorigemreserva" IN (7, 8) THEN
        CASE
          WHEN EXTRACT(HOUR FROM r."datainicio") >= 6 THEN DATE(r."datainicio")
          ELSE DATE(r."datainicio" - INTERVAL '1 day')
        END
      ELSE
        CASE
          WHEN EXTRACT(HOUR FROM r."dataatendimento") >= 6 THEN DATE(r."dataatendimento")
          ELSE DATE(r."dataatendimento" - INTERVAL '1 day')
        END
      END
    ORDER BY date
  `;
}

/**
 * Query para Ecommerce BigNumbers (canal 4 = RESERVA_API - WEBSITE_IMMEDIATE + WEBSITE_SCHEDULED)
 */
export function getEcommerceBigNumbersSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    WITH booking_data AS (
      SELECT
        CASE
          WHEN r."id_tipoorigemreserva" = 3 AND r."reserva_programada_guia" = false THEN
            r."valorcontratado" - COALESCE(r."desconto_reserva", 0)
          ELSE
            r."valorcontratado"
        END AS valor_efetivo
      FROM "reserva" r
      WHERE r."cancelada" IS NULL
        AND r."valorcontratado" IS NOT NULL
        AND r."id_tipoorigemreserva" = 4
        AND (
          (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${startTimestamp}' AND '${endTimestamp}')
          OR
          (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}')
        )
    ),
    total_revenue AS (
      SELECT
        COALESCE((
          SELECT SUM((sei."precovenda" * sei."quantidade") - COALESCE(v."desconto", 0))
          FROM "saidaestoqueitem" sei
          JOIN "saidaestoque" se ON sei."id_saidaestoque" = se."id"
          JOIN "vendadireta" vd ON se."id" = vd."id_saidaestoque"
          LEFT JOIN "venda" v ON se."id" = v."id_saidaestoque"
          WHERE se."datasaida" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
            AND sei."cancelado" IS NULL
            AND sei."tipoprecovenda" IS NOT NULL
        ), 0) +
        COALESCE((
          SELECT SUM(la."valortotal")
          FROM "locacaoapartamento" la
          JOIN "apartamentostate" ast ON la."id_apartamentostate" = ast."id"
          WHERE ast."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
            AND la."fimocupacaotipo" = 'FINALIZADA'
        ), 0) AS total
    )
    SELECT
      ROUND(COALESCE(SUM(bd.valor_efetivo), 0)::numeric, 2) AS total_ecommerce_value,
      COUNT(*) AS total_ecommerce_bookings,
      (SELECT total FROM total_revenue) AS total_revenue
    FROM booking_data bd
  `;
}

/**
 * Query para Ecommerce por data (canal 4 = RESERVA_API)
 */
export function getEcommerceByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(startDate, endDate);

  return `
    SELECT
      CASE
        WHEN r."id_tipoorigemreserva" IN (7, 8) THEN
          CASE
            WHEN EXTRACT(HOUR FROM r."datainicio") >= 6 THEN DATE(r."datainicio")
            ELSE DATE(r."datainicio" - INTERVAL '1 day')
          END
        ELSE
          CASE
            WHEN EXTRACT(HOUR FROM r."dataatendimento") >= 6 THEN DATE(r."dataatendimento")
            ELSE DATE(r."dataatendimento" - INTERVAL '1 day')
          END
      END as date,
      ROUND(SUM(
        CASE
          WHEN r."id_tipoorigemreserva" = 3 AND r."reserva_programada_guia" = false THEN
            r."valorcontratado" - COALESCE(r."desconto_reserva", 0)
          ELSE
            r."valorcontratado"
        END
      )::numeric, 2) AS total_value,
      COUNT(*) AS total_bookings
    FROM "reserva" r
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND r."id_tipoorigemreserva" = 4
      AND (
        (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${startTimestamp}' AND '${endTimestamp}')
        OR
        (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}')
      )
    GROUP BY CASE
      WHEN r."id_tipoorigemreserva" IN (7, 8) THEN
        CASE
          WHEN EXTRACT(HOUR FROM r."datainicio") >= 6 THEN DATE(r."datainicio")
          ELSE DATE(r."datainicio" - INTERVAL '1 day')
        END
      ELSE
        CASE
          WHEN EXTRACT(HOUR FROM r."dataatendimento") >= 6 THEN DATE(r."dataatendimento")
          ELSE DATE(r."dataatendimento" - INTERVAL '1 day')
        END
      END
    ORDER BY date
  `;
}

/**
 * Queries SQL para cálculo de KPIs de Bookings
 * Cada query é parametrizada para aceitar datas
 *
 * IMPORTANTE: O dia operacional começa às 06:00:00 e termina às 05:59:59 do dia seguinte
 * Para reservas: id_tipoorigemreserva IN (7, 8) usa datainicio, outros usa dataatendimento
 * Guia Go (id_tipoorigemreserva = 3 e reserva_programada_guia = false) aplica desconto_reserva
 */

import { UnitKey } from '../../database/database.interfaces';
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
 * Query para BigNumbers de Bookings - totais do período
 * Usa mesma lógica do serviço individual: calcula valores por canal e soma
 * Para WEBSITE (id=4), usa novo_lancamento com versao=0 e tipolancamento='RESERVA'
 * Retorna: totalValue, totalBookings, totalRevenue (para representatividade)
 */
export function getBookingsBigNumbersSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const formattedStart = formatDateForSQL(startDate);
  const formattedEnd = formatDateForSQL(endDate);
  const startTimestamp = `${formattedStart} 00:00:00`;
  const endTimestamp = `${formattedEnd} 23:59:59`;

  return `
    WITH reservas_base AS (
      SELECT
        r."id",
        r."id_tipoorigemreserva",
        r."reserva_programada_guia",
        COALESCE(r."valorcontratado", la."valortotalpermanencia") as valor_base,
        COALESCE(r."desconto_reserva", 0) as desconto
      FROM "reserva" r
      LEFT JOIN "locacaoapartamento" la ON r."id_locacaoapartamento" = la."id_apartamentostate"
      WHERE (
          r."cancelada" IS NULL
          OR r."cancelada"::date > (r."datainicio"::date + 7)
        )
        AND (r."valorcontratado" IS NOT NULL OR la."valortotalpermanencia" IS NOT NULL)
        AND r."dataatendimento" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
    ),
    valores_outros_canais AS (
      SELECT
        rb."id",
        CASE
          WHEN rb."id_tipoorigemreserva" = 3 AND rb."reserva_programada_guia" = false THEN
            rb.valor_base - rb.desconto
          ELSE
            rb.valor_base
        END AS valor
      FROM reservas_base rb
      WHERE rb."id_tipoorigemreserva" != 4
    ),
    valores_website AS (
      SELECT
        rb."id",
        COALESCE(SUM(nl."valor"), 0) AS valor
      FROM reservas_base rb
      JOIN "novo_lancamento" nl ON rb."id" = nl."id_originado"
      WHERE rb."id_tipoorigemreserva" = 4
        AND nl."versao" = 0
        AND nl."dataexclusao" IS NULL
        AND nl."tipolancamento" = 'RESERVA'
      GROUP BY rb."id"
    ),
    todos_valores AS (
      SELECT "id", valor FROM valores_outros_canais
      UNION ALL
      SELECT "id", valor FROM valores_website
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
      ROUND(COALESCE(SUM(tv.valor), 0)::numeric, 2) AS total_booking_value,
      COUNT(DISTINCT tv."id") AS total_bookings,
      ROUND((COALESCE((SELECT total FROM vendas_diretas), 0) + COALESCE((SELECT total FROM locacoes), 0))::numeric, 2) AS total_revenue
    FROM todos_valores tv
  `;
}

/**
 * Query para Faturamento de Reservas por data
 * Usa mesma lógica do serviço individual: DATE(dataatendimento) sem ajuste de 6h
 * Para WEBSITE (id=4), usa novo_lancamento com versao=0 e tipolancamento='RESERVA'
 */
export function getBillingByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const formattedStart = formatDateForSQL(startDate);
  const formattedEnd = formatDateForSQL(endDate);
  const startTimestamp = `${formattedStart} 00:00:00`;
  const endTimestamp = `${formattedEnd} 23:59:59`;

  return `
    WITH reservas_base AS (
      SELECT
        r."id",
        r."id_tipoorigemreserva",
        r."dataatendimento",
        r."reserva_programada_guia",
        COALESCE(r."valorcontratado", la."valortotalpermanencia") as valor_base,
        COALESCE(r."desconto_reserva", 0) as desconto
      FROM "reserva" r
      LEFT JOIN "locacaoapartamento" la ON r."id_locacaoapartamento" = la."id_apartamentostate"
      WHERE (
          r."cancelada" IS NULL
          OR r."cancelada"::date > (r."datainicio"::date + 7)
        )
        AND (r."valorcontratado" IS NOT NULL OR la."valortotalpermanencia" IS NOT NULL)
        AND r."dataatendimento" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
        AND DATE(r."dataatendimento") BETWEEN DATE('${formattedStart}') AND DATE('${formattedEnd}')
    ),
    valores_outros_canais AS (
      SELECT
        rb."id",
        DATE(rb."dataatendimento") as date,
        CASE
          WHEN rb."id_tipoorigemreserva" = 3 AND rb."reserva_programada_guia" = false THEN
            rb.valor_base - rb.desconto
          ELSE
            rb.valor_base
        END AS valor
      FROM reservas_base rb
      WHERE rb."id_tipoorigemreserva" != 4
    ),
    valores_website AS (
      SELECT
        rb."id",
        DATE(rb."dataatendimento") as date,
        COALESCE(SUM(nl."valor"), 0) AS valor
      FROM reservas_base rb
      JOIN "novo_lancamento" nl ON rb."id" = nl."id_originado"
      WHERE rb."id_tipoorigemreserva" = 4
        AND nl."versao" = 0
        AND nl."dataexclusao" IS NULL
        AND nl."tipolancamento" = 'RESERVA'
      GROUP BY rb."id", DATE(rb."dataatendimento")
    ),
    todos_valores AS (
      SELECT "id", date, valor FROM valores_outros_canais
      UNION ALL
      SELECT "id", date, valor FROM valores_website
    )
    SELECT
      date,
      ROUND(SUM(valor)::numeric, 2) AS total_value,
      COUNT(DISTINCT "id") AS total_bookings
    FROM todos_valores
    GROUP BY date
    ORDER BY date
  `;
}

/**
 * Query para Ecommerce BigNumbers (canal 4 = RESERVA_API - WEBSITE_IMMEDIATE + WEBSITE_SCHEDULED)
 * Usa novo_lancamento com versao=0 e tipolancamento='RESERVA' para obter valores corretos
 */
export function getEcommerceBigNumbersSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const formattedStart = formatDateForSQL(startDate);
  const formattedEnd = formatDateForSQL(endDate);
  const startTimestamp = `${formattedStart} 00:00:00`;
  const endTimestamp = `${formattedEnd} 23:59:59`;

  return `
    WITH reservas_website AS (
      SELECT
        r."id"
      FROM "reserva" r
      LEFT JOIN "locacaoapartamento" la ON r."id_locacaoapartamento" = la."id_apartamentostate"
      WHERE (
          r."cancelada" IS NULL
          OR r."cancelada"::date > (r."datainicio"::date + 7)
        )
        AND (r."valorcontratado" IS NOT NULL OR la."valortotalpermanencia" IS NOT NULL)
        AND r."id_tipoorigemreserva" = 4
        AND r."dataatendimento" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
    ),
    valores_website AS (
      SELECT
        rw."id",
        COALESCE(SUM(nl."valor"), 0) AS valor
      FROM reservas_website rw
      JOIN "novo_lancamento" nl ON rw."id" = nl."id_originado"
      WHERE nl."versao" = 0
        AND nl."dataexclusao" IS NULL
        AND nl."tipolancamento" = 'RESERVA'
      GROUP BY rw."id"
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
      ROUND(COALESCE(SUM(vw.valor), 0)::numeric, 2) AS total_ecommerce_value,
      COUNT(DISTINCT vw."id") AS total_ecommerce_bookings,
      (SELECT total FROM total_revenue) AS total_revenue
    FROM valores_website vw
  `;
}

/**
 * Query para Ecommerce por data (canal 4 = RESERVA_API)
 * Usa novo_lancamento com versao=0 e tipolancamento='RESERVA' para obter valores corretos
 */
export function getEcommerceByDateSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const formattedStart = formatDateForSQL(startDate);
  const formattedEnd = formatDateForSQL(endDate);
  const startTimestamp = `${formattedStart} 00:00:00`;
  const endTimestamp = `${formattedEnd} 23:59:59`;

  return `
    WITH reservas_website AS (
      SELECT
        r."id",
        r."dataatendimento"
      FROM "reserva" r
      LEFT JOIN "locacaoapartamento" la ON r."id_locacaoapartamento" = la."id_apartamentostate"
      WHERE (
          r."cancelada" IS NULL
          OR r."cancelada"::date > (r."datainicio"::date + 7)
        )
        AND (r."valorcontratado" IS NOT NULL OR la."valortotalpermanencia" IS NOT NULL)
        AND r."id_tipoorigemreserva" = 4
        AND r."dataatendimento" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
        AND DATE(r."dataatendimento") BETWEEN DATE('${formattedStart}') AND DATE('${formattedEnd}')
    ),
    valores_website AS (
      SELECT
        rw."id",
        DATE(rw."dataatendimento") as date,
        COALESCE(SUM(nl."valor"), 0) AS valor
      FROM reservas_website rw
      JOIN "novo_lancamento" nl ON rw."id" = nl."id_originado"
      WHERE nl."versao" = 0
        AND nl."dataexclusao" IS NULL
        AND nl."tipolancamento" = 'RESERVA'
      GROUP BY rw."id", DATE(rw."dataatendimento")
    )
    SELECT
      date,
      ROUND(SUM(valor)::numeric, 2) AS total_value,
      COUNT(DISTINCT "id") AS total_bookings
    FROM valores_website
    GROUP BY date
    ORDER BY date
  `;
}

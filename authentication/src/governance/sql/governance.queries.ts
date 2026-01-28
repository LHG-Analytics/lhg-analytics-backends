/**
 * Queries SQL para cálculo de KPIs de Governance
 * Cada query é parametrizada para aceitar datas
 *
 * IMPORTANTE: O dia operacional começa às 06:00:00 e termina às 05:59:59 do dia seguinte
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
 * Query para BigNumbers de Governance - totais de limpezas e vistorias
 */
export function getGovernanceBigNumbersSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );

  return `
    WITH cleanings AS (
      SELECT COUNT(*)::INT AS total_cleanings
      FROM "limpezaapartamento" l
      JOIN "funcionario" f ON f."id" = l."id_funcionario"
      WHERE l."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
        AND l."datafim" IS NOT NULL
        AND l."motivofim" = 'COMPLETA'
        AND f."id_cargo" IN (4, 45, 7, 13)
    ),
    inspections AS (
      SELECT COUNT(*)::INT AS total_inspections
      FROM "vistoriaapartamento" va
      JOIN "usuario" u ON u."id" = va."id_responsavel"
      JOIN "funcionario" f ON f."id" = u."id_funcionario"
      WHERE va."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
        AND va."motivofim" = 'APROVADA'
        AND f."id_cargo" IN (24, 6, 19, 2)
    )
    SELECT
      c.total_cleanings,
      i.total_inspections
    FROM cleanings c, inspections i
  `;
}

/**
 * Query para limpezas por turno (total por turno)
 */
export function getShiftCleaningSQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );

  return `
    WITH shift_data AS (
      SELECT
        CASE
          WHEN f."id" IN (998548, 1047691, 1047692) THEN 'Terceirizado'
          WHEN f."horarioinicioexpediente" BETWEEN '06:00' AND '10:59' THEN 'Manhã'
          WHEN f."horarioinicioexpediente" BETWEEN '11:00' AND '18:59' THEN 'Tarde'
          WHEN f."horarioinicioexpediente" BETWEEN '19:00' AND '23:59' THEN 'Noite'
          ELSE 'Terceirizado'
        END AS shift
      FROM "limpezaapartamento" l
      JOIN "funcionario" f ON f."id" = l."id_funcionario"
      WHERE l."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
        AND l."datafim" IS NOT NULL
        AND l."motivofim" = 'COMPLETA'
        AND f."id_cargo" IN (4, 45, 7, 13)
    )
    SELECT
      shift AS name,
      COUNT(*)::INT AS value
    FROM shift_data
    GROUP BY shift
    ORDER BY
      CASE shift
        WHEN 'Manhã' THEN 1
        WHEN 'Tarde' THEN 2
        WHEN 'Noite' THEN 3
        WHEN 'Terceirizado' THEN 4
      END
  `;
}

/**
 * Query para limpezas por turno agrupadas por dia
 * Retorna os dados de limpeza por dia e turno para o período selecionado
 */
export function getShiftCleaningByDaySQL(
  unit: UnitKey,
  startDate: string,
  endDate: string,
): string {
  const { startTimestamp, endTimestamp } = getDateRangeWithCutoff(
    startDate,
    endDate,
  );
  // Converte endDate para YYYY-MM-DD para filtrar o operational_date
  const [day, month, year] = endDate.split('/').map(Number);
  const endDateISO = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

  return `
    WITH shift_data AS (
      SELECT
        -- Determina o dia operacional (se horário < 06:00, conta como dia anterior)
        CASE
          WHEN EXTRACT(HOUR FROM l."datainicio") < 6
          THEN (l."datainicio" - INTERVAL '1 hour')::DATE
          ELSE l."datainicio"::DATE
        END AS operational_date,
        CASE
          WHEN f."id" IN (998548, 1047691, 1047692) THEN 'Terceirizado'
          WHEN f."horarioinicioexpediente" BETWEEN '06:00' AND '10:59' THEN 'Manhã'
          WHEN f."horarioinicioexpediente" BETWEEN '11:00' AND '18:59' THEN 'Tarde'
          WHEN f."horarioinicioexpediente" BETWEEN '19:00' AND '23:59' THEN 'Noite'
          ELSE 'Terceirizado'
        END AS shift
      FROM "limpezaapartamento" l
      JOIN "funcionario" f ON f."id" = l."id_funcionario"
      WHERE l."datainicio" BETWEEN '${startTimestamp}' AND '${endTimestamp}'
        AND l."datafim" IS NOT NULL
        AND l."motivofim" = 'COMPLETA'
        AND f."id_cargo" IN (4, 45, 7, 13)
    )
    SELECT
      TO_CHAR(operational_date, 'DD/MM/YYYY') AS date,
      shift,
      COUNT(*)::INT AS value
    FROM shift_data
    WHERE shift IN ('Manhã', 'Tarde', 'Noite')
      -- Filtra operational_date para não incluir datas além do período selecionado
      AND operational_date <= '${endDateISO}'::DATE
    GROUP BY operational_date, shift
    ORDER BY operational_date,
      CASE shift
        WHEN 'Manhã' THEN 1
        WHEN 'Tarde' THEN 2
        WHEN 'Noite' THEN 3
      END
  `;
}

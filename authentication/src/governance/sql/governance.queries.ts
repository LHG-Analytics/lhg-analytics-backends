/**
 * Queries SQL para cálculo de KPIs de Governance
 * Cada query é parametrizada para aceitar datas
 *
 * IMPORTANTE: O dia operacional começa às 06:00:00 e termina às 05:59:59 do dia seguinte
 */

import { UnitKey } from '../../database/database.interfaces';

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
        AND f."id_cargo" IN (24, 6)
    )
    SELECT
      c.total_cleanings,
      i.total_inspections
    FROM cleanings c, inspections i
  `;
}

/**
 * Query para limpezas por turno
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

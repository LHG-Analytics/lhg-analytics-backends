import { Prisma } from '@client-local';
import { Injectable } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { CachePeriodEnum } from '../cache/cache.interfaces';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GovernanceService {
  constructor(
    private prisma: PrismaService,
    private kpiCacheService: KpiCacheService,
  ) {}

  async calculateKpibyDateRangeSQL(startDate: Date, endDate: Date): Promise<any> {
    // Calcula o período anterior automaticamente
    const startMoment = moment(startDate);
    const endMoment = moment(endDate);
    const daysDiff = endMoment.diff(startMoment, 'days') + 1; // +1 porque inclui ambos os dias

    // Período anterior: mesmo número de dias, terminando no dia anterior ao startDate
    const previousEndDate = startMoment.clone().subtract(1, 'day').toDate();
    const previousStartDate = moment(previousEndDate)
      .subtract(daysDiff - 1, 'days')
      .toDate();

    // Busca período atual com cache
    const currentResult = await this.kpiCacheService.getOrCalculate(
      'governance',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpibyDateRangeSQLInternal(startDate, endDate),
      { start: startDate, end: endDate },
    );

    // Busca período anterior com cache
    const previousResult = await this.kpiCacheService.getOrCalculate(
      'governance',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpibyDateRangeSQLInternal(previousStartDate, previousEndDate),
      { start: previousStartDate, end: previousEndDate },
    );

    const currentData = currentResult.data;
    const previousData = previousResult.data;

    // Extrair BigNumbers dos períodos
    const currentBigNumbers = currentData.BigNumbers[0];
    const previousBigNumbers = previousData.BigNumbers[0];

    // Calcular previsão mensal (monthlyForecast)
    const nowForForecast = moment.tz('America/Sao_Paulo');
    const currentMonthStart = nowForForecast.clone().startOf('month');
    const currentMonthEnd = nowForForecast.clone().endOf('month');
    const todayForForecast = nowForForecast.clone().startOf('day');
    const yesterday = todayForForecast.clone().subtract(1, 'day');

    // Dias do mês
    const totalDaysInMonth = currentMonthEnd.date();
    const daysElapsed = yesterday.date();
    const remainingDays = totalDaysInMonth - daysElapsed;

    // Buscar dados do mês atual para forecast (do dia 1 até ontem)
    const monthStartDate = currentMonthStart
      .clone()
      .set({ hour: 6, minute: 0, second: 0 })
      .toDate();
    const monthEndDate = yesterday
      .clone()
      .set({ hour: 5, minute: 59, second: 59 })
      .add(1, 'day')
      .toDate();

    // Busca dados do mês com cache
    const monthlyResult = await this.kpiCacheService.getOrCalculate(
      'governance',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpibyDateRangeSQLInternal(monthStartDate, monthEndDate),
      { start: monthStartDate, end: monthEndDate },
    );

    const monthlyData = monthlyResult.data;
    const monthlyBigNumbers = monthlyData.BigNumbers[0];

    // Calcular forecast
    let monthlyForecast: any = undefined;

    if (daysElapsed > 0) {
      const monthlyTotalCleanings = monthlyBigNumbers.currentDate.totalAllSuitesCleanings;
      const monthlyTotalInspections = monthlyBigNumbers.currentDate.totalAllInspections;

      // Média diária
      const dailyAverageCleanings = monthlyTotalCleanings / daysElapsed;
      const dailyAverageInspections = monthlyTotalInspections / daysElapsed;

      // Projeções
      const forecastCleanings = monthlyTotalCleanings + dailyAverageCleanings * remainingDays;
      const forecastInspections = monthlyTotalInspections + dailyAverageInspections * remainingDays;
      const forecastAverageDailyCleaning = forecastCleanings / totalDaysInMonth;

      monthlyForecast = {
        totalAllSuitesCleaningsForecast: Math.round(forecastCleanings),
        totalAllAverageDailyCleaningForecast: Number(forecastAverageDailyCleaning.toFixed(2)),
        totalAllInspectionsForecast: Math.round(forecastInspections),
      };
    }

    // Montar BigNumbers com previousDate e monthlyForecast
    const combinedBigNumbers = {
      currentDate: currentBigNumbers.currentDate,
      previousDate: {
        totalAllSuitesCleaningsPreviousData: previousBigNumbers.currentDate.totalAllSuitesCleanings,
        totalAllAverageDailyCleaningPreviousData:
          previousBigNumbers.currentDate.totalAllAverageDailyCleaning,
        totalAllInspectionsPreviousData: previousBigNumbers.currentDate.totalAllInspections,
      },
      monthlyForecast,
    };

    // Retornar dados do período atual com BigNumbers combinado
    return {
      ...currentData,
      BigNumbers: [combinedBigNumbers],
    };
  }

  /**
   * Método interno que faz o cálculo real dos KPIs de Governança
   * Chamado pelo cache service quando há cache miss
   */
  private async _calculateKpibyDateRangeSQLInternal(startDate: Date, endDate: Date): Promise<any> {
    const formattedStart = moment
      .utc(startDate)
      .set({ hour: 6, minute: 0, second: 0 })
      .format('YYYY-MM-DD HH:mm:ss');

    const formattedEnd = moment
      .utc(endDate)
      .set({ hour: 5, minute: 59, second: 59 })
      .format('YYYY-MM-DD HH:mm:ss');

    type TeamSizingRow = {
      shift: string;
      total_average_shift_cleaning: number;
      ideal_shift_maid: number;
      real_shift_maid: number;
      difference: number;
      weekdays_stats: Record<string, { totalCleanings: number; averageDailyWeekCleaning: number }>;
    };

    const totalSuitesCleanedSql = `
  SELECT
    COUNT(*)::INT AS "totalSuitesCleaned"
  FROM "limpezaapartamento" l
  JOIN "funcionario" f ON f."id" = l."id_funcionario"
  WHERE l."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND l."datafim" IS NOT NULL
    AND l."motivofim" = 'COMPLETA'
    AND f."id_cargo" IN (4,20)
`;

    const totalInspectionsSql = `
  SELECT
    COUNT(*)::INT AS "totalInspections"
  FROM "vistoriaapartamento" va
  JOIN "usuario" u ON u."id" = va."id_responsavel"
  JOIN "funcionario" f ON f."id" = u."id_funcionario"
  WHERE va."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND va."motivofim" = 'APROVADA'
    AND f."id_cargo" = 2
`;

    const supervisorPerformanceSQL = `
  SELECT
    p."nome" AS name,
    COUNT(*)::INT AS value
  FROM "vistoriaapartamento" va
  JOIN "usuario" u ON u."id" = va."id_responsavel"
  JOIN "funcionario" f ON f."id" = u."id_funcionario"
  JOIN "pessoapapel" pp ON pp."id" = f."id"
  JOIN "pessoa" p ON p."id" = pp."id_pessoa"
  WHERE va."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND va."motivofim" = 'APROVADA'
    AND f."id_cargo" = 2
  GROUP BY p."nome"
  ORDER BY value DESC;
`;

    const shiftCleaningSQL = `
  WITH shift_data AS (
    SELECT
      CASE
        WHEN f."id" IN (164628, 164629, 164630) THEN 'Terceirizado'
        WHEN f."horarioinicioexpediente" BETWEEN '06:00' AND '10:59' THEN 'Manhã'
        WHEN f."horarioinicioexpediente" BETWEEN '11:00' AND '18:59' THEN 'Tarde'
        WHEN f."horarioinicioexpediente" BETWEEN '19:00' AND '23:59' THEN 'Noite'
        ELSE 'Terceirizado'
      END AS shift
    FROM "limpezaapartamento" l
    JOIN "funcionario" f ON f."id" = l."id_funcionario"
    WHERE l."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
      AND l."datafim" IS NOT NULL
      AND l."motivofim" = 'COMPLETA'
      AND f."id_cargo" IN (4, 20)
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
    END;
`;

    const cleaningsByPeriodSql = `
 SELECT
  TO_CHAR(l."datainicio" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
  COUNT(*)::INT AS "totalCleanings"
FROM "limpezaapartamento" l
JOIN "funcionario" f ON f."id" = l."id_funcionario"
WHERE l."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
  AND l."datafim" IS NOT NULL
  AND l."motivofim" = 'COMPLETA'
  AND f."id_cargo" IN (4, 20)
GROUP BY "date"
ORDER BY "date" ASC;
`;

    const cleaningsByPeriodShiftSql = `
WITH cleaning_data AS (
  SELECT
    TO_CHAR(l."datainicio" - INTERVAL '6 hours', 'YYYY-MM-DD') AS date,
    CASE
      WHEN f."horarioinicioexpediente" BETWEEN '06:00' AND '10:59' THEN 'Manhã'
      WHEN f."horarioinicioexpediente" BETWEEN '11:00' AND '18:59' THEN 'Tarde'
      WHEN f."horarioinicioexpediente" BETWEEN '19:00' AND '23:59' THEN 'Noite'
      ELSE 'Terceirizado'
    END AS shift,
    ppessoa."nome" AS employee_name
  FROM "limpezaapartamento" l
  JOIN "funcionario" f ON f."id" = l."id_funcionario"
  JOIN "pessoapapel" pp ON pp."id" = f."id"
  JOIN "pessoa" ppessoa ON ppessoa."id" = pp."id_pessoa"
  WHERE l."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND l."datafim" IS NOT NULL
    AND l."motivofim" = 'COMPLETA'
    AND f."id_cargo" IN (4, 20)
)
SELECT
  date,
  shift,
  employee_name,
  COUNT(*)::INT AS total_cleanings
FROM cleaning_data
GROUP BY date, shift, employee_name
ORDER BY
  date,
  CASE shift
    WHEN 'Manhã' THEN 1
    WHEN 'Tarde' THEN 2
    WHEN 'Noite' THEN 3
    ELSE 4
  END,
  employee_name;
`;

    const employeeReportSql = `
  WITH shift_data AS (
    SELECT
      CASE
        WHEN f."horarioinicioexpediente" BETWEEN '06:00' AND '10:59' THEN 'Manhã'
        WHEN f."horarioinicioexpediente" BETWEEN '11:00' AND '18:59' THEN 'Tarde'
        WHEN f."horarioinicioexpediente" BETWEEN '19:00' AND '23:59' THEN 'Noite'
        ELSE 'Terceirizado'
      END AS shift,
      ppessoa."nome" AS employee_name,
      TO_CHAR(l."datainicio" - INTERVAL '6 hours', 'YYYY-MM-DD') AS adjusted_date
    FROM "limpezaapartamento" l
    JOIN "funcionario" f ON f."id" = l."id_funcionario"
    JOIN "pessoapapel" pp ON pp."id" = f."id"
    JOIN "pessoa" ppessoa ON ppessoa."id" = pp."id_pessoa"
    WHERE
      l."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
      AND l."datafim" IS NOT NULL
      AND l."motivofim" = 'COMPLETA'
      AND f."id_cargo" IN (4, 20)
      AND f."id_cargo" NOT IN (2)

  ),
  aggregated AS (
    SELECT
      shift,
      employee_name,
      COUNT(*) AS total_suites,
      COUNT(DISTINCT adjusted_date) AS total_days
    FROM shift_data
    GROUP BY shift, employee_name
  )
  SELECT
    shift,
    employee_name,
    total_suites,
    total_days,
    ROUND(total_suites::numeric / total_days, 2) AS average_daily_cleaning
  FROM aggregated
  ORDER BY
    CASE shift
      WHEN 'Manhã' THEN 1
      WHEN 'Tarde' THEN 2
      WHEN 'Noite' THEN 3
      WHEN 'Terceirizado' THEN 4
    END,
    employee_name;
`;

    const teamSizingSQL = `
WITH date_range AS (
  SELECT generate_series(
    '${formattedStart}'::date,
    '${formattedEnd}'::date,
    interval '1 day'
  )::date AS day
),
weekday_counts AS (
  SELECT
    LOWER(
      CASE EXTRACT(ISODOW FROM day)
        WHEN 1 THEN 'segunda'
        WHEN 2 THEN 'terca'
        WHEN 3 THEN 'quarta'
        WHEN 4 THEN 'quinta'
        WHEN 5 THEN 'sexta'
        WHEN 6 THEN 'sabado'
        WHEN 7 THEN 'domingo'
      END
    ) AS weekday,
    COUNT(*) AS occurrences
  FROM date_range
  GROUP BY weekday
),
shifted_cleanings AS (
  SELECT
    l.id,
    l."datainicio"::date AS dt_start,
    f."horarioinicioexpediente",
    CASE
      WHEN EXTRACT(HOUR FROM f."horarioinicioexpediente"::time) BETWEEN 6 AND 10 THEN 'Manhã'
      WHEN EXTRACT(HOUR FROM f."horarioinicioexpediente"::time) BETWEEN 11 AND 18 THEN 'Tarde'
      WHEN EXTRACT(HOUR FROM f."horarioinicioexpediente"::time) BETWEEN 19 AND 23 THEN 'Noite'
      ELSE 'Terceirizado'
    END AS shift,
    f.id AS employee_id
  FROM "limpezaapartamento" l
  JOIN "funcionario" f ON f.id = l."id_funcionario"
  WHERE l."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND l."datafim" IS NOT NULL
    AND l."motivofim" = 'COMPLETA'
    AND f."id_cargo" IN (4)
    AND f."horarioinicioexpediente" IS NOT NULL
    AND TRIM(f."horarioinicioexpediente") <> ''
    AND f."id" NOT IN (164635)
),
day_shift_totals AS (
  SELECT
    shift,
    dt_start AS day_date,
    COUNT(*) AS total_cleanings
  FROM shifted_cleanings
  GROUP BY shift, dt_start
),
weekdays AS (
  SELECT DISTINCT
    day_date,
    LOWER(
      CASE EXTRACT(ISODOW FROM day_date)
        WHEN 1 THEN 'segunda'
        WHEN 2 THEN 'terca'
        WHEN 3 THEN 'quarta'
        WHEN 4 THEN 'quinta'
        WHEN 5 THEN 'sexta'
        WHEN 6 THEN 'sabado'
        WHEN 7 THEN 'domingo'
      END
    ) AS weekday,
    CASE EXTRACT(ISODOW FROM day_date)
      WHEN 7 THEN 1 -- domingo
      WHEN 6 THEN 2 -- sabado
      WHEN 5 THEN 3 -- sexta
      WHEN 4 THEN 4 -- quinta
      WHEN 3 THEN 5 -- quarta
      WHEN 2 THEN 6 -- terca
      WHEN 1 THEN 7 -- segunda
    END AS weekday_order
  FROM day_shift_totals
),
shift_day_agg AS (
  SELECT
    s.shift,
    w.weekday,
    SUM(s.total_cleanings) AS total_cleanings,
    w.weekday_order
  FROM day_shift_totals s
  JOIN weekdays w ON s.day_date = w.day_date
  GROUP BY s.shift, w.weekday, w.weekday_order
),
shift_summary AS (
  SELECT
    shift,
    ROUND(AVG(total_cleanings)::numeric, 2) AS total_average_shift_cleaning
  FROM day_shift_totals
  GROUP BY shift
),
real_shift_maid_count AS (
  SELECT
    shift,
    COUNT(DISTINCT employee_id) AS real_shift_maid
  FROM shifted_cleanings
  GROUP BY shift
)
SELECT
  ss.shift,
  ss.total_average_shift_cleaning,
  -- Fórmula: ARREDONDAR.PARA.CIMA(Média Suítes ÷ 10) × 1,29
  -- Meta: 10 suítes/camareira/dia | Escala 6x1 + férias | Fator cobertura: 1,29 (365÷283 dias trabalhados)
  ROUND(CEIL(ss.total_average_shift_cleaning / 10.0) * 1.29)::int AS ideal_shift_maid,
  COALESCE(rsm.real_shift_maid, 0) AS real_shift_maid,
  COALESCE(rsm.real_shift_maid, 0) - (ROUND(CEIL(ss.total_average_shift_cleaning / 10.0) * 1.29)::int) AS difference,
  jsonb_object_agg(
    sda.weekday,
    jsonb_build_object(
      'totalCleanings', sda.total_cleanings,
      'averageDailyWeekCleaning', 
        ROUND(
          sda.total_cleanings::numeric / GREATEST(wc.occurrences, 1), 
          2
        )
    )
    ORDER BY sda.weekday_order
  ) FILTER (WHERE sda.weekday IS NOT NULL) AS weekdays_stats
FROM shift_summary ss
LEFT JOIN real_shift_maid_count rsm ON rsm.shift = ss.shift
LEFT JOIN shift_day_agg sda ON sda.shift = ss.shift
LEFT JOIN weekday_counts wc ON wc.weekday = sda.weekday
GROUP BY ss.shift, ss.total_average_shift_cleaning, rsm.real_shift_maid
ORDER BY
  CASE ss.shift
    WHEN 'Noite' THEN 1
    WHEN 'Tarde' THEN 2
    WHEN 'Manhã' THEN 3
    ELSE 4
  END;
`;

    const [
      cleaningTotalResultRaw,
      inspectionResult,
      supervisorPerformanceResult,
      shiftCleaningResult,
      rawCleaningPeriodResult,
      rawCleaningPeriodShiftResult,
      employeeReportRaw,
      teamSizingResult,
    ] = await Promise.all([
      this.prisma.prismaLocal.$queryRaw<{ totalSuitesCleaned: number }[]>(
        Prisma.sql([totalSuitesCleanedSql]),
      ),
      this.prisma.prismaLocal.$queryRaw<{ totalInspections: number }[]>(
        Prisma.sql([totalInspectionsSql]),
      ),
      this.prisma.prismaLocal.$queryRaw<{ name: string; value: number }[]>(
        Prisma.sql([supervisorPerformanceSQL]),
      ),
      this.prisma.prismaLocal.$queryRaw<{ name: string; value: number }[]>(
        Prisma.sql([shiftCleaningSQL]),
      ),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([cleaningsByPeriodSql])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([cleaningsByPeriodShiftSql])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([employeeReportSql])),
      this.prisma.prismaLocal.$queryRaw<TeamSizingRow[]>(Prisma.sql([teamSizingSQL])),
    ]);

    const orderedWeekdays = ['domingo', 'sabado', 'sexta', 'quinta', 'quarta', 'terca', 'segunda'];

    function reorderWeekdays(stats: Record<string, any>) {
      const reordered: Record<string, any> = {};

      for (const key of orderedWeekdays) {
        if (stats[key]) {
          reordered[key] = stats[key];
        }
      }

      return reordered;
    }

    const isMonthly = moment(endDate).diff(moment(startDate), 'days') > 31;

    const totalAllInspections = inspectionResult?.[0]?.totalInspections || 0;

    const supervisorsPerformanceFormatted = {
      categories: supervisorPerformanceResult.map((item) => item.name),
      series: supervisorPerformanceResult.map((item) => item.value),
    };

    const shiftCleaningFormatted = {
      categories: shiftCleaningResult.map((item) => item.name),
      series: shiftCleaningResult.map((item) => item.value),
    };

    const totalAllSuitesCleanings = cleaningTotalResultRaw?.[0]?.totalSuitesCleaned || 0;

    const accountingStart = moment.utc(startDate).set({ hour: 6, minute: 0, second: 0 });
    const accountingEnd = moment
      .utc(endDate)
      .add(1, 'day')
      .set({ hour: 5, minute: 59, second: 59 });
    const totalDays = accountingEnd.diff(accountingStart, 'days');

    const totalAllAverageDailyCleaning = totalDays > 0 ? totalAllSuitesCleanings / totalDays : 0;

    const bigNumbers = {
      currentDate: {
        totalAllSuitesCleanings: totalAllSuitesCleanings,
        totalAllAverageDailyCleaning: parseFloat(totalAllAverageDailyCleaning.toFixed(2)),
        totalAllInspections: totalAllInspections,
      },
    };

    const cleaningsGrouped = new Map<string, number>();

    for (const row of rawCleaningPeriodResult) {
      const dateKey = isMonthly
        ? moment(row.date, 'YYYY-MM-DD').format('YYYY-MM')
        : moment(row.date, 'YYYY-MM-DD').format('YYYY-MM-DD');

      const current = cleaningsGrouped.get(dateKey) || 0;
      cleaningsGrouped.set(dateKey, current + Number(row.totalCleanings));
    }

    const dateKeys = [...cleaningsGrouped.keys()].sort();

    const cleaningsByPeriod = {
      categories: dateKeys.map((key) =>
        isMonthly ? moment(key, 'YYYY-MM').format('MM/YYYY') : moment(key).format('DD/MM/YYYY'),
      ),
      series: dateKeys.map((key) => Number((cleaningsGrouped.get(key) || 0).toFixed(0))),
    };

    const shiftsMap: Record<string, Record<string, Record<string, number>>> = {}; // shift -> employee -> date -> count

    for (const { date, shift, employee_name, total_cleanings } of rawCleaningPeriodShiftResult) {
      const key = isMonthly
        ? moment(date, 'YYYY-MM-DD').format('YYYY-MM')
        : moment(date, 'YYYY-MM-DD').format('YYYY-MM-DD');

      if (!shiftsMap[shift]) shiftsMap[shift] = {};
      if (!shiftsMap[shift][employee_name]) shiftsMap[shift][employee_name] = {};
      shiftsMap[shift][employee_name][key] = total_cleanings;
    }

    // Usa os mesmos dateKeys já definidos anteriormente
    const cleaningsByPeriodShift = {
      categories: dateKeys.map((key) =>
        isMonthly ? moment(key, 'YYYY-MM').format('MM/YYYY') : moment(key).format('DD/MM/YYYY'),
      ),
      series: Object.entries(shiftsMap).reduce((acc, [shift, employees]) => {
        acc[shift] = Object.entries(employees).map(([employeeName, dateCounts]) => ({
          name: employeeName,
          data: dateKeys.map((dateKey) => dateCounts[dateKey] || 0),
        }));
        return acc;
      }, {}),
    };

    const employeeReport: Record<string, any[]> = {};

    for (const row of employeeReportRaw) {
      const shift = row.shift;
      if (!employeeReport[shift]) employeeReport[shift] = [];

      employeeReport[shift].push({
        employeeName: row.employee_name,
        totalSuitesCleanings: Number(row.total_suites),
        totalDaysWorked: Number(row.total_days),
        averageDailyCleaning: Number(row.average_daily_cleaning),
      });
    }

    const totals = {
      totalAverageDailyWeekCleaning: {},
      totalIdealShiftMaid: 0,
      totalRealShiftMaid: 0,
      totalDifference: 0,
      totalAllAverageShiftCleaning: 0,
    };

    const teamSizing: Record<string, any> = {};

    for (const row of teamSizingResult) {
      const shift = row.shift;
      const stats = row.weekdays_stats;

      const weekdaysOrdered = reorderWeekdays(stats);

      teamSizing[shift] = {
        totalAverageShiftCleaning: Number(row.total_average_shift_cleaning),
        idealShiftMaid: Number(row.ideal_shift_maid),
        realShiftMaid: Number(row.real_shift_maid),
        difference: Number(row.difference),
        ...weekdaysOrdered,
      };

      for (const [weekday, values] of Object.entries(weekdaysOrdered)) {
        if (!totals.totalAverageDailyWeekCleaning[weekday]) {
          totals.totalAverageDailyWeekCleaning[weekday] = 0;
        }

        totals.totalAverageDailyWeekCleaning[weekday] += Number(values.averageDailyWeekCleaning);
      }

      totals.totalIdealShiftMaid += Number(row.ideal_shift_maid);
      totals.totalRealShiftMaid += Number(row.real_shift_maid);
      totals.totalDifference += Number(row.difference);
      totals.totalAllAverageShiftCleaning += Number(row.total_average_shift_cleaning);
    }

    totals.totalAllAverageShiftCleaning = Number(totals.totalAllAverageShiftCleaning.toFixed(2));

    teamSizing['Totals'] = totals;

    Object.keys(totals.totalAverageDailyWeekCleaning).forEach((key) => {
      totals.totalAverageDailyWeekCleaning[key] = Number(
        totals.totalAverageDailyWeekCleaning[key].toFixed(2),
      );
    });

    return {
      Company: 'Tout',
      BigNumbers: [bigNumbers],
      SupervisorsPerformance: supervisorsPerformanceFormatted,
      ShiftCleaning: shiftCleaningFormatted,
      CleaningByDate: cleaningsByPeriod,
      EmployeeCleaningByShift: cleaningsByPeriodShift,
      EmployeeReport: employeeReport,
      TeamSizing: teamSizing,
    };
  }
}

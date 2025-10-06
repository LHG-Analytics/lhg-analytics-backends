import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { Moment } from 'moment-timezone';
import { PeriodEnum, Prisma } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';

// Definindo interfaces para melhor tipagem
interface CleaningData {
  employeeName: string;
  createdDate: Date;
  averageDailyCleaning: number;
  shift: string;
  totalDaysWorked: number;
  totalSuitesCleanings: number;
  totalAllSuitesCleanings: number;
  totalAllAverageDailyCleaning: number;
}

interface CleaningByDateAcc {
  [key: string]: { totalSuitesCleanings: number };
}

interface EmployeeData {
  name: string;
  data: number[];
}

export interface ShiftsData {
  [key: string]: EmployeeData[];
}

interface EmployeeReport {
  employeeName: string;
  totalSuitesCleanings: number;
  totalDaysWorked: number;
  averageDailyCleaning: number;
}

export interface EmployeeReportByShift {
  [shift: string]: EmployeeReport[];
}

@Injectable()
export class GovernanceService {
  constructor(private prisma: PrismaService) {}

  async findAllGovernance(period: PeriodEnum) {
    // Define o fuso horário padrão como São Paulo
    moment.tz.setDefault('America/Sao_Paulo');

    let startDate: moment.Moment,
      endDate: moment.Moment,
      startDatePrevious: moment.Moment,
      endDatePrevious: moment.Moment;

    // Obtém o horário atual em "America/Sao_Paulo" no início do dia
    const today = moment.tz('America/Sao_Paulo').set({
      hour: 5,
      minute: 59,
      second: 59,
      millisecond: 999,
    });

    // Define o `endDate` como o dia anterior às 05:59:59 no fuso horário local
    endDate = today.clone().subtract(1, 'day').set({
      hour: 5,
      minute: 59,
      second: 59,
      millisecond: 999,
    });

    // Calcula o `startDate` e os períodos anteriores com base no `period`
    switch (period) {
      case PeriodEnum.LAST_7_D:
        // Período atual: últimos 7 dias (considerando 7 dias completos)
        startDate = endDate.clone().subtract(6, 'days').set({
          hour: 5,
          minute: 59,
          second: 59,
          millisecond: 999,
        });

        // Período anterior: 7 dias antes do início do período atual
        startDatePrevious = startDate.clone().subtract(6, 'days');
        endDatePrevious = startDate.clone();
        break;

      case PeriodEnum.LAST_30_D:
        // Período atual: últimos 30 dias
        startDate = endDate.clone().subtract(29, 'days').set({
          hour: 5,
          minute: 59,
          second: 59,
          millisecond: 999,
        });

        // Período anterior: 30 dias antes do início do período atual
        startDatePrevious = startDate.clone().subtract(29, 'days');
        endDatePrevious = startDate.clone();
        break;

      case PeriodEnum.LAST_6_M:
        // Período atual: últimos 6 meses
        startDate = endDate.clone().subtract(6, 'months').set({
          hour: 5,
          minute: 59,
          second: 59,
          millisecond: 999,
        });

        // Período anterior: 6 meses antes do início do período atual
        startDatePrevious = startDate.clone().subtract(6, 'months');
        endDatePrevious = startDate.clone();
        break;

      default:
        throw new Error('Invalid period specified');
    }

    // Converte as datas para UTC sem alterar o horário configurado
    const startDateUTC = moment.tz(startDate, 'America/Sao_Paulo').utc(true).toDate();
    const endDateUTC = moment.tz(endDate, 'America/Sao_Paulo').utc(true).toDate();
    const startDatePreviousUTC = moment
      .tz(startDatePrevious, 'America/Sao_Paulo')
      .utc(true)
      .toDate();
    const endDatePreviousUTC = moment.tz(endDatePrevious, 'America/Sao_Paulo').utc(true).toDate();

    // Exibe as datas geradas
    console.log('startDate:', startDateUTC);
    console.log('endDate:', endDateUTC);
    console.log('startDatePrevious:', startDatePreviousUTC);
    console.log('endDatePrevious:', endDatePreviousUTC);

    // Consultas para buscar os dados de KPIs com base nas datas selecionadas
    const [
      cleanings,
      cleaningsPreviousData,
      cleaningsByPeriod,
      cleaningsByPeriodShift,
      cleaningsByWeek,
      inspections,
      inspectionsPreviousData,
    ] = await this.prisma.prismaOnline.$transaction([
      this.prisma.prismaOnline.cleanings.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDateUTC,
          },
        },
        select: {
          employeeName: true,
          createdDate: true,
          averageDailyCleaning: true,
          shift: true,
          totalDaysWorked: true,
          totalSuitesCleanings: true,
          totalAllSuitesCleanings: true,
          totalAllAverageDailyCleaning: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.cleanings.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePreviousUTC,
            lte: endDatePreviousUTC,
          },
        },
        select: {
          employeeName: true,
          createdDate: true,
          averageDailyCleaning: true,
          shift: true,
          totalDaysWorked: true,
          totalSuitesCleanings: true,
          totalAllSuitesCleanings: true,
          totalAllAverageDailyCleaning: true,
        },
        orderBy: {
          createdDate: 'asc',
        },
      }),
      this.prisma.prismaOnline.cleaningsByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDateUTC,
          },
        },
        select: {
          createdDate: true,
          totalSuitesCleanings: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.cleaningsByPeriodShift.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDateUTC,
          },
        },
        select: {
          createdDate: true,
          totalSuitesCleanings: true,
          employeeName: true,
          shift: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.cleaningsByWeek.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDateUTC,
          },
        },
        select: {
          averageDailyWeekCleaning: true,
          createdDate: true,
          difference: true,
          idealShiftMaid: true,
          realShiftMaid: true,
          shift: true,
          totalAverageDailyWeekCleaning: true,
          totalAverageShiftCleaning: true,
          totalDifference: true,
          totalIdealShiftMaid: true,
          totalRealShiftMaid: true,
          totalSuitesCleanings: true,
          totalAllAverageShiftCleaning: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.inspections.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDateUTC,
          },
        },
        select: {
          createdDate: true,
          employeeName: true,
          totalInspections: true,
          totalAllInspections: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.inspections.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePreviousUTC,
            lte: endDatePreviousUTC,
          },
        },
        select: {
          createdDate: true,
          employeeName: true,
          totalInspections: true,
          totalAllInspections: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
    ]);

    const bigNumbers = {
      currentDate: {
        totalAllSuitesCleanings: cleanings[0]?.totalAllSuitesCleanings,
        totalAllAverageDailyCleaning: cleanings[0]?.totalAllAverageDailyCleaning,
        totalAllInspections: inspections[0]?.totalAllInspections,
      },

      previousDate: {
        totalAllSuitesCleaningsPreviousData: cleaningsPreviousData[0]?.totalAllSuitesCleanings,
        totalAllAverageDailyCleaningPreviousData:
          cleaningsPreviousData[0]?.totalAllAverageDailyCleaning,
        totalAllInspectionsPreviousData: inspectionsPreviousData[0]?.totalAllInspections,
      },
    };

    // Defina uma interface para o tipo de dados
    interface SupervisorPerformance {
      name: string;
      value: number;
      createdDate: Date;
    }

    // Lógica para calcular a performance dos supervisores
    const supervisorsPerformance: { [key: string]: SupervisorPerformance } = {};

    // Para calcular a porcentagem de cada supervisor
    for (const inspection of inspections) {
      const { employeeName, totalInspections, createdDate } = inspection;

      // Cria uma chave única para o supervisor
      const key = employeeName;

      // Verifica se já existe um registro para esse supervisor
      if (
        !supervisorsPerformance[key] ||
        new Date(supervisorsPerformance[key].createdDate) < new Date(createdDate)
      ) {
        // Atualiza o registro com os dados mais recentes
        supervisorsPerformance[key] = {
          name: employeeName,
          value: totalInspections,
          createdDate: createdDate,
        };
      }
    }

    // Converte o objeto de volta para um array
    const performanceArray: SupervisorPerformance[] = Object.values(supervisorsPerformance);

    // Formata o retorno para o ApexCharts
    const supervisorsPerformanceFormatted = {
      categories: performanceArray.map((item) => item.name),
      series: performanceArray.map((item) => item.value),
    };

    // Lógica para calcular a performance das limpezas
    const shiftCleaningMap: Record<string, number> = {
      Manhã: 0,
      Tarde: 0,
      Noite: 0,
      Terceirizado: 0,
    };

    // Objeto para armazenar os dados mais recentes
    const latestCleanings: Record<string, CleaningData> = {};

    // Itera sobre os dados de limpeza
    for (const cleaning of cleanings) {
      const { shift, employeeName, createdDate } = cleaning;

      // Cria uma chave única para o empregado e o turno
      const key = `${employeeName}-${shift}`;

      // Verifica se já existe um registro para esse empregado e turno
      if (
        !latestCleanings[key] ||
        new Date(latestCleanings[key].createdDate) < new Date(createdDate)
      ) {
        // Atualiza o registro com os dados mais recentes
        latestCleanings[key] = {
          shift: cleaning.shift,
          employeeName: cleaning.employeeName,
          totalSuitesCleanings: cleaning.totalSuitesCleanings,
          totalAllSuitesCleanings: cleaning.totalAllSuitesCleanings,
          totalDaysWorked: cleaning.totalDaysWorked,
          averageDailyCleaning: Number(cleaning.averageDailyCleaning),
          totalAllAverageDailyCleaning: cleaning.totalAllAverageDailyCleaning,
          createdDate: cleaning.createdDate,
        };
      }
    }

    // Agora, agregue os dados mais recentes
    for (const key in latestCleanings) {
      const { shift, totalSuitesCleanings, employeeName } = latestCleanings[key];

      // Se o empregado é um dos extras, contabiliza apenas no turno Terceirizado
      if (
        employeeName === 'EXTRA MANHA' ||
        employeeName === 'EXTRA TARDE' ||
        employeeName === 'EXTRA NOITE'
      ) {
        shiftCleaningMap['Terceirizado'] += totalSuitesCleanings;
      } else {
        // Para evitar erro de tipagem, só permite turnos conhecidos
        if (shift in shiftCleaningMap) {
          shiftCleaningMap[shift] += totalSuitesCleanings;
        } else {
          // Se o turno não for reconhecido, adiciona ao Terceirizado
          shiftCleaningMap['Terceirizado'] += totalSuitesCleanings;
        }
      }
    }

    // Converte o mapa em arrays para o retorno
    const shiftCleaning = {
      categories: Object.keys(shiftCleaningMap),
      series: Object.values(shiftCleaningMap),
    };

    const cleaningByDate = cleaningsByPeriod.reduce<CleaningByDateAcc>((acc, curr) => {
      const timezone = 'America/Sao_Paulo';
      const createdDate = moment.utc(curr.createdDate);

      if (period === 'LAST_6_M') {
        const today = moment.tz(timezone).subtract(1, 'day');
        const currentDay = today.date();

        const last6MonthsDates = Array.from({ length: 6 }, (_, i) =>
          today
            .clone()
            .subtract(i + 1, 'months')
            .date(currentDay)
            .startOf('day'),
        );

        const last6MonthsUTC = last6MonthsDates.map((date) =>
          date.clone().utc().set({ hour: 5, minute: 59, second: 59, millisecond: 999 }),
        );

        const isMatchingDate = last6MonthsUTC.some((date) => createdDate.isSame(date, 'day'));

        if (!isMatchingDate) {
          return acc;
        }
      }

      const dateKey = createdDate.format('DD/MM/YYYY');
      const totalSuitesCleanings = Number(curr.totalSuitesCleanings);

      if (!acc[dateKey]) {
        acc[dateKey] = { totalSuitesCleanings: 0 };
      }

      acc[dateKey].totalSuitesCleanings += totalSuitesCleanings;

      return acc;
    }, {});

    // Agora, formatamos o resultado em dois arrays: categories e series
    const formattedCleaningByDate = {
      categories: Object.keys(cleaningByDate),
      series: Object.keys(cleaningByDate).map((date) => cleaningByDate[date].totalSuitesCleanings),
    };

    const formattedForApexCharts = (
      cleaningsByPeriodShiftParam: any[],
      periodParam: PeriodEnum,
    ) => {
      const categories: string[] = [];
      const shiftsData: ShiftsData = {
        Manhã: [],
        Tarde: [],
        Noite: [],
        Terceirizado: [],
      };

      const timezone = 'America/Sao_Paulo';

      if (periodParam === PeriodEnum.LAST_6_M) {
        const today = moment.tz(timezone).subtract(1, 'day');
        const currentDay = today.date();

        const last6MonthsDates = Array.from({ length: 6 }, (_, i) =>
          today
            .clone()
            .subtract(i + 1, 'months')
            .date(currentDay)
            .startOf('day'),
        );

        const last6MonthsUTC = last6MonthsDates.map((date) =>
          date.clone().utc().set({ hour: 5, minute: 59, second: 59, millisecond: 999 }),
        );

        categories.push(...last6MonthsUTC.map((date) => date.format('DD/MM/YYYY')));

        cleaningsByPeriodShiftParam = cleaningsByPeriodShiftParam.filter((cleaning) => {
          const createdDate = moment.utc(cleaning.createdDate).tz(timezone).startOf('day');

          return last6MonthsUTC.some((date) => createdDate.isSame(date, 'day'));
        });
      } else {
        cleaningsByPeriodShiftParam.forEach((cleaning) => {
          const createdDate = moment.utc(cleaning.createdDate).tz(timezone).format('DD/MM/YYYY');

          if (!categories.includes(createdDate)) {
            categories.push(createdDate);
          }
        });

        categories.sort((a, b) =>
          moment(a, 'DD/MM/YYYY').isBefore(moment(b, 'DD/MM/YYYY')) ? -1 : 1,
        );
      }

      cleaningsByPeriodShiftParam.forEach((cleaning) => {
        const createdDate = moment.utc(cleaning.createdDate).tz(timezone).format('DD/MM/YYYY');
        const shift = cleaning.shift;
        const employeeName = cleaning.employeeName;
        const totalSuitesCleanings = Number(cleaning.totalSuitesCleanings);

        if (!shiftsData[shift]) {
          shiftsData[shift] = [];
        }

        let employeeData = shiftsData[shift].find((e) => e.name === employeeName);
        if (!employeeData) {
          employeeData = {
            name: employeeName,
            data: new Array(categories.length).fill(0),
          };
          shiftsData[shift].push(employeeData);
        }

        const dateIndex = categories.indexOf(createdDate);

        if (dateIndex !== -1) {
          employeeData.data[dateIndex] += totalSuitesCleanings;
        }
      });

      for (const shift in shiftsData) {
        shiftsData[shift].forEach((employeeData) => {
          if (employeeData.data.length < categories.length) {
            employeeData.data = [
              ...employeeData.data,
              ...new Array(categories.length - employeeData.data.length).fill(0),
            ];
          }
        });
      }

      return {
        categories,
        series: shiftsData,
      };
    };

    const employeeReport = cleanings.reduce<EmployeeReportByShift>((acc, cleaning) => {
      const { shift, employeeName, totalSuitesCleanings, totalDaysWorked, averageDailyCleaning } =
        cleaning;

      if (!acc[shift]) {
        acc[shift] = [];
      }

      acc[shift].push({
        employeeName,
        totalSuitesCleanings,
        totalDaysWorked,
        averageDailyCleaning: Number(averageDailyCleaning),
      });

      return acc;
    }, {});

    const teamSizing = cleaningsByWeek.reduce(
      (acc, cleaning) => {
        const {
          shift,
          createdDate,
          totalAverageShiftCleaning,
          averageDailyWeekCleaning,
          idealShiftMaid,
          realShiftMaid,
          totalSuitesCleanings,
          difference,
        } = cleaning;

        const removeAccents = (str: string): string => {
          return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        };

        const timezone = 'America/Sao_Paulo';
        const dayOfWeek = removeAccents(
          moment.tz(createdDate, timezone).format('dddd').replace('-feira', ''),
        );

        if (!acc[shift]) {
          acc[shift] = {
            totalAverageShiftCleaning: Number(totalAverageShiftCleaning),
            idealShiftMaid,
            realShiftMaid,
            difference,
          };
        }

        acc[shift][dayOfWeek] = {
          totalCleanings: Number(totalSuitesCleanings),
          averageDailyWeekCleaning: Number(averageDailyWeekCleaning),
        };

        return acc;
      },
      {} as Record<string, any>,
    );

    type Totals = {
      totalAverageDailyWeekCleaning: Record<string, number>;
      totalIdealShiftMaid: number;
      totalRealShiftMaid: number;
      totalDifference: number;
      totalAllAverageShiftCleaning: number;
    };

    const totals: Totals = {
      totalAverageDailyWeekCleaning: {},
      totalIdealShiftMaid: 0,
      totalRealShiftMaid: 0,
      totalDifference: 0,
      totalAllAverageShiftCleaning: 0,
    };

    cleaningsByWeek.forEach((cleaning) => {
      const {
        totalAllAverageShiftCleaning,
        totalIdealShiftMaid,
        totalRealShiftMaid,
        totalDifference,
        createdDate,
        totalAverageDailyWeekCleaning,
      } = cleaning;

      totals.totalAllAverageShiftCleaning = Number(totalAllAverageShiftCleaning);
      totals.totalIdealShiftMaid = totalIdealShiftMaid;
      totals.totalRealShiftMaid = totalRealShiftMaid;
      totals.totalDifference = totalDifference;

      const removeAccents = (str: string): string => {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      };

      const dayOfWeek = removeAccents(
        moment.tz(createdDate, 'America/Sao_Paulo').format('dddd').replace('-feira', ''),
      );

      totals.totalAverageDailyWeekCleaning[dayOfWeek] = Number(totalAverageDailyWeekCleaning);
    });

    teamSizing.Totals = totals;

    return {
      Company: 'Lush Ipiranga',
      BigNumbers: [bigNumbers],
      SupervisorsPerformance: supervisorsPerformanceFormatted,
      ShiftCleaning: {
        categories: shiftCleaning.categories,
        series: shiftCleaning.series,
      },
      CleaningByDate: formattedCleaningByDate,
      EmployeeCleaningByShift: formattedForApexCharts(cleaningsByPeriodShift, period),
      EmployeeReport: employeeReport,
      TeamSizing: teamSizing,
    };
  }

  async calculateKpibyDateRangeSQL(startDate: Date, endDate: Date): Promise<any> {
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
    AND f."id_cargo" IN (4,45)
`;

    const totalInspectionsSql = `
  SELECT
    COUNT(*)::INT AS "totalInspections"
  FROM "vistoriaapartamento" va
  JOIN "usuario" u ON u."id" = va."id_responsavel"
  JOIN "funcionario" f ON f."id" = u."id_funcionario"
  WHERE va."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND va."motivofim" = 'APROVADA'
    AND f."id_cargo" = 24
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
    AND f."id_cargo" = 24
  GROUP BY p."nome"
  ORDER BY value DESC;
`;

    const shiftCleaningSQL = `
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
    WHERE l."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
      AND l."datafim" IS NOT NULL
      AND l."motivofim" = 'COMPLETA'
      AND f."id_cargo" IN (4, 45)
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
  AND f."id_cargo" IN (4, 45)
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
    AND f."id_cargo" IN (4, 45)
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
      AND f."id_cargo" IN (4, 45)
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
    AND f."id" NOT IN (1047694, 20388)
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
  ROUND(ss.total_average_shift_cleaning / 7.0)::int AS ideal_shift_maid,
  COALESCE(rsm.real_shift_maid, 0) AS real_shift_maid,
  COALESCE(rsm.real_shift_maid, 0) - (ROUND(ss.total_average_shift_cleaning / 7.0)::int) AS difference,
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
      this.prisma.prismaLocal.$queryRaw<{ date: string; totalCleanings: number }[]>(
        Prisma.sql([cleaningsByPeriodSql]),
      ),
      this.prisma.prismaLocal.$queryRaw<
        {
          date: string;
          shift: string;
          employee_name: string;
          total_cleanings: number;
        }[]
      >(Prisma.sql([cleaningsByPeriodShiftSql])),
      this.prisma.prismaLocal.$queryRaw<
        {
          shift: string;
          employee_name: string;
          total_suites: number;
          total_days: number;
          average_daily_cleaning: number;
        }[]
      >(Prisma.sql([employeeReportSql])),
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

    const shiftsMap: Record<string, Record<string, Record<string, number>>> = {};

    for (const row of rawCleaningPeriodShiftResult) {
      const { date, shift, employee_name, total_cleanings } = row;
      const key = isMonthly
        ? moment(date, 'YYYY-MM-DD').format('YYYY-MM')
        : moment(date, 'YYYY-MM-DD').format('YYYY-MM-DD');

      if (!shiftsMap[shift]) shiftsMap[shift] = {};
      if (!shiftsMap[shift][employee_name]) shiftsMap[shift][employee_name] = {};
      shiftsMap[shift][employee_name][key] = total_cleanings;
    }

    const cleaningsByPeriodShift = {
      categories: dateKeys.map((key) =>
        isMonthly ? moment(key, 'YYYY-MM').format('MM/YYYY') : moment(key).format('DD/MM/YYYY'),
      ),
      series: Object.entries(shiftsMap).reduce<Record<string, { name: string; data: number[] }[]>>(
        (acc, [shift, employees]) => {
          acc[shift] = Object.entries(employees).map(([employeeName, dateCounts]) => ({
            name: employeeName,
            data: dateKeys.map((dateKey) => dateCounts[dateKey] || 0),
          }));
          return acc;
        },
        {},
      ),
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

    const totals: Record<string, any> = {
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

        totals.totalAverageDailyWeekCleaning[weekday] += Number(
          (values as any).averageDailyWeekCleaning,
        );
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
      Company: 'Lush Ipiranga',
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

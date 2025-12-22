import { Injectable } from '@nestjs/common';
import { PeriodEnum, Prisma, RentalTypeEnum } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import * as moment from 'moment-timezone';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { CachePeriodEnum } from '../cache/cache.interfaces';

// Type definitions for better type safety - Numeric versions for SQL function
interface BigNumbersDataSQL {
  currentDate: {
    totalAllValue: number;
    totalAllRentalsApartments: number;
    totalAllTicketAverage: number;
    totalAllTrevpar: number;
    totalAllGiro: number;
    totalAverageOccupationTime: string;
  };
  previousDate?: {
    totalAllValuePreviousData: number;
    totalAllRentalsApartmentsPreviousData: number;
    totalAllTicketAveragePreviousData: number;
    totalAllTrevparPreviousData: number;
    totalAllGiroPreviousData: number;
    totalAverageOccupationTimePreviousData: string;
  };
  monthlyForecast?: {
    totalAllValueForecast: number;
    totalAllRentalsApartmentsForecast: number;
    totalAllTicketAverageForecast: number;
    totalAllTrevparForecast: number;
    totalAllGiroForecast: number;
    totalAverageOccupationTimeForecast: string;
  };
}

interface TotalResultDataSQL {
  totalAllRentalsApartments: number;
  totalAllValue: number;
  totalAllTicketAverage: number;
  totalGiro: number;
  totalRevpar: number;
  totalTrevpar: number;
  totalAverageOccupationTime: string;
  totalOccupancyRate: number;
}

// Type definitions for better type safety - String versions for original function
interface BigNumbersData {
  currentDate: {
    totalAllValue: string;
    totalAllRentalsApartments: number;
    totalAllTicketAverage: string;
    totalAllRevpar: string;
    totalAllGiro: number;
    totalAverageOccupationTime: string;
  };
  PreviousDate?: {
    totalAllValuePreviousData: string;
    totalAllRentalsApartmentsPreviousData: number;
    totalAllTicketAveragePreviousData: string;
    totalAllRevparPreviousData: string;
    totalAllGiroPreviousData: number;
    totalAverageOccupationTimePreviousData: string;
  };
}

interface SuiteCategoryData {
  [key: string]: {
    totalRentalsApartments: number;
    totalValue: number;
    totalTicketAverage: number;
    giro: number;
    revpar: number;
    trevpar: number;
    averageOccupationTime: string;
    occupancyRate: number;
  };
}

interface TotalResultData {
  totalAllRentalsApartments: number;
  totalAllValue: string;
  totalAllTicketAverage: string;
  totalGiro: number;
  totalRevpar: string;
  totalTrevpar: string;
  totalAverageOccupationTime: string;
  totalOccupancyRate: string;
}

interface DateValueData {
  [date: string]: {
    totalValue: string;
  };
}

interface DateRentalsData {
  [date: string]: {
    totalAllRentalsApartments: number;
  };
}

interface DateRevparData {
  [date: string]: {
    totalRevpar: string;
  };
}

interface DateTicketData {
  [date: string]: {
    totalAllTicketAverage: string;
  };
}

interface DateTrevparData {
  [date: string]: {
    totalTrevpar: string;
  };
}

interface DateOccupancyData {
  [date: string]: {
    totalOccupancyRate: string;
  };
}

interface OccupancyBySuiteCategoryData {
  [date: string]: {
    [suiteCategoryName: string]: {
      occupancyRate: string;
    };
  };
}

interface WeeklyOccupancyData {
  [suiteCategory: string]: {
    [dayOfWeek: string]: {
      occupancyRate: number;
      totalOccupancyRate: number;
    };
  };
}

interface WeeklyGiroData {
  [suiteCategory: string]: {
    [dayOfWeek: string]: {
      giro: number;
      totalGiro: number;
    };
  };
}

interface RentalTypeData {
  [rentalType: string]: {
    totalValue: number;
  };
}

interface BillingRentalTypeData {
  [date: string]: Array<{
    [rentalType: string]: {
      totalValue: string;
    };
  }>;
}

interface CategoryTotalsMap {
  [categoryId: number]: {
    giroTotal: number;
    rentalsCount: number;
    totalOccupiedTime: number;
    unavailableTime: number;
    availableTime: number;
    totalValue: Prisma.Decimal;
    categoryTotalSale: Prisma.Decimal;
    categoryTotalRental: Prisma.Decimal;
    categoryTotalRentals: number;
  };
}

// ApexCharts interfaces for new function
interface ApexChartsData {
  categories: string[];
  series: number[];
}

interface ApexChartsSeriesData {
  categories: string[];
  series: { name: string; data: number[] }[];
}

export interface CompanyKpiResponse {
  Company: string;
  BigNumbers: BigNumbersData[];
  BillingRentalType: Array<{ [date: string]: any }>;
  RevenueByDate: DateValueData[];
  RevenueBySuiteCategory: Array<{ [category: string]: { totalValue: string } }>;
  RentalsByDate: DateRentalsData[];
  RevparByDate: DateRevparData[];
  TicketAverageByDate: DateTicketData[];
  TrevparByDate: DateTrevparData[];
  OccupancyRateByDate: DateOccupancyData[];
  OccupancyRateBySuiteCategory: OccupancyBySuiteCategoryData[];
  DataTableSuiteCategory: SuiteCategoryData[];
  TotalResult: TotalResultData;
  DataTableOccupancyRateByWeek: WeeklyOccupancyData[];
  DataTableGiroByWeek: WeeklyGiroData[];
}

// New interface for ApexCharts compatible response
export interface CompanyKpiApexChartsResponse {
  Company: string;
  BigNumbers: BigNumbersDataSQL[];
  BillingRentalType: ApexChartsSeriesData;
  RevenueByDate: ApexChartsData;
  RevenueBySuiteCategory: ApexChartsData;
  RentalsByDate: ApexChartsData;
  RevparByDate: ApexChartsData;
  TicketAverageByDate: ApexChartsData;
  TrevparByDate: ApexChartsData;
  OccupancyRateByDate: ApexChartsData;
  OccupancyRateBySuiteCategory: ApexChartsSeriesData;
  DataTableSuiteCategory: SuiteCategoryData[];
  TotalResult: TotalResultDataSQL;
  DataTableOccupancyRateByWeek: WeeklyOccupancyData[];
  DataTableGiroByWeek: WeeklyGiroData[];
}

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private kpiCacheService: KpiCacheService,
  ) {}

  async findAllCompany(period: PeriodEnum): Promise<CompanyKpiApexChartsResponse> {
    // Define o fuso horário padrão como São Paulo
    moment.tz.setDefault('America/Sao_Paulo');

    let startDate: Date, endDate: Date, startDatePrevious: Date, endDatePrevious: Date;

    // Obtém a data de ONTEM em São Paulo e cria momento UTC às 05:59:59
    // Usamos ontem porque queremos apenas dados completos (até ontem)
    const yesterdayInSaoPaulo = moment
      .tz('America/Sao_Paulo')
      .subtract(1, 'day')
      .format('YYYY-MM-DD');
    const todayInitial = moment.utc(
      `${yesterdayInSaoPaulo} 05:59:59.999`,
      'YYYY-MM-DD HH:mm:ss.SSS',
    );
    endDate = todayInitial.clone().toDate();

    // Calcula o `startDate` e os períodos anteriores com base no `period`
    switch (period) {
      case PeriodEnum.LAST_7_D:
        startDate = todayInitial.clone().subtract(6, 'days').toDate();

        // Período anterior: 7 dias antes do início do período atual
        startDatePrevious = moment(startDate).subtract(7, 'days').toDate();
        endDatePrevious = new Date(startDate);
        break;

      case PeriodEnum.LAST_30_D:
        startDate = todayInitial.clone().subtract(29, 'days').toDate();

        // Período anterior: 30 dias antes do início do período atual
        startDatePrevious = moment(startDate).subtract(30, 'days').toDate();
        endDatePrevious = new Date(startDate);
        break;

      case PeriodEnum.LAST_6_M:
        startDate = todayInitial.clone().subtract(6, 'months').toDate();

        // Período anterior: 6 meses antes do início do período atual
        startDatePrevious = moment(startDate).subtract(6, 'months').toDate();
        endDatePrevious = new Date(startDate);
        break;

      case PeriodEnum.ESTE_MES:
        // Período atual: desde o início do mês até hoje
        startDate = moment
          .tz('America/Sao_Paulo')
          .startOf('month')
          .set({
            hour: 6,
            minute: 0,
            second: 0,
            millisecond: 0,
          })
          .toDate();

        // EndDate já está definido como hoje às 05:59:59

        // Período anterior: o mês anterior completo
        const lastMonthStart = moment.tz('America/Sao_Paulo').subtract(1, 'month').startOf('month');
        const lastMonthEnd = moment.tz('America/Sao_Paulo').subtract(1, 'month').endOf('month');

        startDatePrevious = lastMonthStart
          .set({
            hour: 6,
            minute: 0,
            second: 0,
            millisecond: 0,
          })
          .toDate();

        endDatePrevious = lastMonthEnd
          .set({
            hour: 5,
            minute: 59,
            second: 59,
            millisecond: 999,
          })
          .toDate();
        break;

      default:
        throw new Error('Invalid period specified');
    }

    // LOG: Verificar datas de início e fim
    console.log('=== FINDALLCOMPANY DEBUG ===');
    console.log('Period:', period);
    console.log('StartDate:', startDate);
    console.log('EndDate:', endDate);
    console.log(
      'StartDate formatted:',
      moment(startDate).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss'),
    );
    console.log(
      'EndDate formatted:',
      moment(endDate).tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss'),
    );
    console.log('StartDate UTC:', moment.utc(startDate).format('DD/MM/YYYY HH:mm:ss'));
    console.log('EndDate UTC:', moment.utc(endDate).format('DD/MM/YYYY HH:mm:ss'));
    console.log('============================');

    // Datas geradas para as consultas

    // Consultas para buscar os dados de KPIs com base nas datas selecionadas
    const [
      KpiRevenue,
      KpiRevenuePreviousData,
      KpiRevenueByRentalType,
      KpiRevenueByPeriod,
      KpiTotalRentals,
      KpiTotalRentalsPreviousData,
      KpiTotalRentalsByPeriod,
      KpiTicketAverage,
      KpiTicketAveragePreviousData,
      KpiTicketAverageByPeriod,
      KpiRevpar,
      KpiRevparPreviousData,
      KpiRevparByPeriod,
      KpiOccupancyRate,
      KpiOccupancyRateByWeek,
      KpiOccupancyRateByPeriod,
      KpiOccupancyRateBySuiteCategory,
      KpiAlos,
      KpiAlosPreviousData,
      KpiGiro,
      KpiGiroPreviousData,
      KpiGiroByWeek,
      KpiTrevpar,
      KpiTrevparByPeriod,
      suiteCategory,
    ] = await this.prisma.prismaOnline.$transaction([
      this.prisma.prismaOnline.kpiRevenue.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalValue: true,
          suiteCategoryName: true,
          totalAllValue: true,
          createdDate: true,
          suiteCategoryId: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiRevenue.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          totalValue: true,
          suiteCategoryName: true,
          totalAllValue: true,
          createdDate: true,
          suiteCategoryId: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiRevenueByRentalType.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalValue: true,
          createdDate: true,
          rentalType: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiRevenueByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalValue: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiTotalRentals.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalRentalsApartments: true,
          suiteCategoryName: true,
          suiteCategoryId: true,
          totalAllRentalsApartments: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiTotalRentals.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          totalRentalsApartments: true,
          suiteCategoryName: true,
          suiteCategoryId: true,
          totalAllRentalsApartments: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiTotalRentalsByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalAllRentalsApartments: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiTicketAverage.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalTicketAverage: true,
          suiteCategoryName: true,
          suiteCategoryId: true,
          totalAllTicketAverage: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiTicketAverage.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          totalTicketAverage: true,
          suiteCategoryName: true,
          suiteCategoryId: true,
          totalAllTicketAverage: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiTicketAverageByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalAllTicketAverage: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiRevpar.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          revpar: true,
          suiteCategoryName: true,
          suiteCategoryId: true,
          totalRevpar: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiRevpar.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          revpar: true,
          suiteCategoryName: true,
          suiteCategoryId: true,
          totalRevpar: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiRevparByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalRevpar: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiOccupancyRate.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          occupancyRate: true,
          suiteCategoryName: true,
          suiteCategoryId: true,
          totalOccupancyRate: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiOccupancyRateByWeek.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
          },
        },
        select: {
          occupancyRate: true,
          suiteCategoryName: true,
          suiteCategoryId: true,
          totalOccupancyRate: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiOccupancyRateByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalOccupancyRate: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiOccupancyRateBySuiteCategory.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          occupancyRate: true,
          createdDate: true,
          suiteCategoryName: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiAlos.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          averageOccupationTime: true,
          suiteCategoryName: true,
          totalAverageOccupationTime: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiAlos.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          averageOccupationTime: true,
          suiteCategoryName: true,
          totalAverageOccupationTime: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiGiro.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          giro: true,
          suiteCategoryName: true,
          totalGiro: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiGiro.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          giro: true,
          suiteCategoryName: true,
          totalGiro: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiGiroByWeek.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
          },
        },
        select: {
          giro: true,
          suiteCategoryName: true,
          totalGiro: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiTrevpar.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          trevpar: true,
          suiteCategoryName: true,
          suiteCategoryId: true,
          totalTrevpar: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiTrevparByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalTrevpar: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaLocal.suiteCategory.findMany({
        where: {
          id: {
            in: [10, 11, 12, 15, 16, 17, 18, 19, 24],
          },
        },
        include: {
          suites: true,
        },
      }),
    ]);

    // Montando o retorno de BigNumbers
    const bigNumbers: BigNumbersDataSQL = {
      currentDate: {
        totalAllValue: Number(KpiRevenue[0]?.totalAllValue ?? 0),
        totalAllRentalsApartments: KpiTotalRentals[0]?.totalAllRentalsApartments ?? 0,
        totalAllTicketAverage: Number(KpiTicketAverage[0]?.totalAllTicketAverage ?? 0),
        totalAllTrevpar: Number(KpiRevpar[0]?.totalRevpar ?? 0),
        totalAllGiro: Number(KpiGiro[0]?.totalGiro ?? 0),
        totalAverageOccupationTime: KpiAlos[0]?.totalAverageOccupationTime ?? '00:00:00',
      },
      previousDate: {
        totalAllValuePreviousData: Number(KpiRevenuePreviousData[0]?.totalAllValue ?? 0),
        totalAllRentalsApartmentsPreviousData:
          KpiTotalRentalsPreviousData[0]?.totalAllRentalsApartments ?? 0,
        totalAllTicketAveragePreviousData: Number(
          KpiTicketAveragePreviousData[0]?.totalAllTicketAverage ?? 0,
        ),
        totalAllTrevparPreviousData: Number(KpiRevparPreviousData[0]?.totalRevpar ?? 0),
        totalAllGiroPreviousData: Number(KpiGiroPreviousData[0]?.totalGiro ?? 0),
        totalAverageOccupationTimePreviousData:
          KpiAlosPreviousData[0]?.totalAverageOccupationTime ?? '00:00:00',
      },
    };

    // Calcular previsão de fechamento do mês para qualquer período
    // Sempre baseado nos dados desde o primeiro dia do mês até hoje
    const nowForForecast = moment.tz('America/Sao_Paulo');
    const currentMonthStart = nowForForecast.clone().startOf('month');
    const currentMonthEnd = nowForForecast.clone().endOf('month');
    const todayForForecast = nowForForecast.clone().startOf('day');

    // Verificar se estamos no mês corrente
    const isCurrentMonth =
      nowForForecast.month() === currentMonthStart.month() &&
      nowForForecast.year() === currentMonthStart.year();

    if (isCurrentMonth) {
      // Total de dias no mês
      const totalDaysInMonth = currentMonthEnd.date();

      // Dias com dados completos (do dia 1 até ontem)
      // Como o dia contábil fecha às 05:59 do dia seguinte, "ontem fechado" = hoje às 05:59
      // Se hoje é dia 18, temos dados completos de 17 dias (dia 1 até dia 17)
      const daysElapsed = todayForForecast.date() - 1; // dia atual - 1 = dias completos

      // Dias restantes (de hoje até o fim do mês)
      // Se hoje é dia 18 e o mês tem 31 dias, restam 14 dias (18 ao 31)
      const remainingDays = totalDaysInMonth - (todayForForecast.date() - 1);

      // Se temos dados suficientes e ainda restam dias no mês
      if (daysElapsed > 0 && remainingDays > 0) {
        // Buscar dados do período ESTE_MES que contém o acumulado desde o dia 1º até hoje
        // Os dados são salvos com createdDate às 05:59:59 de cada dia
        const monthStartDate = currentMonthStart
          .set({ hour: 5, minute: 59, second: 59, millisecond: 999 })
          .toDate();
        const monthCurrentDate = todayForForecast
          .clone()
          .set({ hour: 5, minute: 59, second: 59, millisecond: 999 })
          .toDate();

        // Query para buscar dados do período ESTE_MES
        const monthlyKpiRevenue = await this.prisma.prismaOnline.kpiRevenue.findMany({
          where: {
            period: 'ESTE_MES',
            createdDate: {
              gte: monthStartDate,
              lte: monthCurrentDate,
            },
          },
          orderBy: { createdDate: 'desc' },
        });

        const monthlyKpiTotalRentals = await this.prisma.prismaOnline.kpiTotalRentals.findMany({
          where: {
            period: 'ESTE_MES',
            createdDate: {
              gte: monthStartDate,
              lte: monthCurrentDate,
            },
          },
          orderBy: { createdDate: 'desc' },
        });

        const monthlyKpiTrevpar = await this.prisma.prismaOnline.kpiTrevpar.findMany({
          where: {
            period: 'ESTE_MES',
            createdDate: {
              gte: monthStartDate,
              lte: monthCurrentDate,
            },
          },
          orderBy: { createdDate: 'desc' },
        });

        const monthlyKpiGiro = await this.prisma.prismaOnline.kpiGiro.findMany({
          where: {
            period: 'ESTE_MES',
            createdDate: {
              gte: monthStartDate,
              lte: monthCurrentDate,
            },
          },
          orderBy: { createdDate: 'desc' },
        });

        const monthlyKpiTicketAverage = await this.prisma.prismaOnline.kpiTicketAverage.findMany({
          where: {
            period: 'ESTE_MES',
            createdDate: {
              gte: monthStartDate,
              lte: monthCurrentDate,
            },
          },
          orderBy: { createdDate: 'desc' },
        });

        const monthlyKpiAlos = await this.prisma.prismaOnline.kpiAlos.findMany({
          where: {
            period: 'ESTE_MES',
            createdDate: {
              gte: monthStartDate,
              lte: monthCurrentDate,
            },
          },
          orderBy: { createdDate: 'desc' },
        });

        // Pegar o registro mais recente que contém o acumulado do mês
        const monthlyTotalValue = Number(monthlyKpiRevenue[0]?.totalAllValue ?? 0);
        const monthlyTotalRentals = monthlyKpiTotalRentals[0]?.totalAllRentalsApartments || 0;
        const monthlyTotalTrevpar = Number(monthlyKpiTrevpar[0]?.totalTrevpar ?? 0);
        const monthlyTotalGiro = Number(monthlyKpiGiro[0]?.totalGiro ?? 0);
        const monthlyTicketAverage = Number(monthlyKpiTicketAverage[0]?.totalAllTicketAverage ?? 0);
        const monthlyAverageOccupationTime =
          monthlyKpiAlos[0]?.totalAverageOccupationTime ?? '00:00:00';

        // Buscar total de suítes para cálculos
        const totalSuitesCount = suiteCategory.reduce(
          (acc, category) => acc + category.suites.length,
          0,
        );

        // Média diária baseada no acumulado até hoje dividido pelos dias que já passaram
        const dailyAverageValue = daysElapsed > 0 ? monthlyTotalValue / daysElapsed : 0;
        const dailyAverageRentals = daysElapsed > 0 ? monthlyTotalRentals / daysElapsed : 0;

        // Projeção dos valores acumulados
        const forecastValue = monthlyTotalValue + dailyAverageValue * remainingDays;
        const forecastRentals = monthlyTotalRentals + dailyAverageRentals * remainingDays;

        // Recalcular métricas com base nos valores projetados
        // Ticket Médio = receita total / número de locações
        const forecastTicketAverage =
          forecastRentals > 0 ? Number((forecastValue / forecastRentals).toFixed(2)) : 0;

        // Giro = locações / suítes / dias no mês completo
        const forecastGiro =
          totalSuitesCount > 0 && totalDaysInMonth > 0
            ? Number((forecastRentals / totalSuitesCount / totalDaysInMonth).toFixed(2))
            : 0;

        // TRevPAR = receita total / suítes / dias no mês completo
        const forecastTrevpar =
          totalSuitesCount > 0 && totalDaysInMonth > 0
            ? Number((forecastValue / totalSuitesCount / totalDaysInMonth).toFixed(2))
            : 0;

        bigNumbers.monthlyForecast = {
          totalAllValueForecast: Number(forecastValue.toFixed(2)),
          totalAllRentalsApartmentsForecast: Math.round(forecastRentals),
          totalAllTicketAverageForecast: forecastTicketAverage,
          totalAllTrevparForecast: forecastTrevpar,
          totalAllGiroForecast: forecastGiro,
          totalAverageOccupationTimeForecast: monthlyAverageOccupationTime, // Mantém (faltam dados de tempo ocupado para projetar)
        };
      }
    }

    // Montando o retorno de DataTableSuiteCategory
    const dataTableSuiteCategory = suiteCategory.map((suite) => {
      const suiteName = suite.description;

      // Filtrar os valores de KPI específicos para a suite atual
      const kpiRevenueForSuite = KpiRevenue.find((kpi) => kpi.suiteCategoryName === suiteName);
      const kpiTotalRentalsForSuite = KpiTotalRentals.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiTicketAverageForSuite = KpiTicketAverage.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiRevparForSuite = KpiRevpar.find((kpi) => kpi.suiteCategoryName === suiteName);
      const kpiOccupancyRateForSuite = KpiOccupancyRate.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiAlosForSuite = KpiAlos.find((kpi) => kpi.suiteCategoryName === suiteName);
      const kpiGiroForSuite = KpiGiro.find((kpi) => kpi.suiteCategoryName === suiteName);
      const kpiTrevparForSuite = KpiTrevpar.find((kpi) => kpi.suiteCategoryName === suiteName);

      // Montar o objeto para cada suite
      return {
        [suiteName]: {
          totalRentalsApartments: kpiTotalRentalsForSuite?.totalRentalsApartments ?? 0,
          totalValue: Number(kpiRevenueForSuite?.totalValue ?? 0),
          totalTicketAverage: Number(kpiTicketAverageForSuite?.totalTicketAverage ?? 0),
          giro: Number(kpiGiroForSuite?.giro ?? 0),
          revpar: Number(kpiRevparForSuite?.revpar ?? 0),
          trevpar: Number(kpiTrevparForSuite?.trevpar ?? 0),
          averageOccupationTime: kpiAlosForSuite?.averageOccupationTime ?? '00:00:00',
          occupancyRate: Number(kpiOccupancyRateForSuite?.occupancyRate ?? 0),
        },
      };
    });

    const TotalResult: TotalResultDataSQL = {
      totalAllRentalsApartments: KpiTotalRentals[0]?.totalAllRentalsApartments || 0,
      totalAllValue: Number(KpiRevenue[0]?.totalAllValue ?? 0),
      totalAllTicketAverage: Number(KpiTicketAverage[0]?.totalAllTicketAverage) || 0,
      totalGiro: Number(KpiGiro[0]?.totalGiro ?? 0),
      totalRevpar: Number(KpiRevpar[0]?.totalRevpar) || 0,
      totalTrevpar: Number(KpiTrevpar[0]?.totalTrevpar) || 0,
      totalAverageOccupationTime: KpiAlos[0]?.totalAverageOccupationTime ?? '00:00:00',
      totalOccupancyRate: Number(KpiOccupancyRate[0]?.totalOccupancyRate ?? 0),
    };

    // Define os tipos de aluguel esperados
    const expectedRentalTypes: (keyof typeof RentalTypeEnum)[] = [
      'THREE_HOURS',
      'SIX_HOURS',
      'TWELVE_HOURS',
      'DAY_USE',
      'DAILY',
      'OVERNIGHT',
    ];

    // Função para formatar a data para ano e mês
    function formatYearMonth(date: Date): string {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      return `${month.toString().padStart(2, '0')}/${year}`;
    }

    // Montando o retorno de BillingRentalType
    const billingRentalTypeMap: Record<string, RentalTypeData> = KpiRevenueByRentalType.reduce(
      (acc: Record<string, RentalTypeData>, curr) => {
        const createdDate = curr.createdDate;
        const rentalType = curr.rentalType;
        const totalValue = Number(curr.totalValue);

        // Determina a chave de agrupamento com base no período
        let key: string;
        if (period === 'LAST_6_M') {
          key = formatYearMonth(new Date(createdDate));
        } else {
          key = new Date(createdDate).toLocaleDateString('pt-BR');
        }

        if (!acc[key]) {
          acc[key] = {};
        }

        if (period === 'LAST_6_M') {
          acc[key]![rentalType as keyof RentalTypeData] = { totalValue };
        } else {
          if (!acc[key]![rentalType as keyof RentalTypeData]) {
            acc[key]![rentalType as keyof RentalTypeData] = { totalValue: 0 };
          }
          acc[key][rentalType as keyof RentalTypeData].totalValue += totalValue;
        }

        return acc;
      },
      {},
    );

    // Gerar array de datas para o período
    const periodsArray: string[] = [];
    let currentDate = moment(startDate);
    const endDateMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endDateMoment, 'day')) {
      periodsArray.push(currentDate.format('DD/MM/YYYY'));
      currentDate.add(1, 'day');
    }

    // Construindo BillingRentalType para formato ApexCharts
    const billingRentalType: ApexChartsSeriesData = {
      categories: periodsArray,
      series: expectedRentalTypes.map((rentalType) => ({
        name: rentalType,
        data: periodsArray.map((date) => {
          const rentalTypeData = billingRentalTypeMap[date]?.[rentalType];
          return rentalTypeData ? rentalTypeData.totalValue : 0;
        }),
      })),
    };

    // Obter o dia atual no fuso horário da aplicação
    const nowForCurrentDay = moment();
    const currentHour = nowForCurrentDay.hour();
    const currentDayOfMonth = currentHour ? nowForCurrentDay.date() - 1 : nowForCurrentDay.date();

    // Criar mapa de dados de receita por data
    const revenueByDateMap = new Map<string, number>();

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiRevenueByPeriod
      const filteredKpiRevenueByPeriod = KpiRevenueByPeriod.filter((record) => {
        const recordDate = moment.utc(record.createdDate);
        const recordDay = recordDate.tz('America/Sao_Paulo').date();

        return (
          recordDate.isBetween(
            nowForCurrentDay.clone().subtract(6, 'months').startOf('month').utc(),
            nowForCurrentDay.clone().endOf('month').utc(),
            null,
            '[]',
          ) && recordDay === currentDayOfMonth
        );
      });

      // Agrupar os dados por data
      filteredKpiRevenueByPeriod.forEach((curr) => {
        const dateKey = moment.utc(curr.createdDate).tz('America/Sao_Paulo').format('DD/MM/YYYY');
        const totalValue = Number(curr.totalValue);

        if (!revenueByDateMap.has(dateKey)) {
          revenueByDateMap.set(dateKey, 0);
        }
        revenueByDateMap.set(dateKey, revenueByDateMap.get(dateKey)! + totalValue);
      });
    } else {
      // Se o period não for LAST_6_M, não aplica o filtro, apenas agrupa normalmente
      KpiRevenueByPeriod.forEach((curr) => {
        const dateKey = moment.utc(curr.createdDate).tz('America/Sao_Paulo').format('DD/MM/YYYY');
        const totalValue = Number(curr.totalValue);

        if (!revenueByDateMap.has(dateKey)) {
          revenueByDateMap.set(dateKey, 0);
        }
        revenueByDateMap.set(dateKey, revenueByDateMap.get(dateKey)! + totalValue);
      });
    }

    // RevenueByDate no formato ApexCharts
    const revenueByDate: ApexChartsData = {
      categories: periodsArray, // Mostrar datas dos dados ao usuário
      series: periodsArray.map((date) => revenueByDateMap.get(date) || 0), // Buscar usando createdDate
    };

    // RevenueBySuiteCategory no formato ApexCharts
    const suiteRevenueData = suiteCategory
      .map((suite) => ({
        name: suite.description,
        value: Number(
          KpiRevenue.find((kpi) => kpi.suiteCategoryName === suite.description)?.totalValue ?? 0,
        ),
      }))
      .sort((a, b) => b.value - a.value);

    const revenueBySuiteCategory: ApexChartsData = {
      categories: suiteRevenueData.map((suite) => suite.name),
      series: suiteRevenueData.map((suite) => suite.value),
    };

    // Criar mapa de dados de rentals por data
    const rentalsByDateMap = new Map<string, number>();

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiTotalRentalsByPeriod
      const filteredKpiTotalRentalsByPeriod = KpiTotalRentalsByPeriod.filter((record) => {
        const recordDate = moment(new Date(record.createdDate));
        const recordDay = recordDate.date();

        return (
          recordDate.isBetween(
            nowForCurrentDay.clone().subtract(6, 'months').startOf('month'),
            nowForCurrentDay.clone().endOf('month'),
            null,
            '[]',
          ) && recordDay === currentDayOfMonth
        );
      });

      // Agrupar os dados por data
      filteredKpiTotalRentalsByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalAllRentalsApartments = Number(curr.totalAllRentalsApartments);

        if (!rentalsByDateMap.has(dateKey)) {
          rentalsByDateMap.set(dateKey, 0);
        }
        rentalsByDateMap.set(dateKey, rentalsByDateMap.get(dateKey)! + totalAllRentalsApartments);
      });
    } else {
      // Caso contrário, apenas agrupar os dados sem filtro
      KpiTotalRentalsByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalAllRentalsApartments = Number(curr.totalAllRentalsApartments);

        if (!rentalsByDateMap.has(dateKey)) {
          rentalsByDateMap.set(dateKey, 0);
        }
        rentalsByDateMap.set(dateKey, rentalsByDateMap.get(dateKey)! + totalAllRentalsApartments);
      });
    }

    // RentalsByDate no formato ApexCharts
    const rentalsByDate: ApexChartsData = {
      categories: periodsArray,
      series: periodsArray.map((date) => rentalsByDateMap.get(date) || 0),
    };

    // Criar mapa de dados de revpar por data
    const revparByDateMap = new Map<string, number>();

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiRevparByPeriod
      const filteredKpiRevparByPeriod = KpiRevparByPeriod.filter((record) => {
        const recordDate = moment(new Date(record.createdDate));
        const recordDay = recordDate.date();

        return (
          recordDate.isBetween(
            nowForCurrentDay.clone().subtract(6, 'months').startOf('month'),
            nowForCurrentDay.clone().endOf('month'),
            null,
            '[]',
          ) && recordDay === currentDayOfMonth
        );
      });

      // Agrupar os dados por data
      filteredKpiRevparByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalRevpar = Number(curr.totalRevpar);

        if (!revparByDateMap.has(dateKey)) {
          revparByDateMap.set(dateKey, 0);
        }
        revparByDateMap.set(dateKey, revparByDateMap.get(dateKey)! + totalRevpar);
      });
    } else {
      // Caso contrário, apenas agrupar os dados sem filtro
      KpiRevparByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalRevpar = Number(curr.totalRevpar);

        if (!revparByDateMap.has(dateKey)) {
          revparByDateMap.set(dateKey, 0);
        }
        revparByDateMap.set(dateKey, revparByDateMap.get(dateKey)! + totalRevpar);
      });
    }

    // RevparByDate no formato ApexCharts
    const revparByDate: ApexChartsData = {
      categories: periodsArray,
      series: periodsArray.map((date) => revparByDateMap.get(date) || 0),
    };

    // Criar mapa de dados de ticket average por data
    const ticketAverageByDateMap = new Map<string, number>();

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiTicketAverageByPeriod
      const filteredKpiTicketAverageByPeriod = KpiTicketAverageByPeriod.filter((record) => {
        const recordDate = moment(new Date(record.createdDate));
        const recordDay = recordDate.date();

        return (
          recordDate.isBetween(
            nowForCurrentDay.clone().subtract(6, 'months').startOf('month'),
            nowForCurrentDay.clone().endOf('month'),
            null,
            '[]',
          ) && recordDay === currentDayOfMonth
        );
      });

      // Agrupar os dados por data
      filteredKpiTicketAverageByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalAllTicketAverage = Number(curr.totalAllTicketAverage);

        if (!ticketAverageByDateMap.has(dateKey)) {
          ticketAverageByDateMap.set(dateKey, 0);
        }
        ticketAverageByDateMap.set(
          dateKey,
          ticketAverageByDateMap.get(dateKey)! + totalAllTicketAverage,
        );
      });
    } else {
      // Caso contrário, apenas agrupar os dados sem filtro
      KpiTicketAverageByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalAllTicketAverage = Number(curr.totalAllTicketAverage);

        if (!ticketAverageByDateMap.has(dateKey)) {
          ticketAverageByDateMap.set(dateKey, 0);
        }
        ticketAverageByDateMap.set(
          dateKey,
          ticketAverageByDateMap.get(dateKey)! + totalAllTicketAverage,
        );
      });
    }

    // TicketAverageByDate no formato ApexCharts
    const ticketAverageByDate: ApexChartsData = {
      categories: periodsArray,
      series: periodsArray.map((date) => ticketAverageByDateMap.get(date) || 0),
    };

    // Criar mapa de dados de trevpar por data
    const trevparByDateMap = new Map<string, number>();

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiTrevparByPeriod
      const filteredKpiTrevparByPeriod = KpiTrevparByPeriod.filter((record) => {
        const recordDate = moment(new Date(record.createdDate));
        const recordDay = recordDate.date();

        return (
          recordDate.isBetween(
            nowForCurrentDay.clone().subtract(6, 'months').startOf('month'),
            nowForCurrentDay.clone().endOf('month'),
            null,
            '[]',
          ) && recordDay === currentDayOfMonth
        );
      });

      // Formatar os dados sem acumular (usar valor direto)
      filteredKpiTrevparByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalTrevpar = Number(curr.totalTrevpar);
        trevparByDateMap.set(dateKey, totalTrevpar);
      });
    } else {
      // Caso contrário, apenas formatar os dados sem filtro
      KpiTrevparByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalTrevpar = Number(curr.totalTrevpar);
        trevparByDateMap.set(dateKey, totalTrevpar);
      });
    }

    // TrevparByDate no formato ApexCharts
    const trevparByDate: ApexChartsData = {
      categories: periodsArray,
      series: periodsArray.map((date) => trevparByDateMap.get(date) || 0),
    };

    // Criar mapa de dados de occupancy rate por data
    const occupancyRateByDateMap = new Map<string, number>();

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiOccupancyRateByPeriod
      const filteredKpiOccupancyRateByPeriod = KpiOccupancyRateByPeriod.filter((record) => {
        const recordDate = moment(new Date(record.createdDate));
        const recordDay = recordDate.date();

        return (
          recordDate.isBetween(
            nowForCurrentDay.clone().subtract(6, 'months').startOf('month'),
            nowForCurrentDay.clone().endOf('month'),
            null,
            '[]',
          ) && recordDay === currentDayOfMonth
        );
      });

      // Agrupar os dados por data
      filteredKpiOccupancyRateByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalOccupancyRate = Number(curr.totalOccupancyRate);

        if (!occupancyRateByDateMap.has(dateKey)) {
          occupancyRateByDateMap.set(dateKey, 0);
        }
        occupancyRateByDateMap.set(
          dateKey,
          occupancyRateByDateMap.get(dateKey)! + totalOccupancyRate,
        );
      });
    } else {
      // Caso contrário, apenas agrupar os dados sem filtro
      KpiOccupancyRateByPeriod.forEach((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
        const totalOccupancyRate = Number(curr.totalOccupancyRate);

        if (!occupancyRateByDateMap.has(dateKey)) {
          occupancyRateByDateMap.set(dateKey, 0);
        }
        occupancyRateByDateMap.set(
          dateKey,
          occupancyRateByDateMap.get(dateKey)! + totalOccupancyRate,
        );
      });
    }

    // OccupancyRateByDate no formato ApexCharts
    const occupancyRateByDate: ApexChartsData = {
      categories: periodsArray,
      series: periodsArray.map((date) => occupancyRateByDateMap.get(date) || 0),
    };

    // Declarar formattedOccupancyRateBySuiteCategory fora do escopo do if
    let formattedOccupancyRateBySuiteCategory: OccupancyBySuiteCategoryData[];

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiOccupancyRateBySuiteCategory
      const filteredKpiOccupancyRateBySuiteCategory = KpiOccupancyRateBySuiteCategory.filter(
        (record) => {
          const recordDate = moment(new Date(record.createdDate));
          const recordDay = recordDate.date();

          return (
            recordDate.isBetween(
              nowForCurrentDay.clone().subtract(6, 'months').startOf('month'),
              nowForCurrentDay.clone().endOf('month'),
              null,
              '[]',
            ) && recordDay === currentDayOfMonth
          );
        },
      );

      // Agrupar os dados por data e por categoria de suíte
      const occupancyRateBySuiteCategory: Record<
        string,
        Record<string, { occupancyRate: string }>
      > = filteredKpiOccupancyRateBySuiteCategory.reduce(
        (acc, curr) => {
          const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
          const suiteCategoryName = curr.suiteCategoryName;
          const occupancyRate = this.formatPercentage(Number(curr.occupancyRate));

          if (!acc[dateKey]) {
            acc[dateKey] = {};
          }

          acc[dateKey][suiteCategoryName] = { occupancyRate };

          return acc;
        },
        {} as Record<string, Record<string, { occupancyRate: string }>>,
      );

      // Formatar o resultado no formato desejado
      formattedOccupancyRateBySuiteCategory = Object.keys(occupancyRateBySuiteCategory).map(
        (date) => ({
          [date]: occupancyRateBySuiteCategory[date],
        }),
      );
    } else {
      // Caso contrário, apenas formatar os dados sem filtro
      const occupancyRateBySuiteCategory: Record<
        string,
        Record<string, { occupancyRate: string }>
      > = KpiOccupancyRateBySuiteCategory.reduce(
        (acc, curr) => {
          const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY');
          const suiteCategoryName = curr.suiteCategoryName;
          const occupancyRate = this.formatPercentage(Number(curr.occupancyRate));

          if (!acc[dateKey]) {
            acc[dateKey] = {};
          }

          acc[dateKey][suiteCategoryName] = { occupancyRate };

          return acc;
        },
        {} as Record<string, Record<string, { occupancyRate: string }>>,
      );

      // Formatar o resultado no formato desejado
      formattedOccupancyRateBySuiteCategory = Object.keys(occupancyRateBySuiteCategory).map(
        (date) => ({
          [date]: occupancyRateBySuiteCategory[date],
        }),
      );
    }

    // Agrupar os dados por categoria de suíte e por dia da semana
    const occupancyRateByWeek: Record<
      string,
      Record<string, { occupancyRate: number; totalOccupancyRate: number }>
    > = KpiOccupancyRateByWeek.reduce(
      (acc, curr) => {
        const createdDate = new Date(curr.createdDate);
        const dayOfWeek = createdDate.toLocaleDateString('pt-BR', {
          weekday: 'long',
        });
        const suiteCategoryName = curr.suiteCategoryName;

        if (!acc[suiteCategoryName]) {
          acc[suiteCategoryName] = {};
        }

        if (!acc[suiteCategoryName][dayOfWeek]) {
          acc[suiteCategoryName][dayOfWeek] = {
            occupancyRate: 0,
            totalOccupancyRate: Number(curr.totalOccupancyRate),
          };
        }

        acc[suiteCategoryName][dayOfWeek].occupancyRate = Number(curr.occupancyRate);

        return acc;
      },
      {} as Record<string, Record<string, { occupancyRate: number; totalOccupancyRate: number }>>,
    );

    // Definir todos os dias da semana em português
    const allDaysOfWeek = [
      'domingo',
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
    ];

    // Preencher dias ausentes com occupancyRate 0 para cada categoria de suíte
    Object.keys(occupancyRateByWeek).forEach((suiteCategoryName) => {
      // Pegar o totalOccupancyRate de qualquer dia existente para usar como referência
      const existingDay = Object.values(occupancyRateByWeek[suiteCategoryName])[0];
      const totalOccupancyRateReference = existingDay ? existingDay.totalOccupancyRate : 0;

      allDaysOfWeek.forEach((day) => {
        if (!occupancyRateByWeek[suiteCategoryName][day]) {
          occupancyRateByWeek[suiteCategoryName][day] = {
            occupancyRate: 0,
            totalOccupancyRate: totalOccupancyRateReference,
          };
        }
      });
    });

    // Converte o objeto em um array de objetos
    const occupancyRateByWeekArray: WeeklyOccupancyData[] = Object.entries(occupancyRateByWeek).map(
      ([key, value]) => ({
        [key]: value,
      }),
    );

    // Agrupar os dados por categoria de suíte e por dia da semana
    const giroByWeek: Record<
      string,
      Record<string, { giro: Prisma.Decimal; totalGiro: Prisma.Decimal }>
    > = KpiGiroByWeek.reduce(
      (acc, curr) => {
        const createdDate = new Date(curr.createdDate);
        const dayOfWeek = createdDate.toLocaleDateString('pt-BR', {
          weekday: 'long',
        });
        const suiteCategoryName = curr.suiteCategoryName;

        if (!acc[suiteCategoryName]) {
          acc[suiteCategoryName] = {};
        }

        if (!acc[suiteCategoryName][dayOfWeek]) {
          acc[suiteCategoryName][dayOfWeek] = {
            giro: new Prisma.Decimal(0),
            totalGiro: curr.totalGiro,
          };
        }

        acc[suiteCategoryName][dayOfWeek].giro = curr.giro;

        return acc;
      },
      {} as Record<string, Record<string, { giro: Prisma.Decimal; totalGiro: Prisma.Decimal }>>,
    );

    // Preencher dias ausentes com giro 0 para cada categoria de suíte
    Object.keys(giroByWeek).forEach((suiteCategoryName) => {
      // Pegar o totalGiro de qualquer dia existente para usar como referência
      const existingDay = Object.values(giroByWeek[suiteCategoryName])[0];
      const totalGiroReference = existingDay ? existingDay.totalGiro : new Prisma.Decimal(0);

      allDaysOfWeek.forEach((day) => {
        if (!giroByWeek[suiteCategoryName][day]) {
          giroByWeek[suiteCategoryName][day] = {
            giro: new Prisma.Decimal(0),
            totalGiro: totalGiroReference,
          };
        }
      });
    });

    // Converte o objeto em um array de objetos
    const giroByWeekArray: WeeklyGiroData[] = Object.entries(giroByWeek).map(([key, value]) => ({
      [key]: Object.fromEntries(
        Object.entries(value).map(([dayKey, dayValue]) => [
          dayKey,
          {
            giro: Number(dayValue.giro.toFixed(2)),
            totalGiro: Number(dayValue.totalGiro.toFixed(2)),
          },
        ]),
      ),
    }));

    // OccupancyRateBySuiteCategory no formato ApexCharts com dates em categories e suites em series
    const occupancyBySuiteCategoryMap = new Map<string, Map<string, number>>();
    const allSuiteCategories = new Set<string>();

    // Processar dados do KpiOccupancyRateBySuiteCategory
    KpiOccupancyRateBySuiteCategory.forEach((item) => {
      const dateKey = moment(item.createdDate).format('DD/MM/YYYY');
      const suiteCategoryName = item.suiteCategoryName;
      const occupancyRate = Number(item.occupancyRate) || 0;

      allSuiteCategories.add(suiteCategoryName);

      if (!occupancyBySuiteCategoryMap.has(dateKey)) {
        occupancyBySuiteCategoryMap.set(dateKey, new Map());
      }
      occupancyBySuiteCategoryMap.get(dateKey)!.set(suiteCategoryName, occupancyRate);
    });

    // Criar series para cada categoria de suíte usando periodsArray como base (mesma lógica do OccupancyRateByDate)
    const occupancyRateBySuiteCategory: ApexChartsSeriesData = {
      categories: periodsArray,
      series: Array.from(allSuiteCategories).map((suiteCategoryName) => ({
        name: suiteCategoryName,
        data: periodsArray.map(
          (date) => occupancyBySuiteCategoryMap.get(date)?.get(suiteCategoryName) || 0,
        ),
      })),
    };

    return {
      Company: 'Lush Ipiranga',
      BigNumbers: [bigNumbers],
      BillingRentalType: billingRentalType,
      RevenueByDate: revenueByDate,
      RevenueBySuiteCategory: revenueBySuiteCategory,
      RentalsByDate: rentalsByDate,
      RevparByDate: revparByDate,
      TicketAverageByDate: ticketAverageByDate,
      TrevparByDate: trevparByDate,
      OccupancyRateByDate: occupancyRateByDate,
      OccupancyRateBySuiteCategory: occupancyRateBySuiteCategory,
      DataTableSuiteCategory: dataTableSuiteCategory,
      TotalResult: TotalResult,
      DataTableOccupancyRateByWeek: occupancyRateByWeekArray,
      DataTableGiroByWeek: giroByWeekArray,
    };
  }

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private formatPercentage(value: number): string {
    return `${value.toFixed(2)}%`;
  }

  private formatPercentageUpdate(value: number): string {
    const percentageValue = value * 100;
    return `${percentageValue.toFixed(2)}%`;
  }

  private async fetchKpiData(
    startDate: Date,
    endDate: Date,
  ): Promise<[any[], any[], any[], any[], any[]]> {
    return await Promise.all([
      this.prisma.prismaLocal.rentalApartment.findMany({
        where: {
          checkIn: {
            gte: startDate,
            lte: endDate,
          },
          endOccupationType: 'FINALIZADA',
        },
        include: {
          suiteStates: {
            include: {
              suite: {
                include: {
                  suiteCategories: true,
                },
              },
            },
          },
          saleLease: {
            include: {
              stockOut: {
                include: {
                  stockOutItem: {
                    where: { canceled: null },
                    select: { priceSale: true, quantity: true },
                  },
                  sale: { select: { discount: true } },
                },
              },
            },
          },
          Booking: true,
        },
      }),
      this.prisma.prismaLocal.suiteCategory.findMany({
        where: {
          id: {
            in: [10, 11, 12, 15, 16, 17, 18, 19, 24],
          },
        },
        include: {
          suites: true,
        },
      }),
      this.prisma.prismaLocal.apartmentCleaning.findMany({
        where: {
          startDate: {
            gte: startDate,
            lte: endDate,
          },
          endDate: {
            not: null,
          },
        },
        include: {
          suiteState: {
            include: {
              suite: true,
            },
          },
        },
      }),
      this.prisma.prismaLocal.blockedMaintenanceDefect.findMany({
        where: {
          defect: {
            startDate: {
              gte: startDate,
              lte: endDate,
            },
            endDate: {
              not: null,
            },
          },
        },
        include: {
          defect: {
            include: {
              suite: true,
            },
          },
          suiteState: {
            include: {
              suite: true,
            },
          },
        },
      }),
      this.prisma.prismaLocal.stockOutItem.findMany({
        where: {
          stockOuts: {
            createdDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          canceled: null,
        },
        include: {
          stockOuts: {
            include: {
              saleDirect: true,
              sale: {
                select: {
                  discount: true,
                },
              },
            },
          },
        },
      }),
    ]);
  }

  private calculateOccupationTime(checkIn: Date, checkOut: Date): number {
    const checkInTime = new Date(checkIn).getTime();
    const checkOutTime = new Date(checkOut).getTime();
    return (checkOutTime - checkInTime) / 1000; // Tempo em segundos
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  async calculateKpisByDateRangeSQL(
    startDate: Date,
    endDate: Date,
  ): Promise<CompanyKpiApexChartsResponse> {
    // Usa cache para evitar recalcular os mesmos períodos
    const result = await this.kpiCacheService.getOrCalculate(
      'company',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpisByDateRangeSQLInternal(startDate, endDate),
      { start: startDate, end: endDate },
    );

    return result.data;
  }

  /**
   * Método interno que faz o cálculo real dos KPIs de Company
   * Chamado pelo cache service quando há cache miss
   */
  private async _calculateKpisByDateRangeSQLInternal(
    startDate: Date,
    endDate: Date,
  ): Promise<CompanyKpiApexChartsResponse> {
    // Controller já adiciona D+1, não precisa fazer novamente aqui
    // Formatação das datas para SQL (seguindo padrão do bookings.service)
    const formattedStart = moment.utc(startDate).format('YYYY-MM-DD HH:mm:ss');

    const formattedEnd = moment.utc(endDate).format('YYYY-MM-DD HH:mm:ss');

    // Gera array completo de datas APENAS no período solicitado pelo usuário (exibição)
    const periodsArray: string[] = [];
    let currentDate = moment(startDate).utc();
    const userEndDate = moment(endDate).utc();

    while (currentDate.isBefore(userEndDate, 'day')) {
      periodsArray.push(currentDate.format('DD/MM/YYYY'));
      currentDate.add(1, 'day');
    }

    // Função SQL para calcular receita completa (locação + vendas diretas)
    const getTotalRevenueSQL = () => `(
      COALESCE(CAST(la.valorliquidolocacao AS DECIMAL), 0) +
      COALESCE(
        CASE
          WHEN vd.stockoutid IS NOT NULL THEN (
            SELECT COALESCE(SUM(
              (CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))) -
              COALESCE((CAST(v.desconto AS DECIMAL(15,4)) /
                NULLIF((SELECT COUNT(*) FROM saidaestoqueitem sei2 WHERE sei2.id_saidaestoque = sei.id_saidaestoque AND sei2.cancelado IS NULL), 0)
              ), 0)
            ), 0)
            FROM saidaestoqueitem sei
            LEFT JOIN venda v ON sei.id_saidaestoque = v.id_saidaestoque
            WHERE sei.id_saidaestoque = vd.stockoutid
              AND sei.cancelado IS NULL
          )
          ELSE 0
        END, 0
      )
    )`;

    // SQL BigNumbers - CORRIGIDO para não duplicar desconto
    const bigNumbersSQL = `
      WITH receita_consumo AS (
        -- Calcula receita de consumo BRUTA (sem aplicar desconto aqui)
        -- O desconto de consumo já está incluído em locacaoapartamento.desconto
        -- Filtrando apenas locações de apartamentos das categorias corretas (10,11,12,15,16,17,18,19,24)
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
        WHERE la.datainicialdaocupacao >= '${formattedStart}'
          AND la.datainicialdaocupacao <= '${formattedEnd}'
          AND la.fimocupacaotipo = 'FINALIZADA'
          AND sei.cancelado IS NULL
          AND ca_apt.id IN (10,11,12,15,16,17,18,19,24)
        GROUP BY la.id_apartamentostate, vl.id_locacaoapartamento
      )
      SELECT
        COUNT(*) as total_rentals,
        -- totalAllValue: (permanencia + ocupadicional + consumo_bruto) - desconto
        -- Importante: la.desconto já contém desconto de locação + desconto de consumo
        COALESCE(SUM(
          COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
          COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) +
          COALESCE(rc.valor_consumo_bruto, 0) -
          COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
        ), 0) as total_all_value,
        -- Receita apenas de locação (permanenceValueTotal + ocupadicionalValueTotal - desconto_locação)
        COALESCE(SUM(
          COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
          COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) -
          COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
        ), 0) as total_rental_revenue,
        -- Tempo total de ocupação em segundos
        COALESCE(SUM(
          EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao)
        ), 0) as total_occupied_time
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca_apt ON a.id_categoriaapartamento = ca_apt.id
      LEFT JOIN receita_consumo rc ON la.id_apartamentostate = rc.id_locacao
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca_apt.id IN (10,11,12,15,16,17,18,19,24)
    `;

    // SQL para vendas diretas - CORRIGIDO para dividir desconto proporcionalmente entre itens
    // O desconto em venda.desconto deve ser dividido pelo número de itens da venda
    const totalSaleDirectSQL = `
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
          AND sei.datasaidaitem >= '${formattedStart}'
          AND sei.datasaidaitem <= '${formattedEnd}'
      ) vendas_diretas_detalhadas
    `;

    const totalSuitesSQL = `
      SELECT COUNT(*) as total_suites
      FROM apartamento a
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE ca.descricao IN ('LUSH', 'LUSH POP', 'LUSH HIDRO', 'LUSH LOUNGE', 'LUSH SPA', 'LUSH CINE', 'LUSH SPLASH', 'LUSH SPA SPLASH', 'CASA LUSH')
        AND a.dataexclusao IS NULL
    `;

    const revenueByDateSQL = `
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END as date,
        COALESCE(SUM(${getTotalRevenueSQL()}), 0) as daily_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      LEFT JOIN (
        SELECT se.id as stockoutid, sd.id_saidaestoque
        FROM saidaestoque se
        INNER JOIN vendadireta sd ON se.id = sd.id_saidaestoque
        WHERE sd.venda_completa = true
      ) vd ON FALSE
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
      GROUP BY CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END
      ORDER BY date
    `;

    const billingRentalTypeSQL = `
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END as date,
        CASE
          WHEN EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao) / 3600 BETWEEN 5.5 AND 6.5 THEN 'SIX_HOURS'
          WHEN EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao) / 3600 BETWEEN 11.5 AND 12.5 THEN 'TWELVE_HOURS'
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) = 13 THEN 'DAY_USE'
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) = 15 THEN 'DAILY'
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) = 20 THEN 'OVERNIGHT'
          ELSE 'THREE_HOURS'
        END as rental_type,
        COALESCE(SUM(${getTotalRevenueSQL()}), 0) as total_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      LEFT JOIN (
        SELECT se.id as stockoutid, sd.id_saidaestoque
        FROM saidaestoque se
        INNER JOIN vendadireta sd ON se.id = sd.id_saidaestoque
        WHERE sd.venda_completa = true
      ) vd ON FALSE
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
      GROUP BY
        CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END,
        CASE
          WHEN EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao) / 3600 BETWEEN 5.5 AND 6.5 THEN 'SIX_HOURS'
          WHEN EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao) / 3600 BETWEEN 11.5 AND 12.5 THEN 'TWELVE_HOURS'
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) = 13 THEN 'DAY_USE'
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) = 15 THEN 'DAILY'
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) = 20 THEN 'OVERNIGHT'
          ELSE 'THREE_HOURS'
        END
      ORDER BY date, rental_type
    `;

    // Define consultas SQL adicionais para incluir no Promise.all
    const revenueBySuiteCategorySQL = `
      SELECT
        ca.descricao as suite_category,
        COALESCE(SUM(${getTotalRevenueSQL()}), 0) as category_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      LEFT JOIN (
        SELECT se.id as stockoutid, sd.id_saidaestoque
        FROM saidaestoque se
        INNER JOIN vendadireta sd ON se.id = sd.id_saidaestoque
        WHERE sd.venda_completa = true
      ) vd ON FALSE
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca.descricao IN ('LUSH', 'LUSH POP', 'LUSH HIDRO', 'LUSH LOUNGE', 'LUSH SPA', 'LUSH CINE', 'LUSH SPLASH', 'LUSH SPA SPLASH', 'CASA LUSH')
      GROUP BY ca.descricao
      ORDER BY category_revenue DESC
    `;

    const rentalsByDateSQL = `
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
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca.descricao IN ('LUSH', 'LUSH POP', 'LUSH HIDRO', 'LUSH LOUNGE', 'LUSH SPA', 'LUSH CINE', 'LUSH SPLASH', 'LUSH SPA SPLASH', 'CASA LUSH')
      GROUP BY CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END
      ORDER BY date
    `;

    const ticketAverageByDateSQL = `
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END as date,
        COALESCE(AVG(CAST(la.valortotal AS DECIMAL)), 0) as avg_ticket
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
      GROUP BY CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END
      ORDER BY date
    `;

    const trevparByDateSQL = `
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END as date,
        COALESCE(SUM(${getTotalRevenueSQL()} + CAST(la.gorjeta AS DECIMAL)), 0) as total_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      LEFT JOIN (
        SELECT se.id as stockoutid, sd.id_saidaestoque
        FROM saidaestoque se
        INNER JOIN vendadireta sd ON se.id = sd.id_saidaestoque
        WHERE sd.venda_completa = true
      ) vd ON FALSE
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
      GROUP BY CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END
      ORDER BY date
    `;

    const occupancyRateBySuiteCategorySQL = `
      SELECT
        ca.descricao as suite_category,
        DATE(la.datainicialdaocupacao) as rental_date,
        COUNT(la.id_apartamentostate) as total_rentals
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca.descricao IN ('LUSH', 'LUSH POP', 'LUSH HIDRO', 'LUSH LOUNGE', 'LUSH SPA', 'LUSH CINE', 'LUSH SPLASH', 'LUSH SPA SPLASH', 'CASA LUSH')
      GROUP BY ca.descricao, DATE(la.datainicialdaocupacao)
      ORDER BY rental_date, ca.descricao
    `;

    const suitesByCategorySQL = `
      SELECT
        ca.descricao as suite_category,
        COUNT(a.id) as total_suites_in_category
      FROM apartamento a
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE ca.descricao IN ('LUSH', 'LUSH POP', 'LUSH HIDRO', 'LUSH LOUNGE', 'LUSH SPA', 'LUSH CINE', 'LUSH SPLASH', 'LUSH SPA SPLASH', 'CASA LUSH')
        AND a.dataexclusao IS NULL
      GROUP BY ca.descricao
    `;

    // Executa TODAS as consultas SQL em paralelo (seguindo padrão do bookings.service)
    const [
      bigNumbersResult,
      totalSaleDirectResult,
      totalSuitesResult,
      revenueByDateResult,
      billingRentalTypeResult,
      revenueBySuiteCategoryResult,
      rentalsByDateResult,
      ticketAverageByDateResult,
      trevparByDateResult,
      occupancyRateBySuiteCategoryResult,
      suitesByCategoryResult,
    ] = await Promise.all([
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([bigNumbersSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([totalSaleDirectSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([totalSuitesSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([revenueByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([billingRentalTypeSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([revenueBySuiteCategorySQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([rentalsByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([ticketAverageByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([trevparByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([occupancyRateBySuiteCategorySQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([suitesByCategorySQL])),
    ]);

    // Processa BigNumbers
    const totalSuitesCount =
      totalSuitesResult.length > 0 ? Number(totalSuitesResult[0].total_suites) || 1 : 1;
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24));

    const bigNumbers: BigNumbersDataSQL = {
      currentDate: {
        totalAllValue: 0,
        totalAllRentalsApartments: 0,
        totalAllTicketAverage: 0,
        totalAllTrevpar: 0,
        totalAllGiro: 0,
        totalAverageOccupationTime: '00:00:00',
      },
    };

    if (bigNumbersResult && bigNumbersResult.length > 0) {
      const result = bigNumbersResult[0];
      const totalAllValue = Number(result.total_all_value) || 0; // locações
      const totalRentals = Number(result.total_rentals) || 0;
      const totalOccupiedTime = Number(result.total_occupied_time) || 0;

      // Vendas diretas com correção para 100% precisão
      const totalSaleDirect =
        totalSaleDirectResult && totalSaleDirectResult.length > 0
          ? Number(totalSaleDirectResult[0].total_sale_direct) || 0
          : 0;

      // 🔍 INVESTIGAÇÃO REAL DAS VENDAS DIRETAS:

      // Executar a query investigativa
      try {
        const investigationResult = await this.prisma.prismaLocal.$queryRaw`
          SELECT
            se.id as venda_id,
            vd.venda_completa,
            sei.id as item_id,
            sei.precovenda,
            sei.quantidade,
            (CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))) as valor_item,
            v.desconto as desconto_venda,
            sei.datasaidaitem,
            sei.cancelado
          FROM saidaestoque se
          INNER JOIN vendadireta vd ON se.id = vd.id_saidaestoque
          INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
          LEFT JOIN venda v ON se.id = v.id_saidaestoque
          WHERE vd.venda_completa = true
            AND sei.cancelado IS NULL
            AND sei.datasaidaitem >= ${formattedStart}::timestamp
            AND sei.datasaidaitem <= ${formattedEnd}::timestamp
          ORDER BY se.id, sei.id
        `;

        // Agrupar por venda para análise
        const vendasDetalhadas: any = {};
        let totalReceitaManual = 0;
        let totalDescontoManual = 0;

        (investigationResult as any[]).forEach((item: any) => {
          const vendaId = item.venda_id;

          if (!vendasDetalhadas[vendaId]) {
            vendasDetalhadas[vendaId] = {
              venda_id: vendaId,
              desconto: Number(item.desconto_venda) || 0,
              itens: [],
              receita_bruta: 0,
            };
          }

          const valorItem = Number(item.valor_item);
          vendasDetalhadas[vendaId].itens.push({
            item_id: item.item_id,
            precovenda: Number(item.precovenda),
            quantidade: Number(item.quantidade),
            valor_item: valorItem,
          });

          vendasDetalhadas[vendaId].receita_bruta += valorItem;
        });

        // Calcular totais manualmente
        Object.values(vendasDetalhadas).forEach((venda: any) => {
          totalReceitaManual += venda.receita_bruta;
          totalDescontoManual += venda.desconto;
        });
      } catch (error) {
        // Erro na investigação ignorado para não quebrar o fluxo
      }

      // totalAllValue = locação + vendas diretas
      const finalTotalAllValue = totalAllValue + totalSaleDirect;

      // Cálculos baseados na função original
      const avgTicket =
        totalRentals > 0 ? Number((finalTotalAllValue / totalRentals).toFixed(2)) : 0;
      const giro =
        totalSuitesCount > 0 && daysDiff > 0
          ? Number((totalRentals / totalSuitesCount / daysDiff).toFixed(2))
          : 0;
      const trevpar =
        totalSuitesCount > 0 && daysDiff > 0
          ? Number((finalTotalAllValue / totalSuitesCount / daysDiff).toFixed(2))
          : 0;
      const avgOccupationTime =
        totalRentals > 0 ? this.formatTime(totalOccupiedTime / totalRentals) : '00:00:00';

      bigNumbers.currentDate = {
        totalAllValue: Number(finalTotalAllValue.toFixed(2)),
        totalAllRentalsApartments: totalRentals,
        totalAllTicketAverage: avgTicket,
        totalAllTrevpar: trevpar,
        totalAllGiro: giro,
        totalAverageOccupationTime: avgOccupationTime,
      };
    }

    // Cria mapeamento de dados por data (seguindo padrão do bookings.service)
    const revenueDataMap = new Map();

    // DEBUG: verificar dados retornados

    revenueByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = moment.utc(item.date).format('DD/MM/YYYY');
      revenueDataMap.set(dateKey, item);
    });

    const revenueByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = revenueDataMap.get(dateKey);
        return item ? Number(item.daily_revenue) : 0;
      }),
    };

    const revenueBySuiteCategory: ApexChartsData = {
      categories: revenueBySuiteCategoryResult.map((item) => item.suite_category),
      series: revenueBySuiteCategoryResult.map((item) => Number(item.category_revenue) || 0),
    };

    // Mapeamento de dados do BillingRentalType
    const billingDataMap = new Map();
    billingRentalTypeResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = moment.utc(item.date).format('DD/MM/YYYY');
      if (!billingDataMap.has(dateKey)) {
        billingDataMap.set(dateKey, {});
      }
      billingDataMap.get(dateKey)[item.rental_type] = Number(item.total_revenue);
    });

    // BillingRentalType seguindo padrão do bookings.service
    const allRentalTypes = [
      'THREE_HOURS',
      'SIX_HOURS',
      'TWELVE_HOURS',
      'DAY_USE',
      'DAILY',
      'OVERNIGHT',
    ];

    const billingRentalType: ApexChartsSeriesData = {
      categories: [...periodsArray],
      series: allRentalTypes.map((rentalType) => ({
        name: rentalType,
        data: [...periodsArray].map((dateKey: string) => {
          const item = billingDataMap.get(dateKey);
          return item && item[rentalType] ? item[rentalType] : 0;
        }),
      })),
    };

    // Criar mapeamento de dados para RentalsByDate (seguindo padrão do bookings.service)
    const rentalsDataMap = new Map();
    rentalsByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = moment.utc(item.date).format('DD/MM/YYYY');
      rentalsDataMap.set(dateKey, item);
    });

    const rentalsByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = rentalsDataMap.get(dateKey);
        return item ? Number(item.total_rentals) : 0;
      }),
    };

    // Obter total de suítes (já consultado no Promise.all)
    const totalSuites =
      totalSuitesResult.length > 0 ? Number(totalSuitesResult[0].total_suites) || 1 : 1;

    // Calcular REVPAR usando a receita já calculada e o número de suítes
    const revparByDate: ApexChartsData = {
      categories: revenueByDate.categories,
      series: revenueByDate.series.map((revenue) => Number((revenue / totalSuites).toFixed(2))),
    };

    // Criar mapeamento de dados para TicketAverageByDate (seguindo padrão do bookings.service)
    const ticketDataMap = new Map();
    ticketAverageByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = moment.utc(item.date).format('DD/MM/YYYY');
      ticketDataMap.set(dateKey, item);
    });

    const ticketAverageByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = ticketDataMap.get(dateKey);
        return item ? Number((Number(item.avg_ticket) || 0).toFixed(2)) : 0;
      }),
    };

    // Criar mapeamento de dados para TrevparByDate (seguindo padrão do bookings.service)
    const trevparDataMap = new Map();
    trevparByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = moment.utc(item.date).format('DD/MM/YYYY');
      trevparDataMap.set(dateKey, item);
    });

    const trevparByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = trevparDataMap.get(dateKey);
        return item ? Number((Number(item.total_revenue) / totalSuites).toFixed(2)) : 0;
      }),
    };

    // Calcular OccupancyRateByDate - Taxa de ocupação por data (usando dados já coletados)
    const occupancyRateByDate: ApexChartsData = {
      categories: rentalsByDate.categories,
      series: rentalsByDate.series.map((rentals) => {
        const occupancyRate = rentals / totalSuites;
        return Number(occupancyRate.toFixed(2));
      }),
    };

    // Calcular taxa de ocupação por categoria (formato ApexCharts com dates em categories e suites em series)
    const occupancyBySuiteCategoryMap = new Map<string, Map<string, number>>();
    const allSuiteCategoriesSet = new Set<string>();
    const allDatesSet = new Set<string>();

    // Processar dados do occupancyRateBySuiteCategoryResult
    occupancyRateBySuiteCategoryResult.forEach((item) => {
      const dateKey = moment(item.rental_date).format('DD/MM/YYYY');
      const suiteCategoryName = item.suite_category;
      const totalRentals = Number(item.total_rentals) || 0;

      // Calcular taxa de ocupação baseada no número de suítes da categoria
      const categoryInfo = suitesByCategoryResult.find(
        (s) => s.suite_category === suiteCategoryName,
      );
      const totalSuitesInCategory = categoryInfo
        ? Number(categoryInfo.total_suites_in_category)
        : 1;
      const occupancyRate = Number((totalRentals / totalSuitesInCategory).toFixed(2));

      allDatesSet.add(dateKey);
      allSuiteCategoriesSet.add(suiteCategoryName);

      if (!occupancyBySuiteCategoryMap.has(dateKey)) {
        occupancyBySuiteCategoryMap.set(dateKey, new Map());
      }
      occupancyBySuiteCategoryMap.get(dateKey)!.set(suiteCategoryName, occupancyRate);
    });

    // Criar array de datas ordenadas
    const sortedDates = Array.from(allDatesSet).sort((a, b) => {
      const dateA = moment(a, 'DD/MM/YYYY');
      const dateB = moment(b, 'DD/MM/YYYY');
      return dateA.isBefore(dateB) ? -1 : 1;
    });

    // Criar series para cada categoria de suíte
    const occupancyRateBySuiteCategory: ApexChartsSeriesData = {
      categories: sortedDates,
      series: Array.from(allSuiteCategoriesSet).map((suiteCategoryName) => ({
        name: suiteCategoryName,
        data: sortedDates.map(
          (date) => occupancyBySuiteCategoryMap.get(date)?.get(suiteCategoryName) || 0,
        ),
      })),
    };

    // === IMPLEMENTAÇÃO DO DATATABLESUITEACATEGORY ===
    // Consulta SQL para KPIs por categoria de suíte usando campos corretos do schema
    const suiteCategoryKpisResult: any[] = await this.prisma.prismaLocal.$queryRaw`
      WITH suite_category_data AS (
        SELECT
          ca.descricao as suite_category_name,
          COUNT(*) as total_rentals,
          -- Receita total: (permanencia + ocupadicional + consumo) - desconto
          -- Importante: la.desconto já contém desconto de locação + desconto de consumo
          COALESCE(SUM(
            COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
            COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) +
            COALESCE(
              (
                SELECT COALESCE(SUM(
                  CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))
                ), 0)
                FROM vendalocacao vl
                INNER JOIN saidaestoque se ON vl.id_saidaestoque = se.id
                INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
                WHERE vl.id_locacaoapartamento = la.id_apartamentostate
                  AND sei.cancelado IS NULL
              ), 0
            ) -
            COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
          ), 0) as total_value,
          -- Receita apenas de locação: (permanencia + ocupadicional) - desconto
          COALESCE(SUM(
            COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
            COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) -
            COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
          ), 0) as rental_revenue,
          -- Tempo total de ocupação em segundos
          COALESCE(SUM(
            EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao)
          ), 0) as total_occupied_time
        FROM locacaoapartamento la
        INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE la.datainicialdaocupacao >= ${formattedStart}::timestamp
          AND la.datainicialdaocupacao <= ${formattedEnd}::timestamp
          AND la.fimocupacaotipo = 'FINALIZADA'
          AND ca.id IN (10,11,12,15,16,17,18,19,24)
          GROUP BY ca.id, ca.descricao
      ),
      suite_counts AS (
        SELECT
          ca.descricao as suite_category_name,
          COUNT(DISTINCT a.id) as total_suites_in_category
        FROM categoriaapartamento ca
        INNER JOIN apartamento a ON ca.id = a.id_categoriaapartamento
        WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
          AND a.dataexclusao IS NULL
        GROUP BY ca.id, ca.descricao
      ),
      all_unavailable_periods AS (
        -- União de todos os períodos de indisponibilidade (limpeza + defeitos/manutenções)
        -- Todos cortados para ficarem dentro do período de consulta
        SELECT
          ca.descricao as suite_category_name,
          a.id as apartamento_id,
          GREATEST(la.datainicio, ${formattedStart}::timestamp) as period_start,
          LEAST(la.datafim, ${formattedEnd}::timestamp) as period_end
        FROM limpezaapartamento la
        INNER JOIN apartamentostate aps ON la.id_sujoapartamento = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE la.datainicio < ${formattedEnd}::timestamp
          AND la.datafim > ${formattedStart}::timestamp
          AND la.datafim IS NOT NULL
          AND ca.id IN (10,11,12,15,16,17,18,19,24)

        UNION ALL

        -- Defeitos (sem manutenções)
        SELECT
          ca.descricao as suite_category_name,
          a.id as apartamento_id,
          GREATEST(d.datainicio, ${formattedStart}::timestamp) as period_start,
          LEAST(d.datafim, ${formattedEnd}::timestamp) as period_end
        FROM defeito d
        INNER JOIN apartamento a ON d.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE d.datainicio < ${formattedEnd}::timestamp
          AND d.datafim > ${formattedStart}::timestamp
          AND d.datafim IS NOT NULL
          AND ca.id IN (10,11,12,15,16,17,18,19,24)
      ),
      periods_with_lag AS (
        -- Adicionar informação do período anterior
        SELECT
          suite_category_name,
          apartamento_id,
          period_start,
          period_end,
          LAG(period_end) OVER (PARTITION BY suite_category_name, apartamento_id ORDER BY period_start, period_end) as prev_end
        FROM all_unavailable_periods
      ),
      periods_with_groups AS (
        -- Criar grupos baseado em sobreposição
        SELECT
          suite_category_name,
          apartamento_id,
          period_start,
          period_end,
          SUM(CASE WHEN period_start <= prev_end THEN 0 ELSE 1 END)
            OVER (PARTITION BY suite_category_name, apartamento_id ORDER BY period_start, period_end
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as period_group
        FROM periods_with_lag
      ),
      merged_intervals AS (
        -- Calcular intervalo mesclado para cada grupo
        SELECT
          suite_category_name,
          apartamento_id,
          period_group,
          MIN(period_start) as merged_start,
          MAX(period_end) as merged_end
        FROM periods_with_groups
        GROUP BY suite_category_name, apartamento_id, period_group
        HAVING MAX(period_end) > MIN(period_start)
      ),
      unavailable_times AS (
        -- Calcular tempo em segundos para cada intervalo mesclado
        SELECT
          suite_category_name,
          EXTRACT(EPOCH FROM (merged_end - merged_start)) as unavailable_time_seconds
        FROM merged_intervals
      ),
      total_unavailable AS (
        SELECT
          suite_category_name,
          SUM(unavailable_time_seconds) as total_unavailable_time
        FROM unavailable_times
        GROUP BY suite_category_name
      )
      SELECT
        scd.suite_category_name,
        scd.total_rentals,
        scd.total_value,
        scd.rental_revenue,
        scd.total_occupied_time,
        sc.total_suites_in_category,
        COALESCE(tu.total_unavailable_time, 0) as unavailable_time
      FROM suite_category_data scd
      INNER JOIN suite_counts sc ON scd.suite_category_name = sc.suite_category_name
      LEFT JOIN total_unavailable tu ON scd.suite_category_name = tu.suite_category_name
      ORDER BY scd.suite_category_name
    `;

    // Calcular período em dias (igual ao BigNumbers)
    const periodDays = moment(endDate).diff(moment(startDate), 'days') + 1;

    // Transformar os resultados no formato esperado com cálculos corretos
    const dataTableSuiteCategory: any[] = suiteCategoryKpisResult.map((item) => {
      const totalRentals = Number(item.total_rentals) || 0;
      const totalValue = Number(item.total_value) || 0;
      const rentalRevenue = Number(item.rental_revenue) || 0;
      const totalOccupiedTime = Number(item.total_occupied_time) || 0;
      const totalSuitesInCategory = Number(item.total_suites_in_category) || 1;
      const unavailableTime = Number(item.unavailable_time) || 0;

      // Aplicar as mesmas fórmulas do BigNumbers
      const ticketAverage = totalRentals > 0 ? totalValue / totalRentals : 0;
      const giro =
        totalSuitesInCategory > 0 && periodDays > 0
          ? totalRentals / totalSuitesInCategory / periodDays
          : 0;
      const revpar =
        totalSuitesInCategory > 0 && periodDays > 0
          ? rentalRevenue / totalSuitesInCategory / periodDays
          : 0;
      const trevpar =
        totalSuitesInCategory > 0 && periodDays > 0
          ? totalValue / totalSuitesInCategory / periodDays
          : 0;
      const avgOccupationTime = totalRentals > 0 ? totalOccupiedTime / totalRentals : 0;

      // Taxa de ocupação CORRETA: (tempo ocupado / tempo disponível) × 100
      // Tempo disponível = (suítes × dias × 86400 segundos) - tempo indisponível
      const totalAvailableTime = totalSuitesInCategory * periodDays * 86400 - unavailableTime;
      const occupancyRate =
        totalAvailableTime > 0 ? (totalOccupiedTime / totalAvailableTime) * 100 : 0;

      return {
        [item.suite_category_name]: {
          totalRentalsApartments: totalRentals,
          totalValue: Number(totalValue.toFixed(2)),
          totalTicketAverage: Number(ticketAverage.toFixed(2)),
          giro: Number(giro.toFixed(2)),
          revpar: Number(revpar.toFixed(2)),
          trevpar: Number(trevpar.toFixed(2)),
          averageOccupationTime: this.formatTime(avgOccupationTime),
          occupancyRate: Number(occupancyRate.toFixed(2)),
        },
      };
    });

    // === IMPLEMENTAÇÃO DO DATATABLEOCCUPANCYRATEBYWEEK ===
    // Solução otimizada com 3 queries simples + processamento TypeScript

    // Query 1: Buscar todas as ocupações
    const rentalsData: any[] = await this.prisma.prismaLocal.$queryRaw`
      SELECT
        ca.descricao as category_name,
        la.datainicialdaocupacao as check_in,
        la.datafinaldaocupacao as check_out
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE la.datainicialdaocupacao >= ${formattedStart}::timestamp
        AND la.datainicialdaocupacao <= ${formattedEnd}::timestamp
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca.id IN (10,11,12,15,16,17,18,19,24)
    `;

    // Query 2: Buscar tempos indisponíveis (COM MERGE de intervalos sobrepostos)
    const unavailableTimesData: any[] = await this.prisma.prismaLocal.$queryRaw`
      WITH all_unavailable_periods AS (
        -- Limpezas
        SELECT
          ca.descricao as category_name,
          a.id as apartamento_id,
          GREATEST(la.datainicio, ${formattedStart}::timestamp) as period_start,
          LEAST(la.datafim, ${formattedEnd}::timestamp) as period_end
        FROM limpezaapartamento la
        INNER JOIN apartamentostate aps ON la.id_sujoapartamento = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE la.datainicio < ${formattedEnd}::timestamp
          AND la.datafim > ${formattedStart}::timestamp
          AND la.datafim IS NOT NULL
          AND ca.id IN (10,11,12,15,16,17,18,19,24)

        UNION ALL

        -- Defeitos
        SELECT
          ca.descricao as category_name,
          a.id as apartamento_id,
          GREATEST(d.datainicio, ${formattedStart}::timestamp) as period_start,
          LEAST(d.datafim, ${formattedEnd}::timestamp) as period_end
        FROM defeito d
        INNER JOIN apartamento a ON d.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE d.datainicio < ${formattedEnd}::timestamp
          AND d.datafim > ${formattedStart}::timestamp
          AND d.datafim IS NOT NULL
          AND ca.id IN (10,11,12,15,16,17,18,19,24)
      ),
      periods_with_lag AS (
        SELECT
          category_name,
          apartamento_id,
          period_start,
          period_end,
          LAG(period_end) OVER (PARTITION BY category_name, apartamento_id ORDER BY period_start, period_end) as prev_end
        FROM all_unavailable_periods
      ),
      periods_with_groups AS (
        SELECT
          category_name,
          apartamento_id,
          period_start,
          period_end,
          SUM(CASE WHEN period_start <= prev_end THEN 0 ELSE 1 END)
            OVER (PARTITION BY category_name, apartamento_id ORDER BY period_start, period_end
                  ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as period_group
        FROM periods_with_lag
      ),
      merged_intervals AS (
        SELECT
          category_name,
          apartamento_id,
          period_group,
          MIN(period_start) as merged_start,
          MAX(period_end) as merged_end
        FROM periods_with_groups
        GROUP BY category_name, apartamento_id, period_group
        HAVING MAX(period_end) > MIN(period_start)
      )
      SELECT
        category_name,
        merged_start as start_date,
        merged_end as end_date
      FROM merged_intervals
      ORDER BY category_name, start_date
    `;

    // Query 3: Metadados (suítes por categoria)
    const metadataResult: any[] = await this.prisma.prismaLocal.$queryRaw`
      SELECT
        ca.descricao as category_name,
        COUNT(DISTINCT a.id) as total_suites
      FROM categoriaapartamento ca
      INNER JOIN apartamento a ON ca.id = a.id_categoriaapartamento
      WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
      GROUP BY ca.descricao
    `;

    // Processar dados no TypeScript
    const timezone = 'America/Sao_Paulo';
    const dayNames = [
      'domingo',
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
    ];

    // Contar quantos dias de cada dia da semana existem no período
    const dayCountMap: { [key: string]: number } = {};
    const currentMoment = moment.tz(startDate, timezone).clone();
    const endMoment = moment.tz(endDate, timezone);
    while (currentMoment.isSameOrBefore(endMoment, 'day')) {
      const dayOfWeek = dayNames[currentMoment.day()];
      dayCountMap[dayOfWeek] = (dayCountMap[dayOfWeek] || 0) + 1;
      currentMoment.add(1, 'day');
    }

    // Criar estrutura de dados
    const occupancyByCategory: {
      [category: string]: { [day: string]: { occupiedTime: number; unavailableTime: number } };
    } = {};

    metadataResult.forEach((meta) => {
      occupancyByCategory[meta.category_name] = {};
      dayNames.forEach((day) => {
        occupancyByCategory[meta.category_name][day] = {
          occupiedTime: 0,
          unavailableTime: 0,
        };
      });
    });

    // Distribuir tempo ocupado pelos dias da semana corretos
    // IMPORTANTE: Distribuir proporcionalmente pelos dias que a locação realmente ocupou
    rentalsData.forEach((rental) => {
      const checkIn = moment.tz(rental.check_in, timezone);
      const checkOut = moment.tz(rental.check_out, timezone);
      const category = rental.category_name;

      // Iterar por cada dia que a locação ocupou
      let currentDay = checkIn.clone().startOf('day');
      const lastDay = checkOut.clone().startOf('day');

      while (currentDay.isSameOrBefore(lastDay, 'day')) {
        const dayOfWeek = dayNames[currentDay.day()];

        // Calcular quanto tempo foi ocupado neste dia específico
        const dayStart = moment.max(currentDay.clone().startOf('day'), checkIn);
        const dayEnd = moment.min(currentDay.clone().endOf('day'), checkOut);
        const timeInDay = dayEnd.diff(dayStart, 'seconds');

        if (
          occupancyByCategory[category] &&
          occupancyByCategory[category][dayOfWeek] &&
          timeInDay > 0
        ) {
          occupancyByCategory[category][dayOfWeek].occupiedTime += timeInDay;
        }

        currentDay.add(1, 'day');
      }
    });

    // Distribuir tempo indisponível pelos dias da semana corretos
    // IMPORTANTE: Distribuir proporcionalmente pelos dias que o período realmente ocupou

    // MERGE adicional de períodos sobrepostos no TypeScript (garantia extra)
    // Agrupar por categoria e ordenar por data de início
    const unavailableByCategory: { [key: string]: any[] } = {};
    unavailableTimesData.forEach((unavailable) => {
      const category = unavailable.category_name;
      if (!unavailableByCategory[category]) {
        unavailableByCategory[category] = [];
      }
      unavailableByCategory[category].push(unavailable);
    });

    // Mesclar períodos sobrepostos para cada categoria
    const mergedUnavailableData: any[] = [];
    Object.keys(unavailableByCategory).forEach((category) => {
      const periods = unavailableByCategory[category].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
      );

      if (periods.length === 0) return;

      const merged: any[] = [];
      let current = periods[0];

      for (let i = 1; i < periods.length; i++) {
        const next = periods[i];
        const currentEnd = new Date(current.end_date).getTime();
        const nextStart = new Date(next.start_date).getTime();

        // Se há sobreposição ou são contíguos, mesclar
        if (nextStart <= currentEnd) {
          current = {
            category_name: category,
            start_date: current.start_date,
            end_date:
              new Date(next.end_date).getTime() > currentEnd ? next.end_date : current.end_date,
          };
        } else {
          // Não há sobreposição, salvar o atual e começar novo
          merged.push(current);
          current = next;
        }
      }
      merged.push(current); // Adicionar o último

      mergedUnavailableData.push(...merged);
    });

    mergedUnavailableData.forEach((unavailable) => {
      const startTime = moment.tz(unavailable.start_date, timezone);
      const endTime = moment.tz(unavailable.end_date, timezone);
      const category = unavailable.category_name;

      // Iterar por cada dia que o período de indisponibilidade ocupou
      let currentDay = startTime.clone().startOf('day');
      const lastDay = endTime.clone().startOf('day');

      while (currentDay.isSameOrBefore(lastDay, 'day')) {
        const dayOfWeek = dayNames[currentDay.day()];

        // Calcular quanto tempo foi indisponível neste dia específico
        const dayStart = moment.max(currentDay.clone().startOf('day'), startTime);
        const dayEnd = moment.min(currentDay.clone().endOf('day'), endTime);
        const timeInDay = dayEnd.diff(dayStart, 'seconds');

        if (
          occupancyByCategory[category] &&
          occupancyByCategory[category][dayOfWeek] &&
          timeInDay > 0
        ) {
          occupancyByCategory[category][dayOfWeek].unavailableTime += timeInDay;
        }

        currentDay.add(1, 'day');
      }
    });

    // Calcular taxa de ocupação
    const totalOccupancyByDay: { [key: string]: { occupied: number; available: number } } = {};
    dayNames.forEach((day) => {
      totalOccupancyByDay[day] = { occupied: 0, available: 0 };
    });

    const dataTableOccupancyRateByWeek: any[] = metadataResult.map((meta) => {
      const category = meta.category_name;
      const totalSuites = Number(meta.total_suites);
      const dayData: any = {};

      dayNames.forEach((day) => {
        const daysCount = dayCountMap[day] || 0;
        const occupiedTime = occupancyByCategory[category][day].occupiedTime;
        const unavailableTime = occupancyByCategory[category][day].unavailableTime;
        const availableTime = daysCount * totalSuites * 86400 - unavailableTime;

        const occupancyRate = availableTime > 0 ? (occupiedTime / availableTime) * 100 : 0;

        dayData[day] = {
          occupancyRate: Number(occupancyRate.toFixed(2)),
          totalOccupancyRate: 0, // será calculado depois
        };

        // Acumular para total geral
        totalOccupancyByDay[day].occupied += occupiedTime;
        totalOccupancyByDay[day].available += availableTime;
      });

      return { [category]: dayData };
    });

    // Calcular e preencher totalOccupancyRate
    dataTableOccupancyRateByWeek.forEach((item) => {
      const category = Object.keys(item)[0];
      dayNames.forEach((day) => {
        const totalRate =
          totalOccupancyByDay[day].available > 0
            ? (totalOccupancyByDay[day].occupied / totalOccupancyByDay[day].available) * 100
            : 0;
        item[category][day].totalOccupancyRate = Number(totalRate.toFixed(2));
      });
    });

    // === IMPLEMENTAÇÃO DO DATATABLEGIROBYWEEK ===
    // Consulta SQL para giro semanal por categoria
    const giroByWeekResult: any[] = await this.prisma.prismaLocal.$queryRaw`
      WITH weekly_giro AS (
        SELECT
          ca.descricao as suite_category_name,
          EXTRACT(DOW FROM
            CASE
              WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
              ELSE la.datainicialdaocupacao
            END
          ) as day_of_week_num,
          CASE EXTRACT(DOW FROM
            CASE
              WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
              ELSE la.datainicialdaocupacao
            END
          )
            WHEN 0 THEN 'domingo'
            WHEN 1 THEN 'segunda-feira'
            WHEN 2 THEN 'terça-feira'
            WHEN 3 THEN 'quarta-feira'
            WHEN 4 THEN 'quinta-feira'
            WHEN 5 THEN 'sexta-feira'
            WHEN 6 THEN 'sábado'
          END as day_of_week,
          COUNT(*) as day_rentals
        FROM locacaoapartamento la
        INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE la.datainicialdaocupacao >= ${formattedStart}::timestamp
          AND la.datainicialdaocupacao <= ${formattedEnd}::timestamp
          AND la.fimocupacaotipo = 'FINALIZADA'
          AND ca.id IN (10,11,12,15,16,17,18,19,24)
          GROUP BY ca.id, ca.descricao, EXTRACT(DOW FROM
            CASE
              WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
              ELSE la.datainicialdaocupacao
            END
          )
      ),
      suite_counts_by_category AS (
        SELECT
          ca.descricao as suite_category_name,
          COUNT(DISTINCT a.id) as total_suites_in_category
        FROM categoriaapartamento ca
        INNER JOIN apartamento a ON ca.id = a.id_categoriaapartamento
        WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
          AND a.dataexclusao IS NULL
        GROUP BY ca.id, ca.descricao
      ),
      days_in_period AS (
        SELECT
          EXTRACT(DOW FROM d::date) as day_of_week_num,
          CASE EXTRACT(DOW FROM d::date)
            WHEN 0 THEN 'domingo'
            WHEN 1 THEN 'segunda-feira'
            WHEN 2 THEN 'terça-feira'
            WHEN 3 THEN 'quarta-feira'
            WHEN 4 THEN 'quinta-feira'
            WHEN 5 THEN 'sexta-feira'
            WHEN 6 THEN 'sábado'
          END as day_of_week,
          COUNT(*) as days_count
        FROM generate_series(${formattedStart}::timestamp, ${formattedEnd}::timestamp, '1 day'::interval) d
        GROUP BY EXTRACT(DOW FROM d::date)
      ),
      total_rentals_by_day AS (
        SELECT
          EXTRACT(DOW FROM
            CASE
              WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
              ELSE la.datainicialdaocupacao
            END
          ) as day_of_week_num,
          CASE EXTRACT(DOW FROM
            CASE
              WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
              ELSE la.datainicialdaocupacao
            END
          )
            WHEN 0 THEN 'domingo'
            WHEN 1 THEN 'segunda-feira'
            WHEN 2 THEN 'terça-feira'
            WHEN 3 THEN 'quarta-feira'
            WHEN 4 THEN 'quinta-feira'
            WHEN 5 THEN 'sexta-feira'
            WHEN 6 THEN 'sábado'
          END as day_of_week,
          COUNT(*) as total_day_rentals
        FROM locacaoapartamento la
        INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE la.datainicialdaocupacao >= ${formattedStart}::timestamp
          AND la.datainicialdaocupacao <= ${formattedEnd}::timestamp
          AND la.fimocupacaotipo = 'FINALIZADA'
          AND ca.id IN (10,11,12,15,16,17,18,19,24)
          GROUP BY EXTRACT(DOW FROM
            CASE
              WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
              ELSE la.datainicialdaocupacao
            END
          )
      )
      SELECT
        wg.suite_category_name,
        wg.day_of_week,
        wg.day_rentals,
        sc.total_suites_in_category,
        dp.days_count,
        tr.total_day_rentals,
        -- Giro por categoria e dia da semana (locações por suíte por dia)
        CASE
          WHEN sc.total_suites_in_category > 0 AND dp.days_count > 0 THEN
            wg.day_rentals::DECIMAL / (sc.total_suites_in_category * dp.days_count)
          ELSE 0
        END as category_giro,
        -- Giro total para o dia da semana (todas as categorias)
        CASE
          WHEN ${totalSuites}::DECIMAL > 0 AND dp.days_count > 0 THEN
            tr.total_day_rentals::DECIMAL / (${totalSuites}::DECIMAL * dp.days_count)
          ELSE 0
        END as total_giro
      FROM weekly_giro wg
      INNER JOIN suite_counts_by_category sc ON wg.suite_category_name = sc.suite_category_name
      INNER JOIN days_in_period dp ON wg.day_of_week_num = dp.day_of_week_num
      INNER JOIN total_rentals_by_day tr ON wg.day_of_week_num = tr.day_of_week_num
      ORDER BY wg.suite_category_name, wg.day_of_week_num
    `;

    // Transformar os resultados no formato esperado (WeeklyGiroData[])
    const giroByCategory: { [category: string]: { [day: string]: any } } = {};

    giroByWeekResult.forEach((item) => {
      const categoryName = item.suite_category_name;
      const dayName = item.day_of_week;

      if (!giroByCategory[categoryName]) {
        giroByCategory[categoryName] = {};
      }

      giroByCategory[categoryName][dayName] = {
        giro: Number(Number(item.category_giro).toFixed(2)),
        totalGiro: Number(Number(item.total_giro).toFixed(2)),
      };
    });

    // Definir todos os dias da semana em português
    const allDaysOfWeekSQL = [
      'domingo',
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
    ];

    // Preencher dias ausentes com giro 0 para cada categoria de suíte
    Object.keys(giroByCategory).forEach((categoryName) => {
      // Pegar o totalGiro de qualquer dia existente para usar como referência
      const existingDay = Object.values(giroByCategory[categoryName])[0];
      const totalGiroReference = existingDay ? existingDay.totalGiro : 0;

      allDaysOfWeekSQL.forEach((day) => {
        if (!giroByCategory[categoryName][day]) {
          giroByCategory[categoryName][day] = {
            giro: 0,
            totalGiro: totalGiroReference,
          };
        }
      });
    });

    const dataTableGiroByWeek: any[] = Object.entries(giroByCategory).map(
      ([categoryName, dayData]) => ({
        [categoryName]: dayData,
      }),
    );

    // Calcular TotalResult somando todos os valores do DataTableSuiteCategory
    // Isso garante que os totais sejam a soma exata das categorias (SEM vendas diretas)
    const totalResultFromCategories = suiteCategoryKpisResult.reduce(
      (acc, item) => {
        acc.totalRentals += Number(item.total_rentals) || 0;
        acc.totalValue += Number(item.total_value) || 0;
        acc.rentalRevenue += Number(item.rental_revenue) || 0;
        acc.totalOccupiedTime += Number(item.total_occupied_time) || 0;
        acc.totalUnavailableTime += Number(item.unavailable_time) || 0;
        return acc;
      },
      {
        totalRentals: 0,
        totalValue: 0,
        rentalRevenue: 0,
        totalOccupiedTime: 0,
        totalUnavailableTime: 0,
      },
    );

    const totalResultTicketAverage =
      totalResultFromCategories.totalRentals > 0
        ? totalResultFromCategories.totalValue / totalResultFromCategories.totalRentals
        : 0;

    const totalResultGiro =
      totalSuitesCount > 0 && daysDiff > 0
        ? totalResultFromCategories.totalRentals / totalSuitesCount / daysDiff
        : 0;

    const totalResultRevpar =
      totalSuitesCount > 0 && daysDiff > 0
        ? totalResultFromCategories.rentalRevenue / totalSuitesCount / daysDiff
        : 0;

    const totalResultTrevpar =
      totalSuitesCount > 0 && daysDiff > 0
        ? totalResultFromCategories.totalValue / totalSuitesCount / daysDiff
        : 0;

    const totalResultAvgOccupationTime =
      totalResultFromCategories.totalRentals > 0
        ? totalResultFromCategories.totalOccupiedTime / totalResultFromCategories.totalRentals
        : 0;

    // Taxa de ocupação total CORRETA: (tempo ocupado / tempo disponível) × 100
    const totalResultAvailableTime =
      totalSuitesCount * daysDiff * 86400 - totalResultFromCategories.totalUnavailableTime;
    const totalResultOccupancyRate =
      totalResultAvailableTime > 0
        ? (totalResultFromCategories.totalOccupiedTime / totalResultAvailableTime) * 100
        : 0;

    // Retornos temporários (serão implementados um por vez)
    return {
      Company: 'Lush Ipiranga',
      BigNumbers: [bigNumbers],
      BillingRentalType: billingRentalType,
      RevenueByDate: revenueByDate,
      RevenueBySuiteCategory: revenueBySuiteCategory,
      RentalsByDate: rentalsByDate,
      RevparByDate: revparByDate,
      TicketAverageByDate: ticketAverageByDate,
      TrevparByDate: trevparByDate,
      OccupancyRateByDate: occupancyRateByDate,
      OccupancyRateBySuiteCategory: occupancyRateBySuiteCategory,
      DataTableSuiteCategory: dataTableSuiteCategory,
      TotalResult: {
        totalAllRentalsApartments: totalResultFromCategories.totalRentals,
        totalAllValue: Number(totalResultFromCategories.totalValue.toFixed(2)),
        totalAllTicketAverage: Number(totalResultTicketAverage.toFixed(2)),
        totalGiro: Number(totalResultGiro.toFixed(2)),
        totalRevpar: Number(totalResultRevpar.toFixed(2)),
        totalTrevpar: Number(totalResultTrevpar.toFixed(2)),
        totalAverageOccupationTime: this.formatTime(totalResultAvgOccupationTime),
        totalOccupancyRate: Number(totalResultOccupancyRate.toFixed(2)),
      },
      DataTableOccupancyRateByWeek: dataTableOccupancyRateByWeek,
      DataTableGiroByWeek: dataTableGiroByWeek,
    };
  }

  private determineRentalPeriod(checkIn: Date, checkOut: Date, Booking: any): string {
    const occupationTimeSeconds = this.calculateOccupationTime(checkIn, checkOut);

    // Convertendo check-in e check-out para objetos Date
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    const checkInHour = checkInDate.getHours();
    const checkOutHour = checkOutDate.getHours();
    const checkOutMinutes = checkOutDate.getMinutes();

    // Verificação por horas de ocupação (3, 6 e 12 horas)
    if (occupationTimeSeconds <= 3 * 3600 + 15 * 60) {
      return 'THREE_HOURS';
    } else if (occupationTimeSeconds <= 6 * 3600 + 15 * 60) {
      return 'SIX_HOURS';
    } else if (occupationTimeSeconds <= 12 * 3600 + 15 * 60) {
      return 'TWELVE_HOURS';
    }

    // Se houver reservas, calcular os tipos adicionais
    if (Booking && Array.isArray(Booking) && Booking.length > 0) {
      // Regra para Day Use
      if (checkInHour >= 13 && checkOutHour <= 19 && checkOutMinutes <= 15) {
        return 'DAY_USE';
      }

      // Regra para Overnight
      const overnightMinimumStaySeconds = 12 * 3600 + 15 * 60;
      if (
        checkInHour >= 20 &&
        checkInHour <= 23 &&
        checkOutHour >= 8 &&
        (checkOutHour < 12 || (checkOutHour === 12 && checkOutMinutes <= 15)) &&
        occupationTimeSeconds >= overnightMinimumStaySeconds
      ) {
        return 'OVERNIGHT';
      }

      // Verificacao para Diaria
      if (
        occupationTimeSeconds > 16 * 3600 + 15 * 60 ||
        (checkInHour <= 15 && (checkOutHour > 12 || (checkOutHour === 12 && checkOutMinutes <= 15)))
      ) {
        return 'DAILY';
      }
    }

    // Caso nenhuma condição acima seja satisfeita, retorna 12 horas como padrão
    return 'TWELVE_HOURS';
  }
}

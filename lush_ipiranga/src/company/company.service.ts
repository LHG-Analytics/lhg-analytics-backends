import { Injectable } from '@nestjs/common';
import { PeriodEnum, Prisma, RentalTypeEnum } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import * as moment from 'moment-timezone';

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
  constructor(private readonly prisma: PrismaService) {}

  async findAllCompany(period: PeriodEnum): Promise<CompanyKpiApexChartsResponse> {
    // Define o fuso horário padrão como São Paulo
    moment.tz.setDefault('America/Sao_Paulo');

    let startDate: Date, endDate: Date, startDatePrevious: Date, endDatePrevious: Date;

    // Obtém o horário atual em "America/Sao_Paulo"
    const todayInitial = moment.tz('America/Sao_Paulo').set({
      hour: 5,
      minute: 59,
      second: 59,
      millisecond: 999,
    });

    // Define o `endDate` como hoje às 05:59:59 no fuso horário local
    endDate = todayInitial.clone().toDate();

    // Calcula o `startDate` e os períodos anteriores com base no `period`
    switch (period) {
      case PeriodEnum.LAST_7_D:
        // Período atual: últimos 7 dias das 05:59 (ex: 22/09 05:59 até 29/09 05:59)
        startDate = todayInitial
          .clone()
          .subtract(7, 'days')
          .set({
            hour: 5,
            minute: 59,
            second: 59,
            millisecond: 999,
          })
          .toDate();

        // Período anterior: 7 dias antes do início do período atual
        startDatePrevious = moment(startDate).subtract(7, 'days').toDate();
        endDatePrevious = new Date(startDate);
        break;

      case PeriodEnum.LAST_30_D:
        // Período atual: últimos 30 dias
        startDate = todayInitial
          .clone()
          .subtract(30, 'days')
          .set({
            hour: 5,
            minute: 59,
            second: 59,
            millisecond: 999,
          })
          .toDate();

        // Período anterior: 30 dias antes do início do período atual
        startDatePrevious = moment(startDate).subtract(30, 'days').toDate();
        endDatePrevious = new Date(startDate);
        break;

      case PeriodEnum.LAST_6_M:
        // Período atual: últimos 6 meses
        startDate = todayInitial
          .clone()
          .subtract(6, 'months')
          .set({
            hour: 5,
            minute: 59,
            second: 59,
            millisecond: 999,
          })
          .toDate();

        // Período anterior: 6 meses antes do início do período atual
        startDatePrevious = moment(startDate).subtract(6, 'months').toDate();
        endDatePrevious = new Date(startDate);
        break;

      case PeriodEnum.ESTE_MES:
        // Período atual: desde o início do mês até hoje
        startDate = todayInitial
          .clone()
          .startOf('month')
          .set({
            hour: 5,
            minute: 59,
            second: 59,
            millisecond: 999,
          })
          .toDate();

        console.log('startDate:', startDate);

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

    // Datas geradas para as consultas

    // Consultas para buscar os dados de KPIs com base nas datas selecionadas
    const [
      KpiRevenue,
      KpiRevenuePreviousData,
      KpiRevenueNextData,
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
      this.prisma.prismaOnline.kpiRevenue.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
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

      // Dias que já passaram no mês (do dia 1 até hoje, incluindo hoje)
      const daysElapsed = todayForForecast.date(); // dia atual = quantos dias passaram

      // Dias restantes (de amanhã até o fim do mês)
      const remainingDays = totalDaysInMonth - daysElapsed;

      // Se temos dados suficientes e ainda restam dias no mês
      if (daysElapsed > 0 && remainingDays > 0) {
        // Buscar dados do período ESTE_MES que contém o acumulado desde o dia 1º até hoje
        const monthStartDate = currentMonthStart.toDate();
        const monthCurrentDate = todayForForecast.clone().endOf('day').toDate();

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

        // Média diária baseada no acumulado até hoje dividido pelos dias que já passaram
        const dailyAverageValue = daysElapsed > 0 ? monthlyTotalValue / daysElapsed : 0;
        const dailyAverageRentals = daysElapsed > 0 ? monthlyTotalRentals / daysElapsed : 0;
        const dailyAverageTrevpar = daysElapsed > 0 ? monthlyTotalTrevpar / daysElapsed : 0;
        const dailyAverageGiro = daysElapsed > 0 ? monthlyTotalGiro / daysElapsed : 0;

        // Projeção: dados atuais do mês + (média diária × dias restantes)
        bigNumbers.monthlyForecast = {
          totalAllValueForecast: Number(
            (monthlyTotalValue + dailyAverageValue * remainingDays).toFixed(2),
          ),
          totalAllRentalsApartmentsForecast: Math.round(
            monthlyTotalRentals + dailyAverageRentals * remainingDays,
          ),
          totalAllTicketAverageForecast: Number(monthlyTicketAverage), // Ticket médio não muda com projeção
          totalAllTrevparForecast: Number(
            (monthlyTotalTrevpar + dailyAverageTrevpar * remainingDays).toFixed(2),
          ),
          totalAllGiroForecast: Number(
            (monthlyTotalGiro + dailyAverageGiro * remainingDays).toFixed(2),
          ),
          totalAverageOccupationTimeForecast: monthlyAverageOccupationTime, // Tempo médio não muda com projeção
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

    // Gerar array completo de datas para o período
    const periodsArray: string[] = [];
    let currentDate = moment(startDate);

    // CORRIGINDO: Para incluir corretamente todos os dias operacionais
    // O endDate vem como próximo dia 05:59, então subtraímos 1 dia para pegar o último dia válido
    const userEndDate = moment(endDate).subtract(1, 'day').startOf('day');
    while (currentDate.isSameOrBefore(userEndDate, 'day')) {
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
      categories: periodsArray,
      series: periodsArray.map((date) => revenueByDateMap.get(date) || 0),
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

  async calculateKpisByDateRange(startDate: Date, endDate: Date): Promise<CompanyKpiResponse> {
    const [
      allRentalApartments,
      suiteCategories,
      cleanings,
      blockedMaintenanceDefects,
      stockOutItems,
    ] = await this.fetchKpiData(startDate, endDate);

    const groupedByStockOut = new Map<
      number,
      {
        items: typeof stockOutItems;
        discount: Prisma.Decimal;
      }
    >();

    for (const stockOutItem of stockOutItems) {
      const stockOut = stockOutItem.stockOuts;

      if (!stockOut?.saleDirect) continue;

      const stockOutId = stockOutItem.stockOutId;

      if (!groupedByStockOut.has(stockOutId)) {
        const discount = stockOut.sale?.discount
          ? new Prisma.Decimal(stockOut.sale.discount.toString())
          : new Prisma.Decimal(0);

        groupedByStockOut.set(stockOutId, {
          items: [],
          discount,
        });
      }

      groupedByStockOut.get(stockOutId)!.items.push(stockOutItem);
    }

    const totalSaleDirect = Array.from(groupedByStockOut.values()).reduce(
      (total, { items, discount }) => {
        const subtotal = items.reduce((sum, item) => {
          const price = new Prisma.Decimal(item.priceSale);
          const quantity = new Prisma.Decimal(item.quantity);
          return sum.plus(price.times(quantity));
        }, new Prisma.Decimal(0));

        return total.plus(subtotal.minus(discount));
      },
      new Prisma.Decimal(0),
    );

    let totalSuites = 0;
    let allRentals = 0;
    let totalOccupiedTimeAllCategories = 0;
    let totalAvailableTimeAllCategories = 0;
    let totalAllValue = new Prisma.Decimal(0);
    let totalSale = new Prisma.Decimal(0);
    let totalRental = new Prisma.Decimal(0);
    let totalRentals = 0;

    const kpisData: SuiteCategoryData[] = [];
    const daysTimeInSeconds = (endDate.getTime() - startDate.getTime()) / 1000;

    const categoryTotalsMap: CategoryTotalsMap = suiteCategories.reduce((acc, suiteCategory) => {
      acc[suiteCategory.id] = {
        giroTotal: 0,
        rentalsCount: 0,
        totalOccupiedTime: 0,
        unavailableTime: 0,
        availableTime: 0,
        totalValue: new Prisma.Decimal(0),
        categoryTotalSale: new Prisma.Decimal(0),
        categoryTotalRental: new Prisma.Decimal(0),
        categoryTotalRentals: 0,
      };
      totalSuites += suiteCategory.suites.length;
      return acc;
    }, {} as CategoryTotalsMap);

    // Cálculo do stockOutMap
    const stockOutIds = allRentalApartments
      .map((a: any) => a.saleLease?.stockOutId)
      .filter((id): id is number => Boolean(id));

    const stockOutData = await this.prisma.prismaLocal.stockOut.findMany({
      where: { id: { in: stockOutIds } },
      include: {
        stockOutItem: {
          where: { canceled: null },
          select: {
            id: true,
            priceSale: true,
            quantity: true,
            stockOutId: true,
          },
        },
        sale: {
          select: {
            discount: true,
          },
        },
      },
    });

    const stockOutMap: Record<string, Prisma.Decimal> = stockOutData.reduce(
      (map, stockOut) => {
        const priceSale = stockOut.stockOutItem
          .reduce(
            (acc, item) => acc.plus(new Prisma.Decimal(item.priceSale).times(item.quantity)),
            new Prisma.Decimal(0),
          )
          .minus(stockOut.sale?.discount || new Prisma.Decimal(0));
        map[String(stockOut.id)] = priceSale;
        return map;
      },
      {} as Record<string, Prisma.Decimal>,
    );

    const rentalTypeMap: Record<string, RentalTypeEnum> = {
      THREE_HOURS: RentalTypeEnum.THREE_HOURS,
      SIX_HOURS: RentalTypeEnum.SIX_HOURS,
      TWELVE_HOURS: RentalTypeEnum.TWELVE_HOURS,
      DAY_USE: RentalTypeEnum.DAY_USE,
      OVERNIGHT: RentalTypeEnum.OVERNIGHT,
      DAILY: RentalTypeEnum.DAILY,
    };

    const results: Record<string, any> = {};
    const trevparByDate: DateTrevparData[] = [];
    const rentalsByDate: DateRentalsData[] = [];
    const revparByDate: DateRevparData[] = [];
    const ticketAverageByDate: DateTicketData[] = [];
    const occupancyRateByDate: DateOccupancyData[] = [];
    const occupancyRateBySuiteCategory: OccupancyBySuiteCategoryData[] = [];
    const occupancyRateByWeekArray: WeeklyOccupancyData[] = [];
    const dayCountMap: Record<string, number> = {};
    const giroByWeekArray: WeeklyGiroData[] = [];
    const timezone = 'America/Sao_Paulo';

    let currentDate = new Date(startDate);
    currentDate.setUTCHours(6, 0, 0, 0);

    // Iterar sobre cada dia entre startDate e endDate
    while (currentDate <= endDate) {
      let nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1);
      nextDate.setUTCHours(5, 59, 59, 999);

      const currentRentalApartments = allRentalApartments.filter(
        (ra: any) => ra.checkIn >= currentDate && ra.checkIn < nextDate,
      );

      const totalsMap: Record<string, { totalValue: Prisma.Decimal }> = {};

      let totalOccupiedTime = 0;
      let totalUnavailableTime = 0;

      // Calcular o tempo ocupado
      for (const rentalApartment of currentRentalApartments) {
        const occupiedTimeInSeconds =
          (new Date(rentalApartment.checkOut).getTime() -
            new Date(rentalApartment.checkIn).getTime()) /
          1000;
        totalOccupiedTime += occupiedTimeInSeconds;

        const rentalTypeString = this.determineRentalPeriod(
          rentalApartment.checkIn,
          rentalApartment.checkOut,
          rentalApartment.Booking?.length ? rentalApartment.Booking : null,
        );
        const rentalType = rentalTypeMap[rentalTypeString];

        if (!totalsMap[rentalType]) {
          totalsMap[rentalType] = {
            totalValue: new Prisma.Decimal(0),
          };
        }

        const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
          ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
          : new Prisma.Decimal(0);

        const priceSale = rentalApartment.saleLease?.stockOutId
          ? stockOutMap[rentalApartment.saleLease.stockOutId] || new Prisma.Decimal(0)
          : new Prisma.Decimal(0);

        totalsMap[rentalType].totalValue = totalsMap[rentalType].totalValue.plus(
          permanenceValueLiquid.plus(priceSale),
        );
      }

      // Cálculo do tempo indisponível por manutenção e limpeza
      const unavailableTimeMap = new Map<string, number>();

      suiteCategories.forEach((suiteCategory: any) => {
        suiteCategory.suites.forEach((suite: any) => {
          // Lógica para calcular o tempo de limpeza
          const suiteCleanings = cleanings.filter(
            (cleaning: any) => cleaning.suiteState.suiteId === suite.id,
          );

          suiteCleanings.forEach((cleaning: any) => {
            const cleaningStart = new Date(cleaning.startDate);
            const cleaningEnd = new Date(cleaning.endDate);

            if (cleaningEnd > currentDate && cleaningStart < nextDate) {
              const overlapStart = Math.max(cleaningStart.getTime(), currentDate.getTime());
              const overlapEnd = Math.min(cleaningEnd.getTime(), nextDate.getTime());

              const cleaningTimeInSeconds = (overlapEnd - overlapStart) / 1000;
              const cleaningKey = `${suite.id}-${overlapStart}-${overlapEnd}`;
              if (!unavailableTimeMap.has(cleaningKey)) {
                totalUnavailableTime += cleaningTimeInSeconds;
                unavailableTimeMap.set(cleaningKey, cleaningTimeInSeconds);
              }
            }
          });

          // Lógica para calcular o tempo de manutenção e defeitos
          const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
            (blockedMaintenanceDefect: any) =>
              blockedMaintenanceDefect.defect.suite.id === suite.id &&
              blockedMaintenanceDefect.suiteState.suite.id === suite.id,
          );

          suiteDefectsAndMaintenances.forEach((blockedMaintenanceDefect: any) => {
            const defectStart = new Date(blockedMaintenanceDefect.defect.startDate);
            const defectEnd = new Date(blockedMaintenanceDefect.defect.endDate);

            if (defectEnd > currentDate && defectStart < nextDate) {
              const overlapStart = Math.max(defectStart.getTime(), currentDate.getTime());
              const overlapEnd = Math.min(defectEnd.getTime(), nextDate.getTime());

              const defectTimeInSeconds = (overlapEnd - overlapStart) / 1000;

              const defectKey = `${suite.id}-${overlapStart}-${overlapEnd}`;
              if (!unavailableTimeMap.has(defectKey)) {
                totalUnavailableTime += defectTimeInSeconds;
                unavailableTimeMap.set(defectKey, defectTimeInSeconds);
              }
            }
          });
        });
      });

      const totalSuitesCounts = suiteCategories.reduce(
        (acc: number, category: any) => acc + category.suites.length,
        0,
      );
      const daysTimeInSeconds = (nextDate.getTime() - currentDate.getTime()) / 1000;
      let availableTimeInSeconds = daysTimeInSeconds * totalSuitesCounts - totalUnavailableTime;

      if (availableTimeInSeconds < 0) {
        availableTimeInSeconds = 0;
      }

      // Calcular a taxa de ocupação
      const occupancyRateDecimal =
        availableTimeInSeconds > 0 ? totalOccupiedTime / availableTimeInSeconds : 0;

      // Formatar a data para YYYY-MM-DD
      const dateKey = new Intl.DateTimeFormat('pt-BR').format(currentDate);

      // Adicionar a taxa de ocupação ao array
      occupancyRateByDate.push({
        [dateKey]: {
          totalOccupancyRate: this.formatPercentageUpdate(occupancyRateDecimal),
        },
      });

      const dateToOccupancyRates: Record<string, any> = {};

      // Cálculo da taxa de ocupação por categoria de suíte
      suiteCategories.forEach((suiteCategory: any) => {
        let categoryOccupiedTime = 0;
        const unavailableTimeMap = new Map<string, number>();

        suiteCategory.suites.forEach((suite: any) => {
          const suiteRentals = currentRentalApartments.filter(
            (ra: any) => ra.suiteStates.suite.id === suite.id,
          );

          // Calcular o tempo ocupado para a categoria
          suiteRentals.forEach((rentalApartment: any) => {
            const occupiedTimeInSeconds =
              (new Date(rentalApartment.checkOut).getTime() -
                new Date(rentalApartment.checkIn).getTime()) /
              1000;
            categoryOccupiedTime += occupiedTimeInSeconds;
          });

          // Cálculo do tempo indisponível por manutenção e limpeza para a categoria
          const suiteCleanings = cleanings.filter(
            (cleaning: any) => cleaning.suiteState.suiteId === suite.id,
          );

          suiteCleanings.forEach((cleaning: any) => {
            const cleaningStart = new Date(cleaning.startDate);
            const cleaningEnd = new Date(cleaning.endDate);

            if (cleaningEnd > currentDate && cleaningStart < nextDate) {
              const overlapStart = Math.max(cleaningStart.getTime(), currentDate.getTime());
              const overlapEnd = Math.min(cleaningEnd.getTime(), nextDate.getTime());

              const cleaningTimeInSeconds = (overlapEnd - overlapStart) / 1000;

              const cleaningKey = `${suite.id}-${overlapStart}-${overlapEnd}`;
              if (!unavailableTimeMap.has(cleaningKey)) {
                unavailableTimeMap.set(cleaningKey, cleaningTimeInSeconds);
              }
            }
          });

          // Lógica para calcular o tempo de manutenção e defeitos para a categoria
          const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
            (blockedMaintenanceDefect: any) =>
              blockedMaintenanceDefect.defect.suite.id === suite.id &&
              blockedMaintenanceDefect.suiteState.suite.id === suite.id,
          );

          suiteDefectsAndMaintenances.forEach((blockedMaintenanceDefect: any) => {
            const defectStart = new Date(blockedMaintenanceDefect.defect.startDate);
            const defectEnd = new Date(blockedMaintenanceDefect.defect.endDate);

            if (defectEnd > currentDate && defectStart < nextDate) {
              const overlapStart = Math.max(defectStart.getTime(), currentDate.getTime());
              const overlapEnd = Math.min(defectEnd.getTime(), nextDate.getTime());

              const defectTimeInSeconds = (overlapEnd - overlapStart) / 1000;

              const defectKey = `${suite.id}-${overlapStart}-${overlapEnd}`;
              if (!unavailableTimeMap.has(defectKey)) {
                unavailableTimeMap.set(defectKey, defectTimeInSeconds);
              }
            }
          });
        });

        // Calcular o tempo indisponível total para a categoria
        const categoryUnavailableTime = Array.from(unavailableTimeMap.values()).reduce(
          (acc, time) => acc + time,
          0,
        );

        const totalCategorySuitesCounts = suiteCategory.suites.length;
        let categoryAvailableTimeInSeconds =
          daysTimeInSeconds * totalCategorySuitesCounts - categoryUnavailableTime;

        if (categoryAvailableTimeInSeconds < 0) {
          categoryAvailableTimeInSeconds = 0;
        }

        // Calcular a taxa de ocupação para a categoria
        const categoryOccupancyRateDecimal =
          categoryAvailableTimeInSeconds > 0
            ? categoryOccupiedTime / categoryAvailableTimeInSeconds
            : 0;

        // Adicionar a taxa de ocupação ao objeto dateToOccupancyRates
        if (!dateToOccupancyRates[dateKey]) {
          dateToOccupancyRates[dateKey] = {};
        }
        dateToOccupancyRates[dateKey][suiteCategory.description] = {
          occupancyRate: this.formatPercentageUpdate(categoryOccupancyRateDecimal),
        };
      });

      // Adicionar o objeto dateToOccupancyRates ao array occupancyRateBySuiteCategory
      Object.keys(dateToOccupancyRates).forEach((dateKey) => {
        occupancyRateBySuiteCategory.push({
          [dateKey]: dateToOccupancyRates[dateKey],
        });
      });

      const totalRevenueForDate = Object.values(totalsMap).reduce(
        (acc, { totalValue }) => acc.plus(totalValue),
        new Prisma.Decimal(0),
      );
      const totalRentalsForDate = currentRentalApartments.length;

      // Cálculo do giro e ticket médio
      const periodDays = 1;
      const giro = totalRentalsForDate / (totalSuites * periodDays);
      const ticketAverage =
        totalRentalsForDate > 0 ? totalRevenueForDate.dividedBy(totalRentalsForDate).toNumber() : 0;

      // Cálculo do TrevPAR
      const totalTrevpar = giro * ticketAverage;

      // Adicionar o ticket médio total ao array
      ticketAverageByDate.push({
        [dateKey]: {
          totalAllTicketAverage: this.formatCurrency(ticketAverage),
        },
      });

      // Adiciona o TrevPAR ao array
      trevparByDate.push({
        [dateKey]: {
          totalTrevpar: this.formatCurrency(totalTrevpar),
        },
      });

      // Cálculo do RevPAR
      let totalRevenue = new Prisma.Decimal(0);
      let totalSuitesCount = 0;

      suiteCategories.forEach((suiteCategory: any) => {
        const suitesInCategoryCount = suiteCategory.suites.length;
        totalSuitesCount += suitesInCategoryCount;

        const rentalApartmentsInCategory = currentRentalApartments.filter(
          (rentalApartment: any) =>
            rentalApartment.suiteStates.suite.suiteCategoryId === suiteCategory.id,
        );

        rentalApartmentsInCategory.forEach((rentalApartment: any) => {
          totalRevenue = totalRevenue.plus(
            rentalApartment.permanenceValueLiquid
              ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
              : new Prisma.Decimal(0),
          );
        });
      });

      // Calcular o RevPAR
      const revpar = totalSuitesCount > 0 ? totalRevenue.dividedBy(totalSuitesCount).toNumber() : 0;

      // Adiciona o RevPAR ao array
      revparByDate.push({
        [dateKey]: {
          totalRevpar: this.formatCurrency(revpar),
        },
      });

      // Formata os resultados para o dia atual
      results[dateKey] = Object.keys(rentalTypeMap).map((rentalType) => {
        const totalValue = totalsMap[rentalType] ? totalsMap[rentalType].totalValue.toNumber() : 0;

        return {
          [rentalType]: {
            totalValue: this.formatCurrency(totalValue),
          },
        };
      });

      // Adiciona o total de aluguéis por data
      rentalsByDate.push({
        [dateKey]: {
          totalAllRentalsApartments: totalRentalsForDate,
        },
      });

      // Avançar para o próximo dia
      currentDate.setDate(currentDate.getDate() + 1);
    }

    moment.locale('pt-br');

    let currentDateForWeek = moment.tz(startDate, timezone);
    const endDateAdjusted = moment.tz(endDate, timezone);

    while (currentDateForWeek.isBefore(endDateAdjusted)) {
      const dayOfWeek = currentDateForWeek.format('dddd');
      dayCountMap[dayOfWeek] = (dayCountMap[dayOfWeek] || 0) + 1;
      currentDateForWeek.add(1, 'day');
    }

    // Inicializar a estrutura de ocupação por categoria e dia da semana
    const occupancyByCategoryAndDay: Record<string, Record<string, any>> = {};
    suiteCategories.forEach((suiteCategory: any) => {
      occupancyByCategoryAndDay[suiteCategory.description] = {};
      for (const dayOfWeek in dayCountMap) {
        occupancyByCategoryAndDay[suiteCategory.description][dayOfWeek] = {
          totalOccupiedTime: 0,
          unavailableTime: 0,
          availableTime: 0,
          occupancyRate: '0.00%',
        };
      }
    });

    // Calcular totalOccupiedTime por categoria e dia da semana
    allRentalApartments.forEach((occupiedSuite: any) => {
      const suiteCategoryDescription =
        occupiedSuite.suiteStates?.suite?.suiteCategories?.description;
      const dayOfOccupation = moment.tz(occupiedSuite.checkIn, timezone);
      const dayOfWeek = dayOfOccupation.format('dddd');

      if (
        occupancyByCategoryAndDay[suiteCategoryDescription] &&
        occupancyByCategoryAndDay[suiteCategoryDescription][dayOfWeek]
      ) {
        const occupiedTime = occupiedSuite.checkOut.getTime() - occupiedSuite.checkIn.getTime();
        occupancyByCategoryAndDay[suiteCategoryDescription][dayOfWeek].totalOccupiedTime +=
          occupiedTime;
      }
    });

    // Calcular availableTime e occupancyRate
    for (const suiteCategory of suiteCategories) {
      const suitesInCategory = suiteCategory.suites;
      const suitesInCategoryCount = suitesInCategory.length;

      for (const dayOfWeek in occupancyByCategoryAndDay[suiteCategory.description]) {
        let unavailableTimeCleaning = 0;

        // Calcular o tempo indisponível por limpeza
        const suiteCleanings = cleanings.filter((cleaning: any) => {
          const cleaningDayOfWeek = moment.tz(cleaning.startDate, timezone).format('dddd');
          return (
            cleaning.suiteState.suiteId === suitesInCategory[0].id &&
            cleaningDayOfWeek === dayOfWeek
          );
        });

        suiteCleanings.forEach((cleaning: any) => {
          const cleaningTimeInSeconds =
            (new Date(cleaning.endDate).getTime() - new Date(cleaning.startDate).getTime()) / 1000;
          unavailableTimeCleaning += cleaningTimeInSeconds;
        });

        // Calcular o tempo indisponível por manutenção
        const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
          (blockedMaintenanceDefect: any) => {
            const defectDayOfWeek = moment
              .tz(blockedMaintenanceDefect.defect.startDate, timezone)
              .format('dddd');
            return (
              blockedMaintenanceDefect.defect.suite.id === suitesInCategory[0].id &&
              defectDayOfWeek === dayOfWeek
            );
          },
        );

        suiteDefectsAndMaintenances.forEach((blockedMaintenanceDefect: any) => {
          const startDefect = new Date(blockedMaintenanceDefect.defect.startDate);
          const endDefect = new Date(blockedMaintenanceDefect.defect.endDate);
          const defectTimeInSeconds = (endDefect.getTime() - startDefect.getTime()) / 1000;
          unavailableTimeCleaning += defectTimeInSeconds;
        });

        const daysTimeInSeconds = dayCountMap[dayOfWeek] * 24 * 60 * 60;
        let availableTimeInSeconds =
          daysTimeInSeconds * suitesInCategoryCount - unavailableTimeCleaning;

        if (availableTimeInSeconds < 0) {
          availableTimeInSeconds = 0;
        }

        occupancyByCategoryAndDay[suiteCategory.description][dayOfWeek].unavailableTime +=
          unavailableTimeCleaning;
        occupancyByCategoryAndDay[suiteCategory.description][dayOfWeek].availableTime +=
          availableTimeInSeconds * 1000;

        // Calcular a taxa de ocupação
        const totalOccupiedTime =
          occupancyByCategoryAndDay[suiteCategory.description][dayOfWeek].totalOccupiedTime;
        const occupancyRate =
          availableTimeInSeconds > 0 ? (totalOccupiedTime / availableTimeInSeconds) * 100 : 0;

        occupancyByCategoryAndDay[suiteCategory.description][dayOfWeek].occupancyRate =
          occupancyRate / 1000;
      }
    }

    // Calcular totalOccupancyRate por dia da semana
    const totalOccupancyRateByDay: Record<string, number> = {};

    for (const dayOfWeek in dayCountMap) {
      let totalOccupiedTimeAllCategories = 0;
      let totalAvailableTimeAllCategories = 0;

      for (const suiteCategory in occupancyByCategoryAndDay) {
        totalOccupiedTimeAllCategories +=
          occupancyByCategoryAndDay[suiteCategory][dayOfWeek].totalOccupiedTime;
        totalAvailableTimeAllCategories +=
          occupancyByCategoryAndDay[suiteCategory][dayOfWeek].availableTime;
      }

      const totalOccupancyRate =
        totalAvailableTimeAllCategories > 0
          ? (totalOccupiedTimeAllCategories / totalAvailableTimeAllCategories) * 100
          : 0;

      totalOccupancyRateByDay[dayOfWeek] = totalOccupancyRate;
    }

    // Preencher o occupancyRateByWeekArray com os dados calculados
    for (const suiteCategory in occupancyByCategoryAndDay) {
      const categoryData: WeeklyOccupancyData = {
        [suiteCategory]: {},
      };

      for (const dayOfWeek in occupancyByCategoryAndDay[suiteCategory]) {
        const dayData = occupancyByCategoryAndDay[suiteCategory][dayOfWeek];

        categoryData[suiteCategory][dayOfWeek.toLowerCase()] = {
          occupancyRate: Number(dayData.occupancyRate.toFixed(2)),
          totalOccupancyRate: Number(totalOccupancyRateByDay[dayOfWeek].toFixed(2)),
        };
      }

      occupancyRateByWeekArray.push(categoryData);
    }

    // Calcular o giro por categoria e dia da semana
    let currentDateForGiro = moment.tz(startDate, timezone);
    const endDateAdjustedForGiro = moment.tz(endDate, timezone);

    // Inicializar a estrutura de giro por categoria e dia da semana
    const giroByCategoryAndDay: Record<string, Record<string, any>> = {};
    suiteCategories.forEach((suiteCategory: any) => {
      giroByCategoryAndDay[suiteCategory.description] = {};
      for (const dayOfWeek in dayCountMap) {
        giroByCategoryAndDay[suiteCategory.description][dayOfWeek] = {
          giroTotal: 0,
          rentalsCount: 0,
        };
      }
    });

    // Contar locações por categoria e dia da semana
    while (currentDateForGiro.isBefore(endDateAdjustedForGiro)) {
      const dayOfWeek = currentDateForGiro.format('dddd');

      // Filtrar os apartamentos alugados para o dia atual
      const rentalsForCurrentDay = allRentalApartments.filter((rental: any) => {
        const checkInDate = moment.tz(rental.checkIn, timezone);
        return checkInDate.isSame(currentDateForGiro, 'day');
      });

      // Contar o número de locações por categoria
      rentalsForCurrentDay.forEach((rental: any) => {
        const suiteCategoryDescription = rental.suiteStates?.suite?.suiteCategories?.description;

        if (!suiteCategoryDescription) {
          return;
        }

        // Incrementa o número de locações para a categoria e dia da semana
        if (giroByCategoryAndDay[suiteCategoryDescription]) {
          giroByCategoryAndDay[suiteCategoryDescription][dayOfWeek].rentalsCount++;
        }
      });

      currentDateForGiro.add(1, 'day');
    }

    // Cálculo do giro por categoria e dia
    const totalRentalsByDay: Record<string, number> = {};
    let allSuites = 0;

    for (const suiteCategory of suiteCategories) {
      const suitesInCategoryCount = suiteCategory.suites.length;
      allSuites += suitesInCategoryCount;

      for (const dayOfWeek in giroByCategoryAndDay[suiteCategory.description]) {
        const categoryData = giroByCategoryAndDay[suiteCategory.description][dayOfWeek];

        // Acumular locações por dia da semana
        if (!totalRentalsByDay[dayOfWeek]) {
          totalRentalsByDay[dayOfWeek] = 0;
        }
        totalRentalsByDay[dayOfWeek] += categoryData.rentalsCount;

        // Cálculo do giro para a categoria e dia
        if (categoryData.rentalsCount > 0 && suitesInCategoryCount > 0) {
          const days = dayCountMap[dayOfWeek];
          const giro = categoryData.rentalsCount / suitesInCategoryCount / days;

          categoryData.giroTotal = giro;
        } else {
          categoryData.giroTotal = 0;
          categoryData.rentalsCount = 0;
        }
      }
    }

    // Calcular o totalGiro
    for (const suiteCategory of suiteCategories) {
      for (const dayOfWeek in giroByCategoryAndDay[suiteCategory.description]) {
        const categoryData = giroByCategoryAndDay[suiteCategory.description][dayOfWeek];

        if (!categoryData) continue;

        const totalGiro = totalRentalsByDay[dayOfWeek] / (allSuites || 1);
        const daysCount = dayCountMap[dayOfWeek];
        const adjustedTotalGiro = daysCount > 0 ? totalGiro / daysCount : 0;

        categoryData.totalGiro = adjustedTotalGiro;
      }
    }

    // Preencher o giroByWeekArray com os dados calculados
    for (const suiteCategory in giroByCategoryAndDay) {
      const categoryData: WeeklyGiroData = {
        [suiteCategory]: {},
      };

      for (const dayOfWeek in giroByCategoryAndDay[suiteCategory]) {
        const dayData = giroByCategoryAndDay[suiteCategory][dayOfWeek];

        categoryData[suiteCategory][dayOfWeek.toLowerCase()] = {
          giro: Number(dayData.giroTotal.toFixed(2)),
          totalGiro: Number(dayData.totalGiro.toFixed(2)),
        };
      }

      giroByWeekArray.push(categoryData);
    }

    const dataTableBillingRentalType = Object.entries(results).map(([date, rentals]) => ({
      [date]: rentals,
    }));

    // Cálculo do RevenueByDate
    const revenueByDate: DateValueData[] = [];
    currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateKey = new Intl.DateTimeFormat('pt-BR').format(currentDate);
      const allRentalApartmentsForDate = allRentalApartments.filter(
        (ra: any) =>
          ra.checkIn >= currentDate && ra.checkIn < new Date(currentDate.getTime() + 86400000),
      );

      let totalValueForCurrentDate = new Prisma.Decimal(0);
      allRentalApartmentsForDate.forEach((rentalApartment) => {
        const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
          ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
          : new Prisma.Decimal(0);
        const priceSale = rentalApartment.saleLease?.stockOutId
          ? stockOutMap[rentalApartment.saleLease.stockOutId] || new Prisma.Decimal(0)
          : new Prisma.Decimal(0);

        totalValueForCurrentDate = totalValueForCurrentDate.plus(
          permanenceValueLiquid.plus(priceSale),
        );
      });

      revenueByDate.push({
        [dateKey]: {
          totalValue: this.formatCurrency(totalValueForCurrentDate.toNumber()),
        },
      });

      // Avançar para o próximo dia
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Cálculo do RevenueBySuiteCategory
    const revenueBySuiteCategory = suiteCategories.map((suiteCategory) => {
      const suitesInCategory = suiteCategory.suites;
      let totalValueForCategory = new Prisma.Decimal(0);

      allRentalApartments.forEach((rentalApartment) => {
        if (
          suitesInCategory.some((suite: any) => suite.id === rentalApartment.suiteStates?.suite?.id)
        ) {
          const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
            ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
            : new Prisma.Decimal(0);
          let priceSale = new Prisma.Decimal(0);

          if (rentalApartment.saleLease?.stockOutId) {
            priceSale = stockOutMap[rentalApartment.saleLease.stockOutId] || new Prisma.Decimal(0);
          }

          totalValueForCategory = totalValueForCategory.plus(permanenceValueLiquid.plus(priceSale));
        }
      });

      return {
        [suiteCategory.description]: {
          totalValue: this.formatCurrency(totalValueForCategory.toNumber()),
        },
      };
    });

    suiteCategories.forEach((suiteCategory) => {
      const suitesInCategoryCount = suiteCategory.suites.length;
      const occupiedSuitesInCategory = allRentalApartments.filter(
        (rentalApartment) =>
          rentalApartment.suiteStates?.suite?.suiteCategoryId === suiteCategory.id,
      );

      let totalOccupiedTime = 0;
      let unavailableTimeCleaning = 0;
      let maxUnavailableTime = 0;

      occupiedSuitesInCategory.forEach((occupiedSuite) => {
        const occupiedTimeInSeconds = this.calculateOccupationTime(
          occupiedSuite.checkIn,
          occupiedSuite.checkOut,
        );
        totalOccupiedTime += occupiedTimeInSeconds;

        const permanenceValueLiquid = occupiedSuite.permanenceValueLiquid
          ? new Prisma.Decimal(occupiedSuite.permanenceValueLiquid)
          : new Prisma.Decimal(0);
        let priceSale = new Prisma.Decimal(0);
        let discountSale = new Prisma.Decimal(0);

        const saleLease = occupiedSuite.saleLease;
        if (saleLease && saleLease.stockOut?.stockOutItem) {
          priceSale = saleLease.stockOut.stockOutItem.reduce(
            (
              acc: { plus: (arg0: Prisma.Decimal) => any },
              item: { priceSale: Prisma.Decimal.Value; quantity: Prisma.Decimal.Value },
            ) =>
              acc.plus(new Prisma.Decimal(item.priceSale).times(new Prisma.Decimal(item.quantity))),
            new Prisma.Decimal(0),
          );

          discountSale = saleLease.stockOut.sale?.discount
            ? new Prisma.Decimal(saleLease.stockOut.sale.discount)
            : new Prisma.Decimal(0);
          priceSale = priceSale.minus(discountSale);
        }

        const totalValue = permanenceValueLiquid.plus(priceSale);
        categoryTotalsMap[suiteCategory.id].totalValue =
          categoryTotalsMap[suiteCategory.id].totalValue.plus(totalValue);
        totalAllValue = totalAllValue.plus(totalValue);

        if (totalValue.gt(0)) {
          categoryTotalsMap[suiteCategory.id].categoryTotalRentals++;
          totalRentals++;

          totalRental = totalRental.plus(permanenceValueLiquid);
          totalSale = totalSale.plus(priceSale);

          categoryTotalsMap[suiteCategory.id].categoryTotalSale =
            categoryTotalsMap[suiteCategory.id].categoryTotalSale.plus(priceSale);
          categoryTotalsMap[suiteCategory.id].categoryTotalRental =
            categoryTotalsMap[suiteCategory.id].categoryTotalRental.plus(permanenceValueLiquid);
        }
      });

      suiteCategory.suites.forEach((suite: any) => {
        const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
          (blockedMaintenanceDefect) =>
            blockedMaintenanceDefect.defect.suite.id === suite.id &&
            blockedMaintenanceDefect.suiteState.suite.id === suite.id,
        );

        suiteDefectsAndMaintenances.forEach((blockedMaintenanceDefect) => {
          const startDefect = new Date(blockedMaintenanceDefect.defect.startDate);
          const endDefect = new Date(blockedMaintenanceDefect.defect.endDate);
          const startMaintenance = new Date(blockedMaintenanceDefect.suiteState.startDate);
          const endMaintenance = new Date(blockedMaintenanceDefect.suiteState.endDate);

          const defectTimeInSeconds = (endDefect.getTime() - startDefect.getTime()) / 1000;
          const maintenanceTimeInSeconds =
            (endMaintenance.getTime() - startMaintenance.getTime()) / 1000;
          maxUnavailableTime += Math.max(defectTimeInSeconds, maintenanceTimeInSeconds);
        });

        cleanings
          .filter((cleaning) => cleaning.suiteState.suiteId === suite.id)
          .forEach((cleaning) => {
            unavailableTimeCleaning +=
              (new Date(cleaning.endDate).getTime() - new Date(cleaning.startDate).getTime()) /
              1000;
          });
      });

      const unavailableTime = maxUnavailableTime + unavailableTimeCleaning;
      const availableTimeInSeconds = daysTimeInSeconds * suitesInCategoryCount - unavailableTime;

      totalOccupiedTimeAllCategories += totalOccupiedTime;
      totalAvailableTimeAllCategories += availableTimeInSeconds;

      const categoryData = categoryTotalsMap[suiteCategory.id];
      categoryData.totalOccupiedTime = totalOccupiedTime;
      categoryData.unavailableTime = unavailableTime;
      categoryData.availableTime = availableTimeInSeconds;
      categoryData.rentalsCount += occupiedSuitesInCategory.length;
      allRentals += occupiedSuitesInCategory.length;

      if (categoryData.rentalsCount > 0 && suitesInCategoryCount > 0) {
        const days = (endDate.getTime() - startDate.getTime()) / (1000 * 86400);
        const giro = categoryData.rentalsCount / suitesInCategoryCount / days;
        categoryData.giroTotal += giro;
      }
    });

    const totalResult = {
      totalAllRentalsApartments: allRentals,
      totalAllValue: this.formatCurrency(Number(totalAllValue.plus(totalSaleDirect))),
      totalAllTicketAverage:
        totalRentals > 0
          ? this.formatCurrency(
              totalSale.plus(totalRental).plus(totalSaleDirect).dividedBy(totalRentals).toNumber(),
            )
          : 'R$ 0,00',
      totalGiro: Number(
        (
          allRentals /
          (totalSuites || 1) /
          ((endDate.getTime() - startDate.getTime()) / (1000 * 86400))
        ).toFixed(2),
      ),
      totalRevpar: this.formatCurrency(
        (Number(
          allRentals /
            (totalSuites || 1) /
            ((endDate.getTime() - startDate.getTime()) / (1000 * 86400)),
        ) *
          Number(totalRental)) /
          totalRentals,
      ),
      totalTrevpar: this.formatCurrency(
        (Number(
          allRentals /
            (totalSuites || 1) /
            ((endDate.getTime() - startDate.getTime()) / (1000 * 86400)),
        ) *
          Number(totalSale.plus(totalRental).plus(totalSaleDirect))) /
          totalRentals,
      ),
      totalAverageOccupationTime: this.formatTime(
        totalOccupiedTimeAllCategories / (allRentals || 1),
      ),
      totalOccupancyRate: this.formatPercentageUpdate(
        totalOccupiedTimeAllCategories / (totalAvailableTimeAllCategories || 1),
      ),
    };

    suiteCategories.forEach((suiteCategory) => {
      const categoryData = categoryTotalsMap[suiteCategory.id];
      if (categoryData && categoryData.rentalsCount > 0) {
        const occupancyRateDecimal =
          categoryData.availableTime > 0
            ? categoryData.totalOccupiedTime / categoryData.availableTime
            : 0;

        const ticketAverageSale =
          categoryData.categoryTotalRentals > 0
            ? categoryData.categoryTotalSale.dividedBy(categoryData.categoryTotalRentals).toNumber()
            : 0;

        const ticketAverageRental =
          categoryData.categoryTotalRentals > 0
            ? categoryData.categoryTotalRental
                .dividedBy(categoryData.categoryTotalRentals)
                .toNumber()
            : 0;

        const totalTicketAverage = ticketAverageSale + ticketAverageRental;

        kpisData.push({
          [suiteCategory.description]: {
            totalRentalsApartments: categoryData.rentalsCount,
            totalValue: Number(categoryData.totalValue),
            totalTicketAverage: totalTicketAverage,
            giro: Number(categoryData.giroTotal),
            revpar: categoryData.giroTotal * ticketAverageRental,
            trevpar: categoryData.giroTotal * totalTicketAverage,
            averageOccupationTime: this.formatTime(
              categoryData.totalOccupiedTime / (categoryData.rentalsCount || 1),
            ),
            occupancyRate: occupancyRateDecimal,
          },
        });
      }
    });

    const bigNumbers = {
      currentDate: {
        totalAllValue: this.formatCurrency(Number(totalAllValue.plus(totalSaleDirect))),
        totalAllRentalsApartments: allRentals,
        totalAllTicketAverage: totalResult.totalAllTicketAverage,
        totalAllRevpar: totalResult.totalRevpar,
        totalAverageOccupationTime: totalResult.totalAverageOccupationTime,
        totalAllGiro: totalResult.totalGiro,
      },
    };

    return {
      Company: 'Lush Ipiranga',
      BigNumbers: [bigNumbers],
      BillingRentalType: dataTableBillingRentalType,
      RevenueByDate: revenueByDate,
      RevenueBySuiteCategory: revenueBySuiteCategory,
      RentalsByDate: rentalsByDate,
      RevparByDate: revparByDate,
      TicketAverageByDate: ticketAverageByDate,
      TrevparByDate: trevparByDate,
      OccupancyRateByDate: occupancyRateByDate,
      OccupancyRateBySuiteCategory: occupancyRateBySuiteCategory,
      DataTableSuiteCategory: kpisData,
      TotalResult: totalResult,
      DataTableOccupancyRateByWeek: occupancyRateByWeekArray,
      DataTableGiroByWeek: giroByWeekArray,
    };
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
        -- Calcula receita de consumo usando saidaestoque com relação para locações
        -- Filtrando apenas locações de apartamentos das categorias corretas (10,11,12,15,16,17,18,19,24)
        -- Mas incluindo TODOS os produtos consumidos nessas locações
        SELECT
          la.id_apartamentostate as id_locacao,
          COALESCE(SUM(
            (CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))) -
            COALESCE((CAST(v.desconto AS DECIMAL(15,4)) /
              NULLIF((SELECT COUNT(*) FROM saidaestoqueitem sei2 WHERE sei2.id_saidaestoque = se.id AND sei2.cancelado IS NULL), 0)
            ), 0)
          ), 0) as valor_consumo
        FROM locacaoapartamento la
        INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca_apt ON a.id_categoriaapartamento = ca_apt.id
        INNER JOIN vendalocacao vl ON la.id_apartamentostate = vl.id_locacaoapartamento
        INNER JOIN saidaestoque se ON vl.id_saidaestoque = se.id
        INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
        LEFT JOIN venda v ON se.id = v.id_saidaestoque
        WHERE la.datainicialdaocupacao >= '${formattedStart}'
          AND la.datainicialdaocupacao <= '${formattedEnd}'
          AND la.fimocupacaotipo = 'FINALIZADA'
          AND sei.cancelado IS NULL
          AND ca_apt.id IN (10,11,12,15,16,17,18,19,24)
        GROUP BY la.id_apartamentostate, vl.id_locacaoapartamento
      )
      SELECT
        COUNT(*) as total_rentals,
        -- totalAllValue: permanenceValueLiquid + priceSale das locações
        COALESCE(SUM(
          COALESCE(CAST(la.valorliquidolocacao AS DECIMAL(15,4)), 0) +
          COALESCE(rc.valor_consumo, 0)
        ), 0) as total_all_value,
        -- Receita apenas de locação (permanenceValueLiquid)
        COALESCE(SUM(COALESCE(CAST(la.valorliquidolocacao AS DECIMAL(15,4)), 0)), 0) as total_rental_revenue,
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

    // SQL para vendas diretas - removendo filtro de categoria de produtos
    // As vendas diretas devem incluir TODOS os produtos vendidos diretamente no período
    const totalSaleDirectSQL = `
      SELECT
        COALESCE(SUM(CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))), 0) AS receita_bruta,
        COALESCE(SUM(DISTINCT COALESCE(CAST(v.desconto AS DECIMAL(15,4)), 0)), 0) AS total_descontos,
        COALESCE(SUM(CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))), 0) -
        COALESCE(SUM(DISTINCT COALESCE(CAST(v.desconto AS DECIMAL(15,4)), 0)), 0) AS total_sale_direct,
        COUNT(DISTINCT sei.id) AS total_itens,
        COUNT(DISTINCT se.id) AS total_vendas_diretas
      FROM saidaestoque se
      INNER JOIN vendadireta vd ON se.id = vd.id_saidaestoque
      INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
      LEFT JOIN venda v ON se.id = v.id_saidaestoque
      WHERE vd.venda_completa = true
        AND sei.cancelado IS NULL
        AND sei.datasaidaitem >= '${formattedStart}'
        AND sei.datasaidaitem <= '${formattedEnd}'
    `;

    const totalSuitesSQL = `
      SELECT COUNT(*) as total_suites
      FROM apartamento a
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE ca.descricao IN ('LUSH', 'LUSH POP', 'LUSH HIDRO', 'LUSH LOUNGE', 'LUSH SPA', 'LUSH CINE', 'LUSH SPLASH', 'LUSH SPA SPLASH', 'CASA LUSH')
        AND a.dataexclusao IS NULL
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
        AND a.dataexclusao IS NULL
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
        AND a.dataexclusao IS NULL
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
        AND a.dataexclusao IS NULL
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
          -- Receita total (locação + consumo)
          COALESCE(SUM(
            COALESCE(CAST(la.valorliquidolocacao AS DECIMAL(15,4)), 0) +
            COALESCE(
              (
                SELECT COALESCE(SUM(
                  (CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))) -
                  COALESCE((CAST(v.desconto AS DECIMAL(15,4)) /
                    NULLIF((SELECT COUNT(*) FROM saidaestoqueitem sei2 WHERE sei2.id_saidaestoque = sei.id_saidaestoque AND sei2.cancelado IS NULL), 0)
                  ), 0)
                ), 0)
                FROM vendalocacao vl
                INNER JOIN saidaestoque se ON vl.id_saidaestoque = se.id
                INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
                LEFT JOIN venda v ON se.id = v.id_saidaestoque
                WHERE vl.id_locacaoapartamento = la.id_apartamentostate
                  AND sei.cancelado IS NULL
              ), 0
            )
          ), 0) as total_value,
          -- Receita apenas de locação
          COALESCE(SUM(COALESCE(CAST(la.valorliquidolocacao AS DECIMAL(15,4)), 0)), 0) as rental_revenue,
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
          AND a.dataexclusao IS NULL
        GROUP BY ca.id, ca.descricao
      ),
      suite_counts AS (
        SELECT
          ca.descricao as suite_category_name,
          COUNT(DISTINCT a.id) as total_suites_in_category
        FROM categoriaapartamento ca
        INNER JOIN apartamento a ON ca.id = a.id_categoriaapartamento
        WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
        GROUP BY ca.id, ca.descricao
      )
      SELECT
        scd.suite_category_name,
        scd.total_rentals,
        scd.total_value,
        scd.rental_revenue,
        scd.total_occupied_time,
        sc.total_suites_in_category
      FROM suite_category_data scd
      INNER JOIN suite_counts sc ON scd.suite_category_name = sc.suite_category_name
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
      const occupancyRate = totalSuitesInCategory > 0 ? totalRentals / totalSuitesInCategory : 0;

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
        AND a.dataexclusao IS NULL
    `;

    // Query 2: Buscar tempos indisponíveis (COM suite_id para filtrar depois)
    const unavailableTimesData: any[] = await this.prisma.prismaLocal.$queryRaw`
      SELECT
        ca.descricao as category_name,
        a.id as suite_id,
        la.datainicio as start_date,
        la.datafim as end_date
      FROM limpezaapartamento la
      INNER JOIN apartamentostate aps ON la.id_sujoapartamento = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE la.datainicio >= ${formattedStart}::timestamp
        AND la.datainicio <= ${formattedEnd}::timestamp
        AND la.datafim IS NOT NULL
        AND ca.id IN (10,11,12,15,16,17,18,19,24)
        AND a.dataexclusao IS NULL

      UNION ALL

      SELECT
        ca.descricao as category_name,
        a.id as suite_id,
        d.datainicio as start_date,
        GREATEST(d.datafim, COALESCE(aps_manut.datafim, d.datafim)) as end_date
      FROM defeito d
      INNER JOIN apartamento a ON d.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      LEFT JOIN col_bloqueadomanutencao_defeito bmd ON bmd.id_defeito = d.id
      LEFT JOIN apartamentostate aps_manut ON bmd.id_bloqueadomanutencao = aps_manut.id
      WHERE d.datainicio >= ${formattedStart}::timestamp
        AND d.datainicio <= ${formattedEnd}::timestamp
        AND d.datafim IS NOT NULL
        AND ca.id IN (10,11,12,15,16,17,18,19,24)
        AND a.dataexclusao IS NULL
    `;

    // Query 3: Metadados (suítes por categoria + primeira suíte de cada categoria)
    const metadataResult: any[] = await this.prisma.prismaLocal.$queryRaw`
      WITH first_suite_per_category AS (
        SELECT DISTINCT ON (ca.id)
          ca.descricao as category_name,
          a.id as first_suite_id
        FROM categoriaapartamento ca
        INNER JOIN apartamento a ON ca.id = a.id_categoriaapartamento
        WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
          AND a.dataexclusao IS NULL
        ORDER BY ca.id, a.id
      )
      SELECT
        ca.descricao as category_name,
        COUNT(DISTINCT a.id) as total_suites,
        fs.first_suite_id
      FROM categoriaapartamento ca
      INNER JOIN apartamento a ON ca.id = a.id_categoriaapartamento
      INNER JOIN first_suite_per_category fs ON ca.descricao = fs.category_name
      WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
        AND a.dataexclusao IS NULL
      GROUP BY ca.descricao, fs.first_suite_id
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

    // Distribuir tempo ocupado pelos dias da semana corretos (SIMPLIFICADO - igual ao kpiOccupancyRate)
    rentalsData.forEach((rental) => {
      const checkIn = new Date(rental.check_in);
      const category = rental.category_name;

      // Pegar apenas o dia da semana do checkIn (como no código de referência)
      const dayOfWeek = dayNames[checkIn.getDay()];
      const occupiedTime = new Date(rental.check_out).getTime() - checkIn.getTime();

      if (occupancyByCategory[category] && occupancyByCategory[category][dayOfWeek]) {
        occupancyByCategory[category][dayOfWeek].occupiedTime += occupiedTime / 1000; // converter para segundos
      }
    });

    // Distribuir tempo indisponível pelos dias da semana corretos (APENAS PRIMEIRA SUÍTE de cada categoria)
    // Criar map de primeira suíte por categoria
    const firstSuiteByCategory: { [category: string]: number } = {};
    metadataResult.forEach((meta) => {
      firstSuiteByCategory[meta.category_name] = Number(meta.first_suite_id);
    });

    unavailableTimesData.forEach((unavailable) => {
      const startDate = new Date(unavailable.start_date);
      const category = unavailable.category_name;
      const suiteId = Number(unavailable.suite_id);

      // FILTRAR: apenas considerar se for a primeira suíte da categoria
      if (suiteId !== firstSuiteByCategory[category]) {
        return; // Pular esta entrada
      }

      // Pegar apenas o dia da semana do startDate (como no código de referência)
      const dayOfWeek = dayNames[startDate.getDay()];
      const unavailableTime = new Date(unavailable.end_date).getTime() - startDate.getTime();

      if (occupancyByCategory[category] && occupancyByCategory[category][dayOfWeek]) {
        occupancyByCategory[category][dayOfWeek].unavailableTime += unavailableTime / 1000;
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
          EXTRACT(DOW FROM la.datainicialdaocupacao) as day_of_week_num,
          CASE EXTRACT(DOW FROM la.datainicialdaocupacao)
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
          AND a.dataexclusao IS NULL
        GROUP BY ca.id, ca.descricao, EXTRACT(DOW FROM la.datainicialdaocupacao)
      ),
      suite_counts_by_category AS (
        SELECT
          ca.descricao as suite_category_name,
          COUNT(DISTINCT a.id) as total_suites_in_category
        FROM categoriaapartamento ca
        INNER JOIN apartamento a ON ca.id = a.id_categoriaapartamento
        WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
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
          EXTRACT(DOW FROM la.datainicialdaocupacao) as day_of_week_num,
          CASE EXTRACT(DOW FROM la.datainicialdaocupacao)
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
          AND a.dataexclusao IS NULL
        GROUP BY EXTRACT(DOW FROM la.datainicialdaocupacao)
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

    const dataTableGiroByWeek: any[] = Object.entries(giroByCategory).map(
      ([categoryName, dayData]) => ({
        [categoryName]: dayData,
      }),
    );

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
        totalAllRentalsApartments: bigNumbers.currentDate.totalAllRentalsApartments,
        totalAllValue: Number(bigNumbers.currentDate.totalAllValue.toFixed(2)),
        totalAllTicketAverage: Number(bigNumbers.currentDate.totalAllTicketAverage.toFixed(2)),
        totalGiro: Number(bigNumbers.currentDate.totalAllGiro.toFixed(2)),
        totalRevpar: Number(
          (bigNumbers.currentDate.totalAllRentalsApartments > 0
            ? revenueByDate.series.reduce((sum, val) => sum + val, 0) / totalSuites / daysDiff
            : 0
          ).toFixed(2),
        ),
        totalTrevpar: Number(bigNumbers.currentDate.totalAllTrevpar.toFixed(2)),
        totalAverageOccupationTime: bigNumbers.currentDate.totalAverageOccupationTime,
        totalOccupancyRate: Number(
          (bigNumbers.currentDate.totalAllRentalsApartments / totalSuites).toFixed(2),
        ),
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

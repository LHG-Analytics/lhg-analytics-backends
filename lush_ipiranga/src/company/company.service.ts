import { Injectable } from '@nestjs/common';
import { Prisma } from '@client-local';
import { PeriodEnum, RentalTypeEnum } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import * as moment from 'moment-timezone';
import { KpiCacheService } from '../cache';
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

interface WeeklyRevparData {
  [suiteCategory: string]: {
    [dayOfWeek: string]: {
      revpar: number;
      totalRevpar: number;
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
  GiroByDate: ApexChartsData;
  OccupancyRateBySuiteCategory: ApexChartsSeriesData;
  DataTableSuiteCategory: SuiteCategoryData[];
  TotalResult: TotalResultDataSQL;
  DataTableOccupancyRateByWeek: WeeklyOccupancyData[];
  DataTableGiroByWeek: WeeklyGiroData[];
  DataTableRevparByWeek: WeeklyRevparData[];
}

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private kpiCacheService: KpiCacheService,
  ) {}

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
      'company',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpisByDateRangeSQLInternal(startDate, endDate),
      { start: startDate, end: endDate },
    );

    // Busca período anterior com cache
    const previousResult = await this.kpiCacheService.getOrCalculate(
      'company',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpisByDateRangeSQLInternal(previousStartDate, previousEndDate),
      { start: previousStartDate, end: previousEndDate },
    );

    const currentData = currentResult.data;
    const previousData = previousResult.data;

    // Extrair BigNumbers do período atual
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
      'company',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpisByDateRangeSQLInternal(monthStartDate, monthEndDate),
      { start: monthStartDate, end: monthEndDate },
    );

    const monthlyData = monthlyResult.data;
    const monthlyBigNumbers = monthlyData.BigNumbers[0];

    // Calcular forecast
    let monthlyForecast: BigNumbersDataSQL['monthlyForecast'] | undefined;

    if (daysElapsed > 0) {
      const monthlyTotalValue = monthlyBigNumbers.currentDate.totalAllValue;
      const monthlyTotalRentals = monthlyBigNumbers.currentDate.totalAllRentalsApartments;

      // Média diária
      const dailyAverageValue = monthlyTotalValue / daysElapsed;
      const dailyAverageRentals = monthlyTotalRentals / daysElapsed;

      // Projeções
      const forecastValue = monthlyTotalValue + dailyAverageValue * remainingDays;
      const forecastRentals = monthlyTotalRentals + dailyAverageRentals * remainingDays;

      // Buscar total de suítes
      const totalSuitesSQL = `
        SELECT COUNT(*) as total_suites
        FROM apartamento a
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
          AND a.dataexclusao IS NULL
      `;
      const totalSuitesResult: any[] = await this.prisma.prismaLocal.$queryRaw<any[]>(
        Prisma.sql([totalSuitesSQL]),
      );
      const totalSuitesCount = Number(totalSuitesResult[0]?.total_suites) || 1;

      // Métricas recalculadas
      const forecastTicketAverage =
        forecastRentals > 0 ? Number((forecastValue / forecastRentals).toFixed(2)) : 0;
      const forecastGiro =
        totalSuitesCount > 0 && totalDaysInMonth > 0
          ? Number((forecastRentals / totalSuitesCount / totalDaysInMonth).toFixed(2))
          : 0;
      const forecastTrevpar =
        totalSuitesCount > 0 && totalDaysInMonth > 0
          ? Number((forecastValue / totalSuitesCount / totalDaysInMonth).toFixed(2))
          : 0;

      monthlyForecast = {
        totalAllValueForecast: Number(forecastValue.toFixed(2)),
        totalAllRentalsApartmentsForecast: Math.round(forecastRentals),
        totalAllTicketAverageForecast: forecastTicketAverage,
        totalAllTrevparForecast: forecastTrevpar,
        totalAllGiroForecast: forecastGiro,
        totalAverageOccupationTimeForecast:
          monthlyBigNumbers.currentDate.totalAverageOccupationTime,
      };
    }

    // Montar BigNumbers com previousDate e monthlyForecast
    const combinedBigNumbers: BigNumbersDataSQL = {
      currentDate: currentBigNumbers.currentDate,
      previousDate: {
        totalAllValuePreviousData: previousBigNumbers.currentDate.totalAllValue,
        totalAllRentalsApartmentsPreviousData:
          previousBigNumbers.currentDate.totalAllRentalsApartments,
        totalAllTicketAveragePreviousData: previousBigNumbers.currentDate.totalAllTicketAverage,
        totalAllTrevparPreviousData: previousBigNumbers.currentDate.totalAllTrevpar,
        totalAllGiroPreviousData: previousBigNumbers.currentDate.totalAllGiro,
        totalAverageOccupationTimePreviousData:
          previousBigNumbers.currentDate.totalAverageOccupationTime,
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

    // Calcular a diferença de dias para determinar se agrupa por mês ou por dia
    const rangeDays = moment(endDate).diff(moment(startDate), 'days');
    const groupByMonth = rangeDays > 40;

    // Gera array completo de períodos (datas ou meses) APENAS no período solicitado pelo usuário (exibição)
    const periodsArray: string[] = [];
    let currentDate = moment(startDate).utc();
    const userEndDate = moment(endDate).utc();

    if (groupByMonth) {
      // Agrupar por mês: gera array de meses no formato MM/YYYY
      while (
        currentDate.isBefore(userEndDate, 'month') ||
        currentDate.isSame(userEndDate, 'month')
      ) {
        periodsArray.push(currentDate.format('MM/YYYY'));
        currentDate.add(1, 'month');
      }
    } else {
      // Agrupar por dia: gera array de datas no formato DD/MM/YYYY
      while (currentDate.isBefore(userEndDate, 'day')) {
        periodsArray.push(currentDate.format('DD/MM/YYYY'));
        currentDate.add(1, 'day');
      }
    }

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

    // RevenueByDate - CORRIGIDO para incluir: locação + ocupadicional + consumo + venda direta
    const revenueByDateSQL = `
      WITH receita_consumo_por_data AS (
        -- Calcula receita de consumo agrupada por data do dia de ocupação
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
            ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
          END as date,
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
        GROUP BY CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END
      ),
      receita_locacao_por_data AS (
        -- Calcula receita de locação (permanencia + ocupadicional - desconto) por data
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
            ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
          END as date,
          COALESCE(SUM(
            COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
            COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) -
            COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
          ), 0) as daily_revenue
        FROM locacaoapartamento la
        INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE la.datainicialdaocupacao >= '${formattedStart}'
          AND la.datainicialdaocupacao <= '${formattedEnd}'
          AND la.fimocupacaotipo = 'FINALIZADA'
          AND ca.id IN (10,11,12,15,16,17,18,19,24)
        GROUP BY CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END
      ),
      vendas_diretas_por_data AS (
        -- Calcula receita de vendas diretas por data (usando datasaidaitem)
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM sei.datasaidaitem) >= 6 THEN DATE(sei.datasaidaitem)
            ELSE DATE(sei.datasaidaitem - INTERVAL '1 day')
          END as date,
          COALESCE(SUM(
            (CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))) -
            COALESCE((CAST(v.desconto AS DECIMAL(15,4)) /
              NULLIF((SELECT COUNT(*) FROM saidaestoqueitem sei2
                      WHERE sei2.id_saidaestoque = se.id
                      AND sei2.cancelado IS NULL), 0)
            ), 0)
          ), 0) as daily_sale_direct
        FROM saidaestoque se
        INNER JOIN vendadireta vd ON se.id = vd.id_saidaestoque
        INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
        LEFT JOIN venda v ON se.id = v.id_saidaestoque
        WHERE vd.venda_completa = true
          AND sei.cancelado IS NULL
          AND sei.datasaidaitem >= '${formattedStart}'
          AND sei.datasaidaitem <= '${formattedEnd}'
        GROUP BY CASE
          WHEN EXTRACT(HOUR FROM sei.datasaidaitem) >= 6 THEN DATE(sei.datasaidaitem)
          ELSE DATE(sei.datasaidaitem - INTERVAL '1 day')
        END
      )
      -- Combina tudo: locação + consumo + venda direta
      SELECT
        COALESCE(rl.date, rc.date, vd.date) as date,
        COALESCE(rl.daily_revenue, 0) + COALESCE(rc.valor_consumo_bruto, 0) + COALESCE(vd.daily_sale_direct, 0) as daily_revenue
      FROM receita_locacao_por_data rl
      FULL OUTER JOIN receita_consumo_por_data rc ON rl.date = rc.date
      FULL OUTER JOIN vendas_diretas_por_data vd ON COALESCE(rl.date, rc.date) = vd.date
      ORDER BY date
    `;

    // RentalRevenueByDate - SOMENTE receita de locação líquida (valorliquidolocacao)
    // Usado para calcular RevparByDate corretamente
    const rentalRevenueByDateSQL = `
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END as date,
        COALESCE(SUM(
          COALESCE(CAST(la.valorliquidolocacao AS DECIMAL(15,4)), 0)
        ), 0) as daily_rental_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca.id IN (10,11,12,15,16,17,18,19,24)
      GROUP BY CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END
      ORDER BY date
    `;

    // BillingRentalType - CORRIGIDO para incluir: locação + ocupadicional + consumo
    const billingRentalTypeSQL = `
      WITH receita_consumo_locacao AS (
        -- Calcula receita de consumo por locação
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
        GROUP BY la.id_apartamentostate
      )
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
        COALESCE(SUM(
          COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
          COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) +
          COALESCE(rc.valor_consumo_bruto, 0) -
          COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
        ), 0) as total_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      LEFT JOIN receita_consumo_locacao rc ON la.id_apartamentostate = rc.id_locacao
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

    // RevenueBySuiteCategory - CORRIGIDO para incluir: locação + ocupadicional + consumo
    const revenueBySuiteCategorySQL = `
      WITH receita_consumo_locacao AS (
        -- Calcula receita de consumo por locação
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
        GROUP BY la.id_apartamentostate
      )
      SELECT
        ca.descricao as suite_category,
        COALESCE(SUM(
          COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
          COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) +
          COALESCE(rc.valor_consumo_bruto, 0) -
          COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
        ), 0) as category_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      LEFT JOIN receita_consumo_locacao rc ON la.id_apartamentostate = rc.id_locacao
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

    // TRevPAR por data - CORRIGIDO para incluir: locação + ocupadicional + consumo + gorjeta
    const trevparByDateSQL = `
      WITH receita_consumo_locacao AS (
        -- Calcula receita de consumo por locação
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
        ), 0) as total_revenue
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      LEFT JOIN receita_consumo_locacao rc ON la.id_apartamentostate = rc.id_locacao
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
      GROUP BY CASE
        WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
        ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
      END
      ORDER BY date
    `;

    // SQL para calcular tempo de ocupação por categoria de suíte e data
    // Taxa de ocupação = (tempo ocupado / tempo disponível) × 100
    const occupancyRateBySuiteCategorySQL = `
      SELECT
        ca.descricao as suite_category,
        CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END as rental_date,
        SUM(EXTRACT(EPOCH FROM (la.datafinaldaocupacao - la.datainicialdaocupacao))) as total_occupied_time
      FROM locacaoapartamento la
      INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
      INNER JOIN apartamento a ON aps.id_apartamento = a.id
      INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
      WHERE la.datainicialdaocupacao >= '${formattedStart}'
        AND la.datainicialdaocupacao <= '${formattedEnd}'
        AND la.fimocupacaotipo = 'FINALIZADA'
        AND ca.descricao IN ('LUSH', 'LUSH POP', 'LUSH HIDRO', 'LUSH LOUNGE', 'LUSH SPA', 'LUSH CINE', 'LUSH SPLASH', 'LUSH SPA SPLASH', 'CASA LUSH')
      GROUP BY ca.descricao, CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END
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

    // SQL para calcular Giro por data
    // Giro = total de locações / total de suítes / número de dias no período
    // Para cada data, calculamos o giro daquele dia específico
    const giroByDateSQL = `
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

    // SQL para calcular tempo de ocupação por data (para OccupancyRate correto)
    const occupancyTimeByDateSQL = `
      SELECT
        CASE
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) >= 6 THEN DATE(la.datainicialdaocupacao)
          ELSE DATE(la.datainicialdaocupacao - INTERVAL '1 day')
        END as date,
        SUM(EXTRACT(EPOCH FROM (la.datafinaldaocupacao - la.datainicialdaocupacao))) as total_occupied_time
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

    // Executa TODAS as consultas SQL em paralelo (seguindo padrão do bookings.service)
    const [
      bigNumbersResult,
      totalSaleDirectResult,
      totalSuitesResult,
      revenueByDateResult,
      rentalRevenueByDateResult,
      billingRentalTypeResult,
      revenueBySuiteCategoryResult,
      rentalsByDateResult,
      ticketAverageByDateResult,
      trevparByDateResult,
      occupancyRateBySuiteCategoryResult,
      suitesByCategoryResult,
      giroByDateResult,
      occupancyTimeByDateResult,
    ] = await Promise.all([
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([bigNumbersSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([totalSaleDirectSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([totalSuitesSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([revenueByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([rentalRevenueByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([billingRentalTypeSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([revenueBySuiteCategorySQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([rentalsByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([ticketAverageByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([trevparByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([occupancyRateBySuiteCategorySQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([suitesByCategorySQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([giroByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([occupancyTimeByDateSQL])),
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

    // Cria mapeamento de dados por data ou mês (seguindo padrão do bookings.service)
    const revenueDataMap = new Map<string, number>();

    revenueByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = groupByMonth
        ? moment.utc(item.date).format('MM/YYYY')
        : moment.utc(item.date).format('DD/MM/YYYY');
      const currentValue = revenueDataMap.get(dateKey) || 0;
      revenueDataMap.set(dateKey, currentValue + Number(item.daily_revenue || 0));
    });

    const revenueByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((periodKey: string) => {
        return revenueDataMap.get(periodKey) || 0;
      }),
    };

    const revenueBySuiteCategory: ApexChartsData = {
      categories: revenueBySuiteCategoryResult.map((item) => item.suite_category),
      series: revenueBySuiteCategoryResult.map((item) => Number(item.category_revenue) || 0),
    };

    // Mapeamento de dados do BillingRentalType (agrupando por mês se necessário)
    const billingDataMap = new Map<string, Record<string, number>>();
    billingRentalTypeResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = groupByMonth
        ? moment.utc(item.date).format('MM/YYYY')
        : moment.utc(item.date).format('DD/MM/YYYY');
      if (!billingDataMap.has(dateKey)) {
        billingDataMap.set(dateKey, {});
      }
      const currentValue = billingDataMap.get(dateKey)![item.rental_type] || 0;
      billingDataMap.get(dateKey)![item.rental_type] = currentValue + Number(item.total_revenue);
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

    // Mapeamento para exibição em português
    const rentalTypeLabels: Record<string, string> = {
      THREE_HOURS: '3 Horas',
      SIX_HOURS: '6 Horas',
      TWELVE_HOURS: '12 Horas',
      DAY_USE: 'Dayuse',
      DAILY: 'Diária',
      OVERNIGHT: 'Pernoite',
    };

    const billingRentalType: ApexChartsSeriesData = {
      categories: [...periodsArray],
      series: allRentalTypes.map((rentalType) => ({
        name: rentalTypeLabels[rentalType] || rentalType,
        data: [...periodsArray].map((periodKey: string) => {
          const item = billingDataMap.get(periodKey);
          return item && item[rentalType] ? item[rentalType] : 0;
        }),
      })),
    };

    // Criar mapeamento de dados para RentalsByDate (agrupando por mês se necessário)
    const rentalsDataMap = new Map<string, number>();
    rentalsByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = groupByMonth
        ? moment.utc(item.date).format('MM/YYYY')
        : moment.utc(item.date).format('DD/MM/YYYY');
      const currentValue = rentalsDataMap.get(dateKey) || 0;
      rentalsDataMap.set(dateKey, currentValue + Number(item.total_rentals || 0));
    });

    const rentalsByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((periodKey: string) => {
        return rentalsDataMap.get(periodKey) || 0;
      }),
    };

    // Obter total de suítes (já consultado no Promise.all)
    const totalSuites =
      totalSuitesResult.length > 0 ? Number(totalSuitesResult[0].total_suites) || 1 : 1;

    // Criar mapeamento para receita de locação por data (para Revpar correto)
    const rentalRevenueDataMap = new Map<string, number>();
    rentalRevenueByDateResult.forEach((item: any) => {
      const dateKey = groupByMonth
        ? moment.utc(item.date).format('MM/YYYY')
        : moment.utc(item.date).format('DD/MM/YYYY');
      const currentValue = rentalRevenueDataMap.get(dateKey) || 0;
      rentalRevenueDataMap.set(dateKey, currentValue + Number(item.daily_rental_revenue || 0));
    });

    // Calcular REVPAR usando APENAS receita de locação (sem consumo e vendas diretas)
    const revparByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((periodKey: string) => {
        const rentalRevenue = rentalRevenueDataMap.get(periodKey) || 0;
        return Number((rentalRevenue / totalSuites).toFixed(2));
      }),
    };

    // Criar mapeamento de dados para TicketAverageByDate (agrupando por mês se necessário)
    // Para ticket médio, precisamos calcular a média ponderada (soma dos tickets / número de dias)
    const ticketDataMap = new Map<string, { sum: number; count: number }>();
    ticketAverageByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = groupByMonth
        ? moment.utc(item.date).format('MM/YYYY')
        : moment.utc(item.date).format('DD/MM/YYYY');
      const current = ticketDataMap.get(dateKey) || { sum: 0, count: 0 };
      const ticketValue = Number(item.avg_ticket) || 0;
      if (ticketValue > 0) {
        ticketDataMap.set(dateKey, { sum: current.sum + ticketValue, count: current.count + 1 });
      }
    });

    const ticketAverageByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((periodKey: string) => {
        const item = ticketDataMap.get(periodKey);
        if (!item || item.count === 0) return 0;
        return Number((item.sum / item.count).toFixed(2));
      }),
    };

    // Criar mapeamento de dados para TrevparByDate (agrupando por mês se necessário)
    // Para TREVPAR, somamos a receita total e depois dividimos por suítes
    const trevparDataMap = new Map<string, number>();
    trevparByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = groupByMonth
        ? moment.utc(item.date).format('MM/YYYY')
        : moment.utc(item.date).format('DD/MM/YYYY');
      const currentValue = trevparDataMap.get(dateKey) || 0;
      trevparDataMap.set(dateKey, currentValue + Number(item.total_revenue || 0));
    });

    const trevparByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((periodKey: string) => {
        const totalRevenue = trevparDataMap.get(periodKey) || 0;
        return Number((totalRevenue / totalSuites).toFixed(2));
      }),
    };

    // Calcular OccupancyRateByDate - Taxa de ocupação por data
    // Taxa de ocupação = (tempo ocupado / tempo disponível) × 100
    // Tempo disponível = total de suítes × 86400 segundos (1 dia)
    const occupancyTimeDataMap = new Map<string, number>();
    occupancyTimeByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = groupByMonth
        ? moment.utc(item.date).format('MM/YYYY')
        : moment.utc(item.date).format('DD/MM/YYYY');
      const currentTime = occupancyTimeDataMap.get(dateKey) || 0;
      occupancyTimeDataMap.set(dateKey, currentTime + Number(item.total_occupied_time || 0));
    });

    const occupancyRateByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((periodKey: string) => {
        const totalOccupiedTime = occupancyTimeDataMap.get(periodKey) || 0;
        // Para agrupamento por mês, precisamos calcular quantos dias tem no período
        // Para diário, é sempre 1 dia
        let daysInPeriod = 1;
        if (groupByMonth) {
          // Contar quantos dias existem no mês dentro do período pesquisado
          const [month, year] = periodKey.split('/');
          const firstDayOfMonth = moment.utc(`${year}-${month}-01`);
          const lastDayOfMonth = firstDayOfMonth.clone().endOf('month');
          const periodStart = moment.utc(startDate);
          const periodEnd = moment.utc(endDate);

          const effectiveStart = moment.max(firstDayOfMonth, periodStart);
          const effectiveEnd = moment.min(lastDayOfMonth, periodEnd);
          daysInPeriod = effectiveEnd.diff(effectiveStart, 'days') + 1;
        }

        // Tempo disponível = total de suítes × dias × 86400 segundos
        const totalAvailableTime = totalSuites * daysInPeriod * 86400;
        const occupancyRate =
          totalAvailableTime > 0 ? (totalOccupiedTime / totalAvailableTime) * 100 : 0;
        return Number(occupancyRate.toFixed(2));
      }),
    };

    // Calcular GiroByDate - Giro por data
    // Giro = total de locações / total de suítes
    // Para agrupamento por mês, somamos as locações do mês e calculamos a média diária
    const giroDataMap = new Map<string, { totalRentals: number; daysCount: number }>();
    giroByDateResult.forEach((item: any) => {
      // Usar moment para padronizar formato igual ao periodsArray
      const dateKey = groupByMonth
        ? moment.utc(item.date).format('MM/YYYY')
        : moment.utc(item.date).format('DD/MM/YYYY');
      const current = giroDataMap.get(dateKey) || { totalRentals: 0, daysCount: 0 };
      giroDataMap.set(dateKey, {
        totalRentals: current.totalRentals + Number(item.total_rentals || 0),
        daysCount: current.daysCount + 1,
      });
    });

    const giroByDate: ApexChartsData = {
      categories: [...periodsArray],
      series: [...periodsArray].map((periodKey: string) => {
        const item = giroDataMap.get(periodKey);
        if (!item || item.daysCount === 0) return 0;
        // Se agrupado por mês, calculamos a média diária (total de locações / dias do mês / suítes)
        // Se diário, é simplesmente (locações do dia / suítes)
        const avgRentals = groupByMonth ? item.totalRentals / item.daysCount : item.totalRentals;
        return Number((avgRentals / totalSuites).toFixed(2));
      }),
    };

    // Calcular taxa de ocupação por categoria (formato ApexCharts com dates/meses em categories e suites em series)
    // Taxa de ocupação = (tempo ocupado / tempo disponível) × 100
    const occupancyBySuiteCategoryMap = new Map<
      string,
      Map<string, { totalOccupiedTime: number; daysCount: number }>
    >();
    const allSuiteCategoriesSet = new Set<string>();

    // Processar dados do occupancyRateBySuiteCategoryResult
    occupancyRateBySuiteCategoryResult.forEach((item) => {
      const dateKey = groupByMonth
        ? moment(item.rental_date).format('MM/YYYY')
        : moment(item.rental_date).format('DD/MM/YYYY');
      const suiteCategoryName = item.suite_category;
      const totalOccupiedTime = Number(item.total_occupied_time) || 0;

      allSuiteCategoriesSet.add(suiteCategoryName);

      if (!occupancyBySuiteCategoryMap.has(dateKey)) {
        occupancyBySuiteCategoryMap.set(dateKey, new Map());
      }
      const categoryMap = occupancyBySuiteCategoryMap.get(dateKey)!;
      const current = categoryMap.get(suiteCategoryName) || { totalOccupiedTime: 0, daysCount: 0 };
      categoryMap.set(suiteCategoryName, {
        totalOccupiedTime: current.totalOccupiedTime + totalOccupiedTime,
        daysCount: current.daysCount + 1,
      });
    });

    // Criar series para cada categoria de suíte usando periodsArray
    const occupancyRateBySuiteCategory: ApexChartsSeriesData = {
      categories: [...periodsArray],
      series: Array.from(allSuiteCategoriesSet).map((suiteCategoryName) => {
        // Obter número de suítes na categoria
        const categoryInfo = suitesByCategoryResult.find(
          (s) => s.suite_category === suiteCategoryName,
        );
        const totalSuitesInCategory = categoryInfo
          ? Number(categoryInfo.total_suites_in_category)
          : 1;

        return {
          name: suiteCategoryName,
          data: [...periodsArray].map((periodKey) => {
            const categoryData = occupancyBySuiteCategoryMap.get(periodKey)?.get(suiteCategoryName);
            if (!categoryData) return 0;

            // Para agrupamento por mês, precisamos calcular quantos dias tem no período
            let daysInPeriod = 1;
            if (groupByMonth) {
              const [month, year] = periodKey.split('/');
              const firstDayOfMonth = moment.utc(`${year}-${month}-01`);
              const lastDayOfMonth = firstDayOfMonth.clone().endOf('month');
              const periodStart = moment.utc(startDate);
              const periodEnd = moment.utc(endDate);

              const effectiveStart = moment.max(firstDayOfMonth, periodStart);
              const effectiveEnd = moment.min(lastDayOfMonth, periodEnd);
              daysInPeriod = effectiveEnd.diff(effectiveStart, 'days') + 1;
            }

            // Tempo disponível = total de suítes na categoria × dias × 86400 segundos
            const totalAvailableTime = totalSuitesInCategory * daysInPeriod * 86400;
            const occupancyRate =
              totalAvailableTime > 0
                ? (categoryData.totalOccupiedTime / totalAvailableTime) * 100
                : 0;
            return Number(occupancyRate.toFixed(2));
          }),
        };
      }),
    };

    // === IMPLEMENTAÇÃO DO DATATABLESUITEACATEGORY ===
    // OTIMIZAÇÃO: Removida subquery correlata, usando JOIN com CTE de consumo
    // Isso melhora drasticamente a performance pois a subquery era executada PARA CADA linha
    const suiteCategoryKpisResult: any[] = await this.prisma.prismaLocal.$queryRaw`
      WITH consumo_por_locacao AS (
        -- Primeiro calcula o consumo por locação (uma vez só)
        SELECT
          vl.id_locacaoapartamento,
          COALESCE(SUM(
            CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))
          ), 0) as valor_consumo
        FROM vendalocacao vl
        INNER JOIN saidaestoque se ON vl.id_saidaestoque = se.id
        INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
        WHERE sei.cancelado IS NULL
        GROUP BY vl.id_locacaoapartamento
      ),
      suite_category_data AS (
        SELECT
          ca.descricao as suite_category_name,
          COUNT(*) as total_rentals,
          -- Receita total: (permanencia + ocupadicional + consumo) - desconto
          -- Agora usando JOIN em vez de subquery correlata!
          COALESCE(SUM(
            COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
            COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) +
            COALESCE(cpl.valor_consumo, 0) -
            COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
          ), 0) as total_value,
          -- Receita apenas de locação líquida (valorliquidolocacao já contém desconto aplicado)
          COALESCE(SUM(
            COALESCE(CAST(la.valorliquidolocacao AS DECIMAL(15,4)), 0)
          ), 0) as rental_revenue,
          -- Tempo total de ocupação em segundos
          COALESCE(SUM(
            EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao)
          ), 0) as total_occupied_time
        FROM locacaoapartamento la
        INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        LEFT JOIN consumo_por_locacao cpl ON la.id_apartamentostate = cpl.id_locacaoapartamento
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
        FROM generate_series(${formattedStart}::timestamp, ${formattedEnd}::timestamp, INTERVAL '1 day') d
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

    // === IMPLEMENTAÇÃO DO DATATABLEREVPARBYWEEK ===
    // Consulta SQL para RevPAR semanal por categoria
    // RevPAR = (receita de locação) / total de suítes / dias
    // Receita de locação = valorliquidolocacao (já contém desconto aplicado)
    const revparByWeekResult: any[] = await this.prisma.prismaLocal.$queryRaw`
      WITH commercial_day_calculation AS (
        -- CTE auxiliar para calcular o dia comercial (lógica das 6h)
        SELECT
          ca.descricao as suite_category_name,
          -- Dia comercial para agrupamento
          CASE
            WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
            ELSE la.datainicialdaocupacao
          END as commercial_date,
          -- Métricas de GIRO: contagem de locações
          COUNT(*) as rental_count,
          -- Métricas de REVPAR: soma da receita de locação líquida (valorliquidolocacao já contém desconto aplicado)
          SUM(
            COALESCE(CAST(la.valorliquidolocacao AS DECIMAL(15,4)), 0)
          ) as rental_revenue
        FROM locacaoapartamento la
        INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE la.datainicialdaocupacao >= ${formattedStart}::timestamp
          AND la.datainicialdaocupacao <= ${formattedEnd}::timestamp
          AND la.fimocupacaotipo = 'FINALIZADA'
          AND ca.id IN (10,11,12,15,16,17,18,19,24)
        GROUP BY
          ca.id,
          ca.descricao,
          CASE
            WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
            ELSE la.datainicialdaocupacao
          END
      ),
      day_of_week_mapping AS (
        -- Converte data comercial para dia da semana
        SELECT
          suite_category_name,
          rental_count,
          rental_revenue,
          EXTRACT(DOW FROM commercial_date) as day_of_week_num,
          CASE EXTRACT(DOW FROM commercial_date)
            WHEN 0 THEN 'domingo'
            WHEN 1 THEN 'segunda-feira'
            WHEN 2 THEN 'terça-feira'
            WHEN 3 THEN 'quarta-feira'
            WHEN 4 THEN 'quinta-feira'
            WHEN 5 THEN 'sexta-feira'
            WHEN 6 THEN 'sábado'
          END as day_of_week
        FROM commercial_day_calculation
      ),
      aggregated_by_category_day AS (
        -- Agrega por categoria e dia da semana
        SELECT
          suite_category_name,
          day_of_week,
          day_of_week_num,
          SUM(rental_count) as total_rentals,
          SUM(rental_revenue) as total_revenue
        FROM day_of_week_mapping
        GROUP BY suite_category_name, day_of_week, day_of_week_num
      ),
      total_by_day AS (
        -- Total por dia da semana (todas as categorias)
        SELECT
          day_of_week,
          day_of_week_num,
          SUM(total_rentals) as grand_total_rentals,
          SUM(total_revenue) as grand_total_revenue
        FROM aggregated_by_category_day
        GROUP BY day_of_week, day_of_week_num
      ),
      days_count_in_period AS (
        -- Conta quantos dias de cada dia da semana existem no período
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
        FROM generate_series(${formattedStart}::timestamp, ${formattedEnd}::timestamp, INTERVAL '1 day') d
        GROUP BY EXTRACT(DOW FROM d::date)
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
      )
      SELECT
        acd.suite_category_name,
        acd.day_of_week,
        acd.total_rentals,
        acd.total_revenue,
        sc.total_suites_in_category,
        dc.days_count,
        td.grand_total_rentals,
        td.grand_total_revenue,
        -- Cálculos para REVPAR por categoria
        CASE
          WHEN sc.total_suites_in_category > 0 AND dc.days_count > 0 THEN
            (acd.total_revenue::DECIMAL / (sc.total_suites_in_category * dc.days_count))
          ELSE 0
        END as category_revpar,
        -- Cálculos para REVPAR total
        CASE
          WHEN ${totalSuites}::DECIMAL > 0 AND dc.days_count > 0 THEN
            (td.grand_total_revenue::DECIMAL / (${totalSuites}::DECIMAL * dc.days_count))
          ELSE 0
        END as total_revpar
      FROM aggregated_by_category_day acd
      INNER JOIN suite_counts sc ON acd.suite_category_name = sc.suite_category_name
      INNER JOIN days_count_in_period dc ON acd.day_of_week_num = dc.day_of_week_num
      INNER JOIN total_by_day td ON acd.day_of_week_num = td.day_of_week_num
      ORDER BY acd.suite_category_name, acd.day_of_week_num
    `;

    // Transformar os resultados no formato esperado (WeeklyRevparData[])
    const revparByCategory: { [category: string]: { [day: string]: any } } = {};

    revparByWeekResult.forEach((item) => {
      const categoryName = item.suite_category_name;
      const dayName = item.day_of_week;

      if (!revparByCategory[categoryName]) {
        revparByCategory[categoryName] = {};
      }

      revparByCategory[categoryName][dayName] = {
        revpar: Number(Number(item.category_revpar).toFixed(2)),
        totalRevpar: Number(Number(item.total_revpar).toFixed(2)),
      };
    });

    // Preencher dias ausentes com revpar 0 para cada categoria de suíte
    Object.keys(revparByCategory).forEach((categoryName) => {
      // Pegar o totalRevpar de qualquer dia existente para usar como referência
      const existingDay = Object.values(revparByCategory[categoryName])[0];
      const totalRevparReference = existingDay ? existingDay.totalRevpar : 0;

      allDaysOfWeekSQL.forEach((day) => {
        if (!revparByCategory[categoryName][day]) {
          revparByCategory[categoryName][day] = {
            revpar: 0,
            totalRevpar: totalRevparReference,
          };
        }
      });
    });

    const dataTableRevparByWeek: any[] = Object.entries(revparByCategory).map(
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
      GiroByDate: giroByDate,
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
      DataTableRevparByWeek: dataTableRevparByWeek,
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

  /**
   * OTIMIZAÇÃO: Query consolidada para DataTableGiroByWeek e DataTableRevparByWeek
   * Retorna ambos os resultados em UMA única query em vez de duas separadas
   *
   * Reduz de ~2 queries para 1 query, economizando um round-trip de rede
   */
  private async getWeeklyMetricsConsolidated(
    formattedStart: string,
    formattedEnd: string,
    totalSuites: number,
  ): Promise<{
    giroByWeek: WeeklyGiroData[];
    revparByWeek: WeeklyRevparData[];
  }> {
    const result: any[] = await this.prisma.prismaLocal.$queryRaw`
      WITH commercial_day_calculation AS (
        -- CTE auxiliar para calcular o dia comercial (lógica das 6h)
        SELECT
          ca.descricao as suite_category_name,
          -- Dia comercial para agrupamento
          CASE
            WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
            ELSE la.datainicialdaocupacao
          END as commercial_date,
          -- Métricas de GIRO: contagem de locações
          COUNT(*) as rental_count,
          -- Métricas de REVPAR: soma da receita de locação líquida (valorliquidolocacao já contém desconto aplicado)
          SUM(
            COALESCE(CAST(la.valorliquidolocacao AS DECIMAL(15,4)), 0)
          ) as rental_revenue
        FROM locacaoapartamento la
        INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE la.datainicialdaocupacao >= ${formattedStart}::timestamp
          AND la.datainicialdaocupacao <= ${formattedEnd}::timestamp
          AND la.fimocupacaotipo = 'FINALIZADA'
          AND ca.id IN (10,11,12,15,16,17,18,19,24)
        GROUP BY
          ca.id,
          ca.descricao,
          CASE
            WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6 THEN la.datainicialdaocupacao - INTERVAL '1 day'
            ELSE la.datainicialdaocupacao
          END
      ),
      day_of_week_mapping AS (
        -- Converte data comercial para dia da semana
        SELECT
          suite_category_name,
          rental_count,
          rental_revenue,
          EXTRACT(DOW FROM commercial_date) as day_of_week_num,
          CASE EXTRACT(DOW FROM commercial_date)
            WHEN 0 THEN 'domingo'
            WHEN 1 THEN 'segunda-feira'
            WHEN 2 THEN 'terça-feira'
            WHEN 3 THEN 'quarta-feira'
            WHEN 4 THEN 'quinta-feira'
            WHEN 5 THEN 'sexta-feira'
            WHEN 6 THEN 'sábado'
          END as day_of_week
        FROM commercial_day_calculation
      ),
      aggregated_by_category_day AS (
        -- Agrega por categoria e dia da semana
        SELECT
          suite_category_name,
          day_of_week,
          day_of_week_num,
          SUM(rental_count) as total_rentals,
          SUM(rental_revenue) as total_revenue
        FROM day_of_week_mapping
        GROUP BY suite_category_name, day_of_week, day_of_week_num
      ),
      total_by_day AS (
        -- Total por dia da semana (todas as categorias)
        SELECT
          day_of_week,
          day_of_week_num,
          SUM(total_rentals) as grand_total_rentals,
          SUM(total_revenue) as grand_total_revenue
        FROM aggregated_by_category_day
        GROUP BY day_of_week, day_of_week_num
      ),
      days_count_in_period AS (
        -- Conta quantos dias de cada dia da semana existem no período
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
        FROM generate_series(${formattedStart}::timestamp, ${formattedEnd}::timestamp, INTERVAL '1 day') d
        GROUP BY EXTRACT(DOW FROM d::date)
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
      )
      SELECT
        acd.suite_category_name,
        acd.day_of_week,
        acd.total_rentals,
        acd.total_revenue,
        sc.total_suites_in_category,
        dc.days_count,
        td.grand_total_rentals,
        td.grand_total_revenue,
        -- Cálculos para GIRO por categoria
        CASE
          WHEN sc.total_suites_in_category > 0 AND dc.days_count > 0 THEN
            (acd.total_rentals::DECIMAL / (sc.total_suites_in_category * dc.days_count))
          ELSE 0
        END as category_giro,
        -- Cálculos para GIRO total
        CASE
          WHEN ${totalSuites}::DECIMAL > 0 AND dc.days_count > 0 THEN
            (td.grand_total_rentals::DECIMAL / (${totalSuites}::DECIMAL * dc.days_count))
          ELSE 0
        END as total_giro,
        -- Cálculos para REVPAR por categoria
        CASE
          WHEN sc.total_suites_in_category > 0 AND dc.days_count > 0 THEN
            (acd.total_revenue::DECIMAL / (sc.total_suites_in_category * dc.days_count))
          ELSE 0
        END as category_revpar,
        -- Cálculos para REVPAR total
        CASE
          WHEN ${totalSuites}::DECIMAL > 0 AND dc.days_count > 0 THEN
            (td.grand_total_revenue::DECIMAL / (${totalSuites}::DECIMAL * dc.days_count))
          ELSE 0
        END as total_revpar
      FROM aggregated_by_category_day acd
      INNER JOIN suite_counts sc ON acd.suite_category_name = sc.suite_category_name
      INNER JOIN days_count_in_period dc ON acd.day_of_week_num = dc.day_of_week_num
      INNER JOIN total_by_day td ON acd.day_of_week_num = td.day_of_week_num
      ORDER BY acd.suite_category_name, acd.day_of_week_num
    `;

    // Processar resultados
    const giroByCategory: { [category: string]: { [day: string]: any } } = {};
    const revparByCategory: { [category: string]: { [day: string]: any } } = {};
    const allDaysOfWeek = [
      'domingo',
      'segunda-feira',
      'terça-feira',
      'quarta-feira',
      'quinta-feira',
      'sexta-feira',
      'sábado',
    ];

    // Primeira passagem: preencher dados existentes
    result.forEach((item) => {
      const categoryName = item.suite_category_name;
      const dayName = item.day_of_week;

      if (!giroByCategory[categoryName]) {
        giroByCategory[categoryName] = {};
        revparByCategory[categoryName] = {};
      }

      giroByCategory[categoryName][dayName] = {
        giro: Number(Number(item.category_giro).toFixed(2)),
        totalGiro: Number(Number(item.total_giro).toFixed(2)),
      };

      revparByCategory[categoryName][dayName] = {
        revpar: Number(Number(item.category_revpar).toFixed(2)),
        totalRevpar: Number(Number(item.total_revpar).toFixed(2)),
      };
    });

    // Criar mapa de totalGiro e totalRevpar por dia da semana (valores globais, independente de categoria)
    const totalGiroByDay: { [day: string]: number } = {};
    const totalRevparByDay: { [day: string]: number } = {};

    // Inicializa todos os dias com zero
    allDaysOfWeek.forEach((day) => {
      totalGiroByDay[day] = 0;
      totalRevparByDay[day] = 0;
    });

    // Extrair os valores totais de cada dia da semana (são os mesmos para todas as categorias)
    result.forEach((item) => {
      const dayName = item.day_of_week;
      totalGiroByDay[dayName] = Number(Number(item.total_giro).toFixed(2));
      totalRevparByDay[dayName] = Number(Number(item.total_revpar).toFixed(2));
    });

    // Segunda passagem: preencher dias ausentes com zero e usar os totais corretos do dia
    Object.keys(giroByCategory).forEach((categoryName) => {
      allDaysOfWeek.forEach((day) => {
        if (!giroByCategory[categoryName][day]) {
          giroByCategory[categoryName][day] = {
            giro: 0,
            totalGiro: totalGiroByDay[day] ?? 0
          };
        }
        if (!revparByCategory[categoryName][day]) {
          revparByCategory[categoryName][day] = {
            revpar: 0,
            totalRevpar: totalRevparByDay[day] ?? 0
          };
        }
      });
    });

    return {
      giroByWeek: Object.entries(giroByCategory).map(([categoryName, dayData]) => ({
        [categoryName]: dayData,
      })),
      revparByWeek: Object.entries(revparByCategory).map(([categoryName, dayData]) => ({
        [categoryName]: dayData,
      })),
    };
  }
}

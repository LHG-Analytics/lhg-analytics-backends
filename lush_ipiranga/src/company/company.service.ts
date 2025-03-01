import { Injectable } from '@nestjs/common';
import {
  PeriodEnum,
  Prisma,
  RentalTypeEnum,
} from '../../dist/generated/client-online';
import { PrismaService } from '../prisma/prisma.service';
import * as moment from 'moment-timezone';

@Injectable()
export class CompanyService {
  constructor(private prisma: PrismaService) {}

  async findAllCompany(period: PeriodEnum) {
    // Define o fuso horário padrão como São Paulo
    moment.tz.setDefault('America/Sao_Paulo');

    let startDate, endDate, startDatePrevious, endDatePrevious;

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
    startDate = moment.tz(startDate, 'America/Sao_Paulo').utc(true).toDate();
    endDate = moment.tz(endDate, 'America/Sao_Paulo').utc(true).toDate();
    startDatePrevious = moment
      .tz(startDatePrevious, 'America/Sao_Paulo')
      .utc(true)
      .toDate();
    endDatePrevious = moment
      .tz(endDatePrevious, 'America/Sao_Paulo')
      .utc(true)
      .toDate();

    // Exibe as datas geradas
    console.log('startDate:', startDate);
    console.log('endDate:', endDate);
    console.log('startDatePrevious:', startDatePrevious);
    console.log('endDatePrevious:', endDatePrevious);

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
            gte: startDate, // Filtra pela data inicial
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
            gte: startDate, // Filtra pela data inicial
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
            gte: startDate, // Filtra pela data inicial
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
          description: {
            in: [
              'LUSH',
              'LUSH POP',
              'LUSH HIDRO',
              'LUSH LOUNGE',
              'LUSH SPA',
              'LUSH CINE',
              'LUSH SPLASH',
              'LUSH SPA SPLASH',
              'CASA LUSH',
            ],
          },
        },
      }),
    ]);

    // Montando o retorno de BigNumbers
    const bigNumbers = {
      currentDate: {
        // Itera sobre cada item e acumula o totalValue
        totalAllValue: this.formatCurrency(
          Number(KpiRevenue[0]?.totalAllValue ?? 0),
        ),
        totalAllRentalsApartments:
          KpiTotalRentals[0]?.totalAllRentalsApartments ?? 0,
        totalAllTicketAverage: this.formatCurrency(
          Number(KpiTicketAverage[0]?.totalAllTicketAverage ?? 0),
        ),
        totalAllRevpar: this.formatCurrency(
          Number(KpiRevpar[0]?.totalRevpar ?? 0),
        ),
        totalAllGiro: Number(KpiGiro[0]?.totalGiro ?? 0),
        totalAverageOccupationTime:
          KpiAlos[0]?.totalAverageOccupationTime ?? '00:00:00',
      },

      PreviousDate: {
        totalAllValuePreviousData: this.formatCurrency(
          Number(KpiRevenuePreviousData[0]?.totalAllValue ?? 0),
        ),
        totalAllRentalsApartmentsPreviousData:
          KpiTotalRentalsPreviousData[0]?.totalAllRentalsApartments ?? 0,
        totalAllTicketAveragePreviousData: this.formatCurrency(
          Number(KpiTicketAveragePreviousData[0]?.totalAllTicketAverage ?? 0),
        ),
        totalAllRevparPreviousData: this.formatCurrency(
          Number(KpiRevparPreviousData[0]?.totalRevpar ?? 0),
        ),
        totalAllGiroPreviousData: Number(
          KpiGiroPreviousData[0]?.totalGiro ?? 0,
        ),

        totalAverageOccupationTimePreviousData:
          KpiAlosPreviousData[0]?.totalAverageOccupationTime ?? '00:00:00',
      },
    };

    // Montando o retorno de DataTableSuiteCategory
    const dataTableSuiteCategory = suiteCategory.map((suite) => {
      const suiteName = suite.description;

      // Filtrar os valores de KPI específicos para a suite atual
      const kpiRevenueForSuite = KpiRevenue.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiTotalRentalsForSuite = KpiTotalRentals.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiTicketAverageForSuite = KpiTicketAverage.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiRevparForSuite = KpiRevpar.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiOccupancyRateForSuite = KpiOccupancyRate.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiAlosForSuite = KpiAlos.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiGiroForSuite = KpiGiro.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );
      const kpiTrevparForSuite = KpiTrevpar.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );

      // Montar o objeto para cada suite
      return {
        [suiteName]: {
          totalRentalsApartments:
            kpiTotalRentalsForSuite?.totalRentalsApartments ?? 0,
          totalValue: this.formatCurrency(
            Number(kpiRevenueForSuite?.totalValue ?? 0),
          ),
          totalTicketAverage: this.formatCurrency(
            Number(kpiTicketAverageForSuite?.totalTicketAverage ?? 0),
          ),
          giro: Number(kpiGiroForSuite?.giro ?? 0).toFixed(2), // Exibindo como um número com 2 casas decimais
          revpar: this.formatCurrency(Number(kpiRevparForSuite?.revpar ?? 0)),
          trevpar: this.formatCurrency(
            Number(kpiTrevparForSuite?.trevpar ?? 0),
          ),
          averageOccupationTime:
            kpiAlosForSuite?.averageOccupationTime ?? '00:00:00',
          occupancyRate: this.formatPercentage(
            Number(kpiOccupancyRateForSuite?.occupancyRate ?? 0),
          ),
        },
      };
    });

    const TotalResult = {
      totalAllRentalsApartments:
        KpiTotalRentals[0]?.totalAllRentalsApartments || 0,
      totalAllValue: this.formatCurrency(
        Number(KpiRevenue[0]?.totalAllValue ?? 0),
      ),
      totalAllTicketAverage: this.formatCurrency(
        Number(KpiTicketAverage[0]?.totalAllTicketAverage) || 0,
      ),
      totalGiro: Number(KpiGiro[0]?.totalGiro ?? 0).toFixed(2),
      totalRevpar: this.formatCurrency(Number(KpiRevpar[0]?.totalRevpar) || 0),
      totalTrevpar: this.formatCurrency(
        Number(KpiTrevpar[0]?.totalTrevpar) || 0,
      ),
      totalAverageOccupationTime:
        KpiAlos[0]?.totalAverageOccupationTime ?? '00:00:00',
      totalOccupancyRate: this.formatPercentage(
        Number(KpiOccupancyRate[0]?.totalOccupancyRate ?? 0),
      ),
    };

    // Define os tipos de aluguel esperados
    const expectedRentalTypes = [
      'THREE_HOURS',
      'SIX_HOURS',
      'TWELVE_HOURS',
      'DAY_USE',
      'DAILY',
      'OVERNIGHT',
    ];

    // Função para formatar a data para ano e mês
    function formatYearMonth(date) {
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // getMonth() é zero-based
      return `${month.toString().padStart(2, '0')}/${year}`;
    }

    // Montando o retorno de BillingRentalType
    const billingRentalType = KpiRevenueByRentalType.reduce((acc, curr) => {
      const createdDate = curr.createdDate;
      const rentalType = curr.rentalType;
      const totalValue = Number(curr.totalValue); // Certifique-se de que é um número

      // Determina a chave de agrupamento com base no período
      let key;
      if (period === 'LAST_6_M') {
        key = formatYearMonth(new Date(createdDate)); // Agrupa por mês/ano
      } else {
        key = new Date(createdDate).toLocaleDateString('pt-BR'); // Agrupa por dia
      }

      if (!acc[key]) {
        acc[key] = {};
      }

      // Apenas atribui o valor sem acumular se for 'LAST_6_M'
      if (period === 'LAST_6_M') {
        acc[key][rentalType] = { totalValue }; // Usa o valor diretamente do banco
      } else {
        if (!acc[key][rentalType]) {
          acc[key][rentalType] = { totalValue: 0 };
        }
        acc[key][rentalType].totalValue += totalValue; // Continua acumulando para outros períodos
      }

      return acc;
    }, {});

    // Construindo a tabela de dados de faturamento por tipo de aluguel
    const dataTableBillingRentalType = Object.keys(billingRentalType).map(
      (key) => {
        const rentalTypeData = expectedRentalTypes.map((rentalType) => {
          const totalValue =
            billingRentalType[key][rentalType]?.totalValue || 0;
          return {
            [rentalType]: {
              totalValue: this.formatCurrency(totalValue),
            },
          };
        });

        return {
          [key]: rentalTypeData,
        };
      },
    );

    let formattedRevenueData; // Declarando a variável fora do bloco condicional

    // Obter o dia atual no fuso horário da aplicação
    const now = moment(); // Defina o fuso horário da aplicação

    const currentHour = now.hour(); // Obter a hora atual
    const currentDayOfMonth = currentHour ? now.date() - 1 : now.date();

    console.log('dia de hoje:', currentDayOfMonth);

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiRevenueByPeriod para incluir apenas os registros do dia atual nos últimos 6 meses
      const filteredKpiRevenueByPeriod = KpiRevenueByPeriod.filter((record) => {
        const recordDate = moment.utc(record.createdDate); // Converta para UTC
        const recordDay = recordDate.tz('America/Sao_Paulo').date(); // Converta para o fuso horário da aplicação

        // Verifica se a data está dentro do intervalo de 6 meses e se o dia do mês é igual ao dia atual
        return (
          recordDate.isBetween(
            now.clone().subtract(6, 'months').startOf('month').utc(),
            now.clone().endOf('month').utc(),
            null,
            '[]',
          ) && recordDay === currentDayOfMonth
        );
      });

      // Agrupar os dados por data
      const revenueByDate = filteredKpiRevenueByPeriod.reduce((acc, curr) => {
        const dateKey = moment
          .utc(curr.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'); // Formato desejado
        const totalValue = Number(curr.totalValue);

        if (!acc[dateKey]) {
          acc[dateKey] = { totalValue: 0 };
        }

        acc[dateKey].totalValue += totalValue;

        return acc;
      }, {});

      // Formatar os dados no formato desejado
      formattedRevenueData = Object.keys(revenueByDate).map((date) => ({
        [date]: {
          totalValue: this.formatCurrency(revenueByDate[date].totalValue),
        },
      }));
    } else {
      // Se o period não for LAST_6_M, não aplica o filtro, apenas agrupa e formata normalmente
      const revenueByDate = KpiRevenueByPeriod.reduce((acc, curr) => {
        const dateKey = moment
          .utc(curr.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'); // Formato desejado
        const totalValue = Number(curr.totalValue);

        if (!acc[dateKey]) {
          acc[dateKey] = { totalValue: 0 };
        }

        acc[dateKey].totalValue += totalValue;

        return acc;
      }, {});

      // Formatar os dados no formato desejado
      formattedRevenueData = Object.keys(revenueByDate).map((date) => ({
        [date]: {
          totalValue: this.formatCurrency(revenueByDate[date].totalValue),
        },
      }));
    }

    const revenueBySuiteCategory = suiteCategory.map((suite) => {
      const suiteName = suite.description;

      // Filtrar os valores de KPI específicos para a suite atual
      const kpiRevenueForSuite = KpiRevenue.find(
        (kpi) => kpi.suiteCategoryName === suiteName,
      );

      // Montar o objeto para cada suite
      return {
        [suiteName]: {
          totalValue: this.formatCurrency(
            Number(kpiRevenueForSuite?.totalValue ?? 0),
          ),
        },
      };
    });

    // Declarar formattedTotalRentalsData fora do escopo do if
    let formattedTotalRentalsData;

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiTotalRentalsByPeriod para incluir apenas os registros do dia atual nos últimos 6 meses
      const filteredKpiTotalRentalsByPeriod = KpiTotalRentalsByPeriod.filter(
        (record) => {
          const recordDate = moment(new Date(record.createdDate));
          const recordDay = recordDate.date();

          // Verifica se a data está dentro do intervalo de 6 meses e se o dia do mês é igual ao dia atual
          return (
            recordDate.isBetween(
              now.clone().subtract(6, 'months').startOf('month'),
              now.clone().endOf('month'),
              null,
              '[]',
            ) && recordDay === currentDayOfMonth
          );
        },
      );

      // Agrupar os dados por data
      const totalRentalsByDate = filteredKpiTotalRentalsByPeriod.reduce(
        (acc, curr) => {
          const dateKey = moment(new Date(curr.createdDate)).format(
            'DD/MM/YYYY',
          ); // Formato desejado
          const totalAllRentalsApartments = Number(
            curr.totalAllRentalsApartments,
          );

          if (!acc[dateKey]) {
            acc[dateKey] = { totalAllRentalsApartments: 0 }; // Inicializa o total para a data
          }

          // Acumula o total de apartamentos alugados
          acc[dateKey].totalAllRentalsApartments += totalAllRentalsApartments;

          return acc;
        },
        {},
      );

      // Formatar os dados no formato desejado
      formattedTotalRentalsData = Object.keys(totalRentalsByDate).map(
        (date) => ({
          [date]: {
            totalAllRentalsApartments:
              totalRentalsByDate[date].totalAllRentalsApartments,
          },
        }),
      );
    } else {
      // Caso contrário, apenas agrupar e formatar os dados sem filtro
      const totalRentalsByDate = KpiTotalRentalsByPeriod.reduce((acc, curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY'); // Formato desejado
        const totalAllRentalsApartments = Number(
          curr.totalAllRentalsApartments,
        );

        if (!acc[dateKey]) {
          acc[dateKey] = { totalAllRentalsApartments: 0 }; // Inicializa o total para a data
        }

        // Acumula o total de apartamentos alugados
        acc[dateKey].totalAllRentalsApartments += totalAllRentalsApartments;

        return acc;
      }, {});

      // Formatar os dados no formato desejado
      formattedTotalRentalsData = Object.keys(totalRentalsByDate).map(
        (date) => ({
          [date]: {
            totalAllRentalsApartments:
              totalRentalsByDate[date].totalAllRentalsApartments,
          },
        }),
      );
    }

    // Declarar formattedRevparData fora do escopo do if
    let formattedRevparData;

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiRevparByPeriod para incluir apenas os registros do dia atual nos últimos 6 meses
      const filteredKpiRevparByPeriod = KpiRevparByPeriod.filter((record) => {
        const recordDate = moment(new Date(record.createdDate));
        const recordDay = recordDate.date();

        // Verifica se a data está dentro do intervalo de 6 meses e se o dia do mês é igual ao dia atual
        return (
          recordDate.isBetween(
            now.clone().subtract(6, 'months').startOf('month'),
            now.clone().endOf('month'),
            null,
            '[]',
          ) && recordDay === currentDayOfMonth
        );
      });

      // Agrupar os dados por data
      const revparByDate = filteredKpiRevparByPeriod.reduce((acc, curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY'); // Formato desejado
        const totalRevpar = Number(curr.totalRevpar);

        if (!acc[dateKey]) {
          acc[dateKey] = { totalRevpar: 0 }; // Inicializa o total para a data
        }

        // Acumula o total do RevPAR
        acc[dateKey].totalRevpar += totalRevpar;

        return acc;
      }, {});

      // Formatar os dados no formato desejado
      formattedRevparData = Object.keys(revparByDate).map((date) => ({
        [date]: {
          totalRevpar: this.formatCurrency(revparByDate[date].totalRevpar),
        },
      }));
    } else {
      // Caso contrário, apenas agrupar e formatar os dados sem filtro
      const revparByDate = KpiRevparByPeriod.reduce((acc, curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY'); // Formato desejado
        const totalRevpar = Number(curr.totalRevpar);

        if (!acc[dateKey]) {
          acc[dateKey] = { totalRevpar: 0 }; // Inicializa o total para a data
        }

        // Acumula o total do RevPAR
        acc[dateKey].totalRevpar += totalRevpar;

        return acc;
      }, {});

      // Formatar os dados no formato desejado
      formattedRevparData = Object.keys(revparByDate).map((date) => ({
        [date]: {
          totalRevpar: this.formatCurrency(revparByDate[date].totalRevpar),
        },
      }));
    }

    // Declarar formattedTicketAverageData fora do escopo do if
    let formattedTicketAverageData;

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiTicketAverageByPeriod para incluir apenas os registros do dia atual nos últimos 6 meses
      const filteredKpiTicketAverageByPeriod = KpiTicketAverageByPeriod.filter(
        (record) => {
          const recordDate = moment(new Date(record.createdDate));
          const recordDay = recordDate.date();

          // Verifica se a data está dentro do intervalo de 6 meses e se o dia do mês é igual ao dia atual
          return (
            recordDate.isBetween(
              now.clone().subtract(6, 'months').startOf('month'),
              now.clone().endOf('month'),
              null,
              '[]',
            ) && recordDay === currentDayOfMonth
          );
        },
      );

      // Agrupar os dados por data
      const ticketAverageByDate = filteredKpiTicketAverageByPeriod.reduce(
        (acc, curr) => {
          const dateKey = moment(new Date(curr.createdDate)).format(
            'DD/MM/YYYY',
          ); // Formato desejado
          const totalAllTicketAverage = Number(curr.totalAllTicketAverage);

          if (!acc[dateKey]) {
            acc[dateKey] = { totalAllTicketAverage: 0 }; // Inicializa o total para a data
          }

          // Acumula o total do Ticket Average
          acc[dateKey].totalAllTicketAverage += totalAllTicketAverage;

          return acc;
        },
        {},
      );

      // Formatar os dados no formato desejado
      formattedTicketAverageData = Object.keys(ticketAverageByDate).map(
        (date) => ({
          [date]: {
            totalAllTicketAverage: this.formatCurrency(
              ticketAverageByDate[date].totalAllTicketAverage,
            ),
          },
        }),
      );
    } else {
      // Caso contrário, apenas agrupar e formatar os dados sem filtro
      const ticketAverageByDate = KpiTicketAverageByPeriod.reduce(
        (acc, curr) => {
          const dateKey = moment(new Date(curr.createdDate)).format(
            'DD/MM/YYYY',
          ); // Formato desejado
          const totalAllTicketAverage = Number(curr.totalAllTicketAverage);

          if (!acc[dateKey]) {
            acc[dateKey] = { totalAllTicketAverage: 0 }; // Inicializa o total para a data
          }

          // Acumula o total do Ticket Average
          acc[dateKey].totalAllTicketAverage += totalAllTicketAverage;

          return acc;
        },
        {},
      );

      // Formatar os dados no formato desejado
      formattedTicketAverageData = Object.keys(ticketAverageByDate).map(
        (date) => ({
          [date]: {
            totalAllTicketAverage: this.formatCurrency(
              ticketAverageByDate[date].totalAllTicketAverage,
            ),
          },
        }),
      );
    }

    // Declarar formattedTrevparData fora do escopo do if
    let formattedTrevparData;

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiTrevparByPeriod para incluir apenas os registros do dia atual nos últimos 6 meses
      const filteredKpiTrevparByPeriod = KpiTrevparByPeriod.filter((record) => {
        const recordDate = moment(new Date(record.createdDate));
        const recordDay = recordDate.date();

        // Verifica se a data está dentro do intervalo de 6 meses e se o dia do mês é igual ao dia atual
        return (
          recordDate.isBetween(
            now.clone().subtract(6, 'months').startOf('month'),
            now.clone().endOf('month'),
            null,
            '[]',
          ) && recordDay === currentDayOfMonth
        );
      });

      // Formatar os dados no formato desejado sem acumular
      formattedTrevparData = filteredKpiTrevparByPeriod.map((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY'); // Formato desejado
        const totalTrevpar = Number(curr.totalTrevpar);

        return {
          [dateKey]: {
            totalTrevpar: this.formatCurrency(totalTrevpar),
          },
        };
      });
    } else {
      // Caso contrário, apenas formatar os dados sem filtro
      formattedTrevparData = KpiTrevparByPeriod.map((curr) => {
        const dateKey = moment(new Date(curr.createdDate)).format('DD/MM/YYYY'); // Formato desejado
        const totalTrevpar = Number(curr.totalTrevpar);

        return {
          [dateKey]: {
            totalTrevpar: this.formatCurrency(totalTrevpar),
          },
        };
      });
    }

    // Declarar formattedOccupancyRateData fora do escopo do if
    let formattedOccupancyRateData;

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiOccupancyRateByPeriod para incluir apenas os registros do dia atual nos últimos 6 meses
      const filteredKpiOccupancyRateByPeriod = KpiOccupancyRateByPeriod.filter(
        (record) => {
          const recordDate = moment(new Date(record.createdDate));
          const recordDay = recordDate.date();

          // Verifica se a data está dentro do intervalo de 6 meses e se o dia do mês é igual ao dia atual
          return (
            recordDate.isBetween(
              now.clone().subtract(6, 'months').startOf('month'),
              now.clone().endOf('month'),
              null,
              '[]',
            ) && recordDay === currentDayOfMonth
          );
        },
      );

      // Agrupar os dados por data
      const occupancyRateByDate = filteredKpiOccupancyRateByPeriod.reduce(
        (acc, curr) => {
          const dateKey = moment(new Date(curr.createdDate)).format(
            'DD/MM/YYYY',
          ); // Formato desejado
          const totalOccupancyRate = Number(curr.totalOccupancyRate);

          if (!acc[dateKey]) {
            acc[dateKey] = { totalOccupancyRate: 0 }; // Inicializa o total para a data
          }

          // Acumula o total de occupancy rate
          acc[dateKey].totalOccupancyRate += totalOccupancyRate;

          return acc;
        },
        {},
      );

      // Formatar os dados no formato desejado
      formattedOccupancyRateData = Object.keys(occupancyRateByDate).map(
        (date) => ({
          [date]: {
            totalOccupancyRate: this.formatPercentage(
              occupancyRateByDate[date].totalOccupancyRate,
            ),
          },
        }),
      );
    } else {
      // Caso contrário, apenas formatar os dados sem filtro
      const occupancyRateByDate = KpiOccupancyRateByPeriod.reduce(
        (acc, curr) => {
          const dateKey = moment(new Date(curr.createdDate)).format(
            'DD/MM/YYYY',
          ); // Formato desejado
          const totalOccupancyRate = Number(curr.totalOccupancyRate);

          if (!acc[dateKey]) {
            acc[dateKey] = { totalOccupancyRate: 0 }; // Inicializa o total para a data
          }

          // Acumula o total de occupancy rate
          acc[dateKey].totalOccupancyRate += totalOccupancyRate;

          return acc;
        },
        {},
      );

      // Formatar os dados no formato desejado
      formattedOccupancyRateData = Object.keys(occupancyRateByDate).map(
        (date) => ({
          [date]: {
            totalOccupancyRate: this.formatPercentage(
              occupancyRateByDate[date].totalOccupancyRate,
            ),
          },
        }),
      );
    }

    // Declarar formattedOccupancyRateBySuiteCategory fora do escopo do if
    let formattedOccupancyRateBySuiteCategory;

    // Verificar se o period é LAST_6_M
    if (period === 'LAST_6_M') {
      // Filtrar os dados do KpiOccupancyRateBySuiteCategory para incluir apenas os registros do dia atual nos últimos 6 meses
      const filteredKpiOccupancyRateBySuiteCategory =
        KpiOccupancyRateBySuiteCategory.filter((record) => {
          const recordDate = moment(new Date(record.createdDate));
          const recordDay = recordDate.date();

          // Verifica se a data está dentro do intervalo de 6 meses e se o dia do mês é igual ao dia atual
          return (
            recordDate.isBetween(
              now.clone().subtract(6, 'months').startOf('month'),
              now.clone().endOf('month'),
              null,
              '[]',
            ) && recordDay === currentDayOfMonth
          );
        });

      // Agrupar os dados por data e por categoria de suíte
      const occupancyRateBySuiteCategory =
        filteredKpiOccupancyRateBySuiteCategory.reduce((acc, curr) => {
          const dateKey = moment(new Date(curr.createdDate)).format(
            'DD/MM/YYYY',
          ); // Formato desejado
          const suiteCategoryName = curr.suiteCategoryName;
          const occupancyRate = this.formatPercentage(
            Number(curr.occupancyRate),
          );

          // Se a data ainda não existir no acumulador, inicializa
          if (!acc[dateKey]) {
            acc[dateKey] = {};
          }

          // Adiciona a taxa de ocupação para a categoria de suíte
          acc[dateKey][suiteCategoryName] = {
            occupancyRate: occupancyRate,
          };

          return acc;
        }, {});

      // Formatar o resultado no formato desejado
      formattedOccupancyRateBySuiteCategory = Object.keys(
        occupancyRateBySuiteCategory,
      ).map((date) => ({
        [date]: occupancyRateBySuiteCategory[date],
      }));
    } else {
      // Caso contrário, apenas formatar os dados sem filtro
      const occupancyRateBySuiteCategory =
        KpiOccupancyRateBySuiteCategory.reduce((acc, curr) => {
          const dateKey = moment(new Date(curr.createdDate)).format(
            'DD/MM/YYYY',
          ); // Formato desejado
          const suiteCategoryName = curr.suiteCategoryName;
          const occupancyRate = this.formatPercentage(
            Number(curr.occupancyRate),
          );

          // Se a data ainda não existir no acumulador, inicializa
          if (!acc[dateKey]) {
            acc[dateKey] = {};
          }

          // Adiciona a taxa de ocupação para a categoria de suíte
          acc[dateKey][suiteCategoryName] = {
            occupancyRate: occupancyRate,
          };

          return acc;
        }, {});

      // Formatar o resultado no formato desejado
      formattedOccupancyRateBySuiteCategory = Object.keys(
        occupancyRateBySuiteCategory,
      ).map((date) => ({
        [date]: occupancyRateBySuiteCategory[date],
      }));
    }

    // Agrupar os dados por categoria de suíte e por dia da semana
    const occupancyRateByWeek = KpiOccupancyRateByWeek.reduce((acc, curr) => {
      const createdDate = new Date(curr.createdDate);
      const dayOfWeek = createdDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
      });
      const suiteCategoryName = curr.suiteCategoryName;

      // Se a categoria de suíte ainda não existir no acumulador, inicializa
      if (!acc[suiteCategoryName]) {
        acc[suiteCategoryName] = {};
      }

      // Se o dia da semana ainda não existir para essa categoria, inicializa
      if (!acc[suiteCategoryName][dayOfWeek]) {
        acc[suiteCategoryName][dayOfWeek] = {
          occupancyRate: this.formatPercentage(Number(0)),
          totalOccupancyRate: this.formatPercentage(
            Number(curr.totalOccupancyRate),
          ),
        };
      }

      // Atualiza o occupancyRate para o dia da semana
      acc[suiteCategoryName][dayOfWeek].occupancyRate = this.formatPercentage(
        Number(curr.occupancyRate),
      );

      return acc;
    }, {});

    // Converte o objeto em um array de objetos
    const occupancyRateByWeekArray = Object.entries(occupancyRateByWeek).map(
      ([key, value]) => ({
        [key]: value,
      }),
    );

    // Agrupar os dados por categoria de suíte e por dia da semana
    const giroByWeek = KpiGiroByWeek.reduce((acc, curr) => {
      const createdDate = new Date(curr.createdDate);
      const dayOfWeek = createdDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
      });
      const suiteCategoryName = curr.suiteCategoryName;

      // Se a categoria de suíte ainda não existir no acumulador, inicializa
      if (!acc[suiteCategoryName]) {
        acc[suiteCategoryName] = {};
      }

      // Se o dia da semana ainda não existir para essa categoria, inicializa
      if (!acc[suiteCategoryName][dayOfWeek]) {
        acc[suiteCategoryName][dayOfWeek] = {
          giro: new Prisma.Decimal(0),
          totalGiro: curr.totalGiro, // Adiciona o totalGiro
        };
      }

      // Atualiza o giro para o dia da semana
      acc[suiteCategoryName][dayOfWeek].giro = curr.giro;

      return acc;
    }, {});

    // Converte o objeto em um array de objetos
    const giroByWeekArray = Object.entries(giroByWeek).map(([key, value]) => ({
      [key]: value,
    }));

    return {
      Company: 'Lush Ipiranga',
      BigNumbers: [bigNumbers],
      BillingRentalType: dataTableBillingRentalType,
      RevenueByDate: formattedRevenueData,
      RevenueBySuiteCategory: revenueBySuiteCategory,
      RentalsByDate: formattedTotalRentalsData,
      RevparByDate: formattedRevparData,
      TicketAverageByDate: formattedTicketAverageData,
      TrevparByDate: formattedTrevparData,
      OccupancyRateByDate: formattedOccupancyRateData,
      OccupancyRateBySuiteCategory: formattedOccupancyRateBySuiteCategory,
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

  private async fetchKpiData(startDate: Date, endDate: Date) {
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
          description: {
            in: [
              'LUSH',
              'LUSH POP',
              'LUSH HIDRO',
              'LUSH LOUNGE',
              'LUSH SPA',
              'LUSH CINE',
              'LUSH SPLASH',
              'LUSH SPA SPLASH',
              'CASA LUSH',
            ],
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
            not: null, // Excluir registros onde endDate é null
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
              not: null, // Excluir registros onde endDate é null
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
          typePriceSale: {
            not: null,
          },
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

  async calculateKpisByDateRange(startDate: Date, endDate: Date) {
    console.log('startDate:', startDate);
    console.log('endDate:', endDate);

    const [
      allRentalApartments,
      suiteCategories,
      cleanings,
      blockedMaintenanceDefects,
      stockOutItems,
    ] = await this.fetchKpiData(startDate, endDate);

    let totalSaleDirect = stockOutItems.reduce(
      (totalSaleDirect, stockOutItem) => {
        const stockOut = stockOutItem.stockOuts;

        if (stockOut && stockOut.saleDirect) {
          const saleDirects = Array.isArray(stockOut.saleDirect)
            ? stockOut.saleDirect
            : [stockOut.saleDirect];
          const discountSale = stockOut.sale?.discount
            ? new Prisma.Decimal(stockOut.sale.discount)
            : new Prisma.Decimal(0);

          saleDirects.forEach((saleDirect) => {
            if (
              saleDirect &&
              stockOutItem.stockOutId === saleDirect.stockOutId
            ) {
              const itemTotal = new Prisma.Decimal(
                stockOutItem.priceSale,
              ).times(new Prisma.Decimal(stockOutItem.quantity));
              totalSaleDirect = totalSaleDirect.plus(
                itemTotal.minus(discountSale),
              );
            }
          });
        }

        return totalSaleDirect; // Retorna o total acumulado
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

    const kpisData = [];
    const daysTimeInSeconds = (endDate.getTime() - startDate.getTime()) / 1000;
    const categoryTotalsMap = suiteCategories.reduce((acc, suiteCategory) => {
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
    }, {});

    // Cálculo do stockOutMap
    const stockOutIds = allRentalApartments
      .map((a) => a.saleLease?.stockOutId)
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

    const stockOutMap: { [key: string]: Prisma.Decimal } = stockOutData.reduce(
      (map, stockOut) => {
        const priceSale = stockOut.stockOutItem
          .reduce(
            (acc, item) =>
              acc.plus(new Prisma.Decimal(item.priceSale).times(item.quantity)),
            new Prisma.Decimal(0),
          )
          .minus(stockOut.sale?.discount || new Prisma.Decimal(0));
        map[stockOut.id] = priceSale;
        return map;
      },
      {},
    );

    const rentalTypeMap = {
      THREE_HOURS: RentalTypeEnum.THREE_HOURS,
      SIX_HOURS: RentalTypeEnum.SIX_HOURS,
      TWELVE_HOURS: RentalTypeEnum.TWELVE_HOURS,
      DAY_USE: RentalTypeEnum.DAY_USE,
      OVERNIGHT: RentalTypeEnum.OVERNIGHT,
      DAILY: RentalTypeEnum.DAILY,
    };

    const results: { [key: string]: any } = {};
    const trevparByDate: { [key: string]: any }[] = [];
    const rentalsByDate: { [key: string]: any }[] = [];
    const revparByDate: { [key: string]: any }[] = [];
    const ticketAverageByDate: { [key: string]: any }[] = [];
    const occupancyRateByDate: { [key: string]: any }[] = [];
    const occupancyRateBySuiteCategory: { [key: string]: any }[] = [];
    const occupancyRateByWeekArray: any[] = [];
    const dayCountMap: { [key: string]: number } = {};
    const giroByWeekArray: any[] = [];
    const timezone = 'America/Sao_Paulo';

    let currentDate = new Date(startDate);
    currentDate.setUTCHours(6, 0, 0, 0); // Ajuste de hora para o início do dia

    // Iterar sobre cada dia entre startDate e endDate
    while (currentDate <= endDate) {
      let nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1); // Avança para o próximo dia
      nextDate.setUTCHours(5, 59, 59, 999); // Ajuste de hora para o início do dia

      const currentRentalApartments = allRentalApartments.filter(
        (ra) => ra.checkIn >= currentDate && ra.checkIn < nextDate,
      );

      const totalsMap: {
        [rentalType: string]: {
          totalValue: Prisma.Decimal;
        };
      } = {};

      let totalOccupiedTime = 0; // Tempo ocupado
      let totalUnavailableTime = 0; // Tempo indisponível por manutenção e limpeza

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
          ? stockOutMap[rentalApartment.saleLease.stockOutId] ||
            new Prisma.Decimal(0)
          : new Prisma.Decimal(0);

        totalsMap[rentalType].totalValue = totalsMap[
          rentalType
        ].totalValue.plus(permanenceValueLiquid.plus(priceSale));
      }

      // Cálculo do tempo indisponível por manutenção e limpeza
      const unavailableTimeMap = new Map(); // Mapa para evitar duplicação

      suiteCategories.forEach((suiteCategory) => {
        suiteCategory.suites.forEach((suite) => {
          // Lógica para calcular o tempo de limpeza
          const suiteCleanings = cleanings.filter(
            (cleaning) => cleaning.suiteState.suiteId === suite.id,
          );

          suiteCleanings.forEach((cleaning) => {
            const cleaningStart = new Date(cleaning.startDate);
            const cleaningEnd = new Date(cleaning.endDate);

            // Verificar se a limpeza está dentro do período atual
            if (cleaningEnd > currentDate && cleaningStart < nextDate) {
              const overlapStart = Math.max(
                cleaningStart.getTime(),
                currentDate.getTime(),
              );
              const overlapEnd = Math.min(
                cleaningEnd.getTime(),
                nextDate.getTime(),
              );

              const cleaningTimeInSeconds = (overlapEnd - overlapStart) / 1000;
              // Usar um mapa para evitar contagem duplicada
              const cleaningKey = `${suite.id}-${overlapStart}-${overlapEnd}`;
              if (!unavailableTimeMap.has(cleaningKey)) {
                totalUnavailableTime += cleaningTimeInSeconds;
                unavailableTimeMap.set(cleaningKey, cleaningTimeInSeconds);
              }
            }
          });

          // Lógica para calcular o tempo de manutenção e defeitos
          const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
            (blockedMaintenanceDefect) =>
              blockedMaintenanceDefect.defect.suite.id === suite.id &&
              blockedMaintenanceDefect.suiteState.suite.id === suite.id,
          );

          suiteDefectsAndMaintenances.forEach((blockedMaintenanceDefect) => {
            const defectStart = new Date(
              blockedMaintenanceDefect.defect.startDate,
            );
            const defectEnd = new Date(blockedMaintenanceDefect.defect.endDate);

            // Verificar se a manutenção está dentro do período atual
            if (defectEnd > currentDate && defectStart < nextDate) {
              const overlapStart = Math.max(
                defectStart.getTime(),
                currentDate.getTime(),
              );
              const overlapEnd = Math.min(
                defectEnd.getTime(),
                nextDate.getTime(),
              );

              const defectTimeInSeconds = (overlapEnd - overlapStart) / 1000;

              // Usar um mapa para evitar contagem duplicada
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
        (acc, category) => acc + category.suites.length,
        0,
      );
      const daysTimeInSeconds =
        (nextDate.getTime() - currentDate.getTime()) / 1000;
      let availableTimeInSeconds =
        daysTimeInSeconds * totalSuitesCounts - totalUnavailableTime;

      if (availableTimeInSeconds < 0) {
        availableTimeInSeconds = 0;
      }

      // Calcular a taxa de ocupação
      const occupancyRateDecimal =
        availableTimeInSeconds > 0
          ? totalOccupiedTime / availableTimeInSeconds
          : 0;

      // Formatar a data para YYYY-MM-DD
      const dateKey = new Intl.DateTimeFormat('pt-BR').format(currentDate);

      // Adicionar a taxa de ocupação ao array
      occupancyRateByDate.push({
        [dateKey]: {
          totalOccupancyRate: this.formatPercentageUpdate(occupancyRateDecimal),
        },
      });

      const dateToOccupancyRates: { [key: string]: any } = {};

      // Cálculo da taxa de ocupação por categoria de suíte
      suiteCategories.forEach((suiteCategory) => {
        let categoryOccupiedTime = 0; // Tempo ocupado para a categoria
        const unavailableTimeMap = new Map(); // Mapa para evitar duplicação

        suiteCategory.suites.forEach((suite) => {
          const suiteRentals = currentRentalApartments.filter(
            (ra) => ra.suiteStates.suite.id === suite.id,
          );

          // Calcular o tempo ocupado para a categoria
          suiteRentals.forEach((rentalApartment) => {
            const occupiedTimeInSeconds =
              (new Date(rentalApartment.checkOut).getTime() -
                new Date(rentalApartment.checkIn).getTime()) /
              1000;
            categoryOccupiedTime += occupiedTimeInSeconds;
          });

          // Cálculo do tempo indisponível por manutenção e limpeza para a categoria
          const suiteCleanings = cleanings.filter(
            (cleaning) => cleaning.suiteState.suiteId === suite.id,
          );

          suiteCleanings.forEach((cleaning) => {
            const cleaningStart = new Date(cleaning.startDate);
            const cleaningEnd = new Date(cleaning.endDate);

            // Verificar se a limpeza está dentro do período atual
            if (cleaningEnd > currentDate && cleaningStart < nextDate) {
              const overlapStart = Math.max(
                cleaningStart.getTime(),
                currentDate.getTime(),
              );
              const overlapEnd = Math.min(
                cleaningEnd.getTime(),
                nextDate.getTime(),
              );

              const cleaningTimeInSeconds = (overlapEnd - overlapStart) / 1000;

              // Usar um mapa para evitar contagem duplicada
              const cleaningKey = `${suite.id}-${overlapStart}-${overlapEnd}`;
              if (!unavailableTimeMap.has(cleaningKey)) {
                unavailableTimeMap.set(cleaningKey, cleaningTimeInSeconds);
              }
            }
          });

          // Lógica para calcular o tempo de manutenção e defeitos para a categoria
          const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
            (blockedMaintenanceDefect) =>
              blockedMaintenanceDefect.defect.suite.id === suite.id &&
              blockedMaintenanceDefect.suiteState.suite.id === suite.id,
          );

          suiteDefectsAndMaintenances.forEach((blockedMaintenanceDefect) => {
            const defectStart = new Date(
              blockedMaintenanceDefect.defect.startDate,
            );
            const defectEnd = new Date(blockedMaintenanceDefect.defect.endDate);

            // Verificar se a manutenção está dentro do período atual
            if (defectEnd > currentDate && defectStart < nextDate) {
              const overlapStart = Math.max(
                defectStart.getTime(),
                currentDate.getTime(),
              );
              const overlapEnd = Math.min(
                defectEnd.getTime(),
                nextDate.getTime(),
              );

              const defectTimeInSeconds = (overlapEnd - overlapStart) / 1000;

              // Usar um mapa para evitar contagem duplicada
              const defectKey = `${suite.id}-${overlapStart}-${overlapEnd}`;
              if (!unavailableTimeMap.has(defectKey)) {
                unavailableTimeMap.set(defectKey, defectTimeInSeconds);
              }
            }
          });
        });

        // Calcular o tempo indisponível total para a categoria
        const categoryUnavailableTime = Array.from(
          unavailableTimeMap.values(),
        ).reduce((acc, time) => acc + time, 0);

        const totalCategorySuitesCounts = suiteCategory.suites.length;
        let categoryAvailableTimeInSeconds =
          daysTimeInSeconds * totalCategorySuitesCounts -
          categoryUnavailableTime;

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
          occupancyRate: this.formatPercentageUpdate(
            categoryOccupancyRateDecimal,
          ),
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
      const periodDays = 1; // Como estamos calculando por dia, o período é 1 dia
      const giro = totalRentalsForDate / (totalSuites * periodDays);
      const ticketAverage =
        totalRentalsForDate > 0
          ? totalRevenueForDate.dividedBy(totalRentalsForDate).toNumber()
          : 0;

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

      suiteCategories.forEach((suiteCategory) => {
        const suitesInCategoryCount = suiteCategory.suites.length;
        totalSuitesCount += suitesInCategoryCount;

        const rentalApartmentsInCategory = currentRentalApartments.filter(
          (rentalApartment) =>
            rentalApartment.suiteStates.suite.suiteCategoryId ===
            suiteCategory.id,
        );

        rentalApartmentsInCategory.forEach((rentalApartment) => {
          totalRevenue = totalRevenue.plus(
            rentalApartment.permanenceValueLiquid
              ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
              : new Prisma.Decimal(0),
          );
        });
      });

      // Calcular o RevPAR
      const revpar =
        totalSuitesCount > 0
          ? totalRevenue.dividedBy(totalSuitesCount).toNumber()
          : 0;

      // Adiciona o RevPAR ao array
      revparByDate.push({
        [dateKey]: {
          totalRevpar: this.formatCurrency(revpar),
        },
      });

      // Formata os resultados para o dia atual
      results[dateKey] = Object.keys(rentalTypeMap).map((rentalType) => {
        const totalValue = totalsMap[rentalType]
          ? totalsMap[rentalType].totalValue.toNumber()
          : 0; // Se não existir, considera como R$ 0,00

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
    const occupancyByCategoryAndDay: { [key: string]: any } = {};
    suiteCategories.forEach((suiteCategory) => {
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
    allRentalApartments.forEach((occupiedSuite) => {
      const suiteCategoryDescription =
        occupiedSuite.suiteStates?.suite?.suiteCategories?.description;
      const dayOfOccupation = moment.tz(occupiedSuite.checkIn, timezone);
      const dayOfWeek = dayOfOccupation.format('dddd');

      if (
        occupancyByCategoryAndDay[suiteCategoryDescription] &&
        occupancyByCategoryAndDay[suiteCategoryDescription][dayOfWeek]
      ) {
        const occupiedTime =
          occupiedSuite.checkOut.getTime() - occupiedSuite.checkIn.getTime();
        occupancyByCategoryAndDay[suiteCategoryDescription][
          dayOfWeek
        ].totalOccupiedTime += occupiedTime;
      }
    });

    // Calcular availableTime e occupancyRate
    for (const suiteCategory of suiteCategories) {
      const suitesInCategory = suiteCategory.suites;
      const suitesInCategoryCount = suitesInCategory.length;

      for (const dayOfWeek in occupancyByCategoryAndDay[
        suiteCategory.description
      ]) {
        let unavailableTimeCleaning = 0;

        // Calcular o tempo indisponível por limpeza
        const suiteCleanings = cleanings.filter((cleaning) => {
          const cleaningDayOfWeek = moment
            .tz(cleaning.startDate, timezone)
            .format('dddd');
          return (
            cleaning.suiteState.suiteId === suitesInCategory[0].id &&
            cleaningDayOfWeek === dayOfWeek
          );
        });

        suiteCleanings.forEach((cleaning) => {
          const cleaningTimeInSeconds =
            (new Date(cleaning.endDate).getTime() -
              new Date(cleaning.startDate).getTime()) /
            1000;
          unavailableTimeCleaning += cleaningTimeInSeconds;
        });

        // Calcular o tempo indisponível por manutenção
        const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
          (blockedMaintenanceDefect) => {
            const defectDayOfWeek = moment
              .tz(blockedMaintenanceDefect.defect.startDate, timezone)
              .format('dddd');
            return (
              blockedMaintenanceDefect.defect.suite.id ===
                suitesInCategory[0].id && defectDayOfWeek === dayOfWeek
            );
          },
        );

        suiteDefectsAndMaintenances.forEach((blockedMaintenanceDefect) => {
          const startDefect = new Date(
            blockedMaintenanceDefect.defect.startDate,
          );
          const endDefect = new Date(blockedMaintenanceDefect.defect.endDate);
          const defectTimeInSeconds =
            (endDefect.getTime() - startDefect.getTime()) / 1000;
          unavailableTimeCleaning += defectTimeInSeconds;
        });

        const daysTimeInSeconds = dayCountMap[dayOfWeek] * 24 * 60 * 60;
        let availableTimeInSeconds =
          daysTimeInSeconds * suitesInCategoryCount - unavailableTimeCleaning;

        if (availableTimeInSeconds < 0) {
          availableTimeInSeconds = 0;
        }

        occupancyByCategoryAndDay[suiteCategory.description][
          dayOfWeek
        ].unavailableTime += unavailableTimeCleaning;
        occupancyByCategoryAndDay[suiteCategory.description][
          dayOfWeek
        ].availableTime += availableTimeInSeconds * 1000;

        // Calcular a taxa de ocupação
        const totalOccupiedTime =
          occupancyByCategoryAndDay[suiteCategory.description][dayOfWeek]
            .totalOccupiedTime;
        const occupancyRate =
          availableTimeInSeconds > 0
            ? (totalOccupiedTime / availableTimeInSeconds) * 100
            : 0;

        occupancyByCategoryAndDay[suiteCategory.description][
          dayOfWeek
        ].occupancyRate = occupancyRate / 1000;
      }
    }

    // Calcular totalOccupancyRate por dia da semana
    const totalOccupancyRateByDay: { [key: string]: number } = {};

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
          ? (totalOccupiedTimeAllCategories / totalAvailableTimeAllCategories) *
            100
          : 0;

      totalOccupancyRateByDay[dayOfWeek] = totalOccupancyRate;
    }

    // Preencher o occupancyRateByWeekArray com os dados calculados
    for (const suiteCategory in occupancyByCategoryAndDay) {
      const categoryData = {
        [suiteCategory]: {},
      };

      for (const dayOfWeek in occupancyByCategoryAndDay[suiteCategory]) {
        const dayData = occupancyByCategoryAndDay[suiteCategory][dayOfWeek];

        categoryData[suiteCategory][dayOfWeek.toLowerCase()] = {
          occupancyRate: this.formatPercentage(dayData.occupancyRate),
          totalOccupancyRate: this.formatPercentage(
            totalOccupancyRateByDay[dayOfWeek],
          ), // Usa a taxa total calculada
        };
      }

      occupancyRateByWeekArray.push(categoryData);
    }

    // Calcular o giro por categoria e dia da semana
    let currentDateForGiro = moment.tz(startDate, timezone);
    const endDateAdjustedForGiro = moment.tz(endDate, timezone);

    // Inicializar a estrutura de giro por categoria e dia da semana
    const giroByCategoryAndDay = {};
    suiteCategories.forEach((suiteCategory) => {
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
      const rentalsForCurrentDay = allRentalApartments.filter((rental) => {
        const checkInDate = moment.tz(rental.checkIn, timezone);
        return checkInDate.isSame(currentDateForGiro, 'day');
      });

      // Contar o número de locações por categoria
      rentalsForCurrentDay.forEach((rental) => {
        const suiteCategoryDescription =
          rental.suiteStates?.suite?.suiteCategories?.description;

        // Verificar se a descrição da categoria de suíte é válida
        if (!suiteCategoryDescription) {
          return; // Se não houver descrição, ignore este aluguel
        }

        // Incrementa o número de locações para a categoria e dia da semana
        if (giroByCategoryAndDay[suiteCategoryDescription]) {
          giroByCategoryAndDay[suiteCategoryDescription][dayOfWeek]
            .rentalsCount++;
        }
      });

      currentDateForGiro.add(1, 'day'); // Avança para o próximo dia
    }

    // Cálculo do giro por categoria e dia
    const totalRentalsByDay = {}; // Para acumular locações por dia da semana
    let allSuites = 0;

    for (const suiteCategory of suiteCategories) {
      const suitesInCategoryCount = suiteCategory.suites.length;
      allSuites += suitesInCategoryCount;

      for (const dayOfWeek in giroByCategoryAndDay[suiteCategory.description]) {
        const categoryData =
          giroByCategoryAndDay[suiteCategory.description][dayOfWeek];

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
          // Se não houver locações para o dia da semana, definir como 0
          categoryData.giroTotal = 0;
          categoryData.rentalsCount = 0; // Manter contagem de locações como 0
        }
      }
    }

    // Agora, após calcular o giro, vamos calcular o totalGiro
    for (const suiteCategory of suiteCategories) {
      for (const dayOfWeek in giroByCategoryAndDay[suiteCategory.description]) {
        const categoryData =
          giroByCategoryAndDay[suiteCategory.description][dayOfWeek];

        if (!categoryData) continue;

        // Calcular o totalGiro com base no total acumulado de locações por dia
        const totalGiro = totalRentalsByDay[dayOfWeek] / (allSuites || 1);

        // Dividir o totalGiro pela quantidade de dias da semana
        const daysCount = dayCountMap[dayOfWeek]; // Quantidade de dias da semana
        const adjustedTotalGiro = daysCount > 0 ? totalGiro / daysCount : 0;

        categoryData.totalGiro = adjustedTotalGiro;
      }
    }

    // Preencher o giroByWeekArray com os dados calculados
    for (const suiteCategory in giroByCategoryAndDay) {
      const categoryData = {
        [suiteCategory]: {},
      };

      for (const dayOfWeek in giroByCategoryAndDay[suiteCategory]) {
        const dayData = giroByCategoryAndDay[suiteCategory][dayOfWeek];

        categoryData[suiteCategory][dayOfWeek.toLowerCase()] = {
          giro: dayData.giroTotal.toFixed(2),
          totalGiro: dayData.totalGiro.toFixed(2),
        };
      }

      giroByWeekArray.push(categoryData);
    }

    const dataTableBillingRentalType = Object.entries(results).map(
      ([date, rentals]) => ({
        [date]: rentals,
      }),
    );

    // Cálculo do RevenueByDate
    const revenueByDate = [];
    currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateKey = new Intl.DateTimeFormat('pt-BR').format(currentDate);
      const allRentalApartmentsForDate = allRentalApartments.filter(
        (ra) =>
          ra.checkIn >= currentDate &&
          ra.checkIn < new Date(currentDate.getTime() + 86400000),
      );

      let totalValueForCurrentDate = new Prisma.Decimal(0);
      allRentalApartmentsForDate.forEach((rentalApartment) => {
        const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
          ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
          : new Prisma.Decimal(0);
        const priceSale = rentalApartment.saleLease?.stockOutId
          ? stockOutMap[rentalApartment.saleLease.stockOutId] ||
            new Prisma.Decimal(0)
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
          suitesInCategory.some(
            (suite) => suite.id === rentalApartment.suiteStates?.suite?.id,
          )
        ) {
          const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
            ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
            : new Prisma.Decimal(0);
          let priceSale = new Prisma.Decimal(0);

          if (rentalApartment.saleLease?.stockOutId) {
            priceSale =
              stockOutMap[rentalApartment.saleLease.stockOutId] ||
              new Prisma.Decimal(0);
          }

          totalValueForCategory = totalValueForCategory.plus(
            permanenceValueLiquid.plus(priceSale),
          );
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
          rentalApartment.suiteStates?.suite?.suiteCategoryId ===
          suiteCategory.id,
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
            (acc, item) =>
              acc.plus(
                new Prisma.Decimal(item.priceSale).times(
                  new Prisma.Decimal(item.quantity),
                ),
              ),
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
            categoryTotalsMap[suiteCategory.id].categoryTotalSale.plus(
              priceSale,
            );
          categoryTotalsMap[suiteCategory.id].categoryTotalRental =
            categoryTotalsMap[suiteCategory.id].categoryTotalRental.plus(
              permanenceValueLiquid,
            );
        }
      });

      suiteCategory.suites.forEach((suite) => {
        const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
          (blockedMaintenanceDefect) =>
            blockedMaintenanceDefect.defect.suite.id === suite.id &&
            blockedMaintenanceDefect.suiteState.suite.id === suite.id,
        );

        suiteDefectsAndMaintenances.forEach((blockedMaintenanceDefect) => {
          const startDefect = new Date(
            blockedMaintenanceDefect.defect.startDate,
          );
          const endDefect = new Date(blockedMaintenanceDefect.defect.endDate);
          const startMaintenance = new Date(
            blockedMaintenanceDefect.suiteState.startDate,
          );
          const endMaintenance = new Date(
            blockedMaintenanceDefect.suiteState.endDate,
          );

          const defectTimeInSeconds =
            (endDefect.getTime() - startDefect.getTime()) / 1000;
          const maintenanceTimeInSeconds =
            (endMaintenance.getTime() - startMaintenance.getTime()) / 1000;
          maxUnavailableTime += Math.max(
            defectTimeInSeconds,
            maintenanceTimeInSeconds,
          );
        });

        cleanings
          .filter((cleaning) => cleaning.suiteState.suiteId === suite.id)
          .forEach((cleaning) => {
            unavailableTimeCleaning +=
              (new Date(cleaning.endDate).getTime() -
                new Date(cleaning.startDate).getTime()) /
              1000;
          });
      });

      const unavailableTime = maxUnavailableTime + unavailableTimeCleaning;
      const availableTimeInSeconds =
        daysTimeInSeconds * suitesInCategoryCount - unavailableTime;

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
      totalAllValue: this.formatCurrency(
        Number(totalAllValue.plus(totalSaleDirect)),
      ),
      totalAllTicketAverage:
        totalRentals > 0
          ? this.formatCurrency(
              totalSale
                .plus(totalRental)
                .plus(totalSaleDirect)
                .dividedBy(totalRentals)
                .toNumber(),
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
            ? categoryData.categoryTotalSale
                .dividedBy(categoryData.categoryTotalRentals)
                .toNumber()
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
            totalValue: this.formatCurrency(Number(categoryData.totalValue)),
            totalTicketAverage: this.formatCurrency(totalTicketAverage),
            giro: Number(categoryData.giroTotal).toFixed(2),
            revpar: this.formatCurrency(
              categoryData.giroTotal * ticketAverageRental,
            ),
            trevpar: this.formatCurrency(
              categoryData.giroTotal * totalTicketAverage,
            ),
            averageOccupationTime: this.formatTime(
              categoryData.totalOccupiedTime / (categoryData.rentalsCount || 1),
            ),
            occupancyRate: this.formatPercentageUpdate(occupancyRateDecimal),
          },
        });
      }
    });

    const bigNumbers = {
      currentDate: {
        totalAllValue: this.formatCurrency(
          Number(totalAllValue.plus(totalSaleDirect)),
        ),
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

  private determineRentalPeriod(
    checkIn: Date,
    checkOut: Date,
    Booking: any,
  ): string {
    const occupationTimeSeconds = this.calculateOccupationTime(
      checkIn,
      checkOut,
    );

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

      // Verificação para Diária
      if (
        occupationTimeSeconds > 16 * 3600 + 15 * 60 ||
        (checkInHour <= 15 &&
          (checkOutHour > 12 || (checkOutHour === 12 && checkOutMinutes <= 15)))
      ) {
        return 'DAILY';
      }
    }

    // Caso nenhuma condição acima seja satisfeita, retorna 12 horas como padrão
    return 'TWELVE_HOURS';
  }
}

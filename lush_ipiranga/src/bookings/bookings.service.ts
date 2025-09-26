import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import * as moment from 'moment-timezone';
import {
  ChannelTypeEnum,
  PeriodEnum,
  Prisma,
  RentalTypeEnum,
} from '@client-online';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  
  constructor(private prisma: PrismaService) {}

  async findAllBookings(period: PeriodEnum) {
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
    this.logger.debug(`Date range: ${startDate} to ${endDate}`);
    this.logger.debug(`Previous date range: ${startDatePrevious} to ${endDatePrevious}`);

    // Função de filtro para LAST_6_M
    const filterByDayOfMonth = (data: any[], dayOfMonth: number) => {
      return data.filter((item: any) => {
        const createdDate = moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo');
        return createdDate.date() === dayOfMonth; // Verifica se o dia do mês é o mesmo
      });
    };

    // Consultas para buscar os dados de KPIs com base nas datas selecionadas
    const [
      BookingsRevenue,
      BookingsRevenuePreviousData,
      BookingsTotalRentals,
      BookingsTotalRentalsPreviousData,
      BookingsTicketAverage,
      BookingsTicketAveragePreviousData,
      BookingsRepresentativeness,
      BookingsRepresentativenessPreviousData,
      BookingsRevenueByPayment,
      BookingsRevenueByChannelType,
      BookingsTotalRentalsByRentalType,
      BookingsRevenueByPeriod,
      BookingsRepresentativenessByPeriod,
      BookingsTotalRentalsByPeriod,
      BookingsTotalRentalsByChannelType,
      BookingsTicketAverageByChannelType,
      BookingsRepresentativenessByChannelType,
      BookingsRevenueByChannelTypeEcommerce,
      BookingsRevenueByChannelTypeEcommercePrevious,
      BookingsTotalRentalsByChannelTypeEcommerce,
      BookingsTotalRentalsByChannelTypeEcommercePrevious,
      BookingsTotalRentalsByPeriodEcommerce,
      BookingsRevenueByPeriodEcommerce,
      KpiRevenue,
      KpiRevenuePreviousData,
    ] = await this.prisma.prismaOnline.$transaction([
      this.prisma.prismaOnline.bookingsRevenue.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllValue: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsRevenue.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllValue: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsTotalRentals.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllBookings: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsTotalRentals.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllBookings: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsTicketAverage.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllTicketAverage: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsTicketAverage.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllTicketAverage: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsRepresentativeness.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllRepresentativeness: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsRepresentativeness.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllRepresentativeness: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsRevenueByPayment.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalValue: true,
          paymentMethod: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsRevenueByChannelType.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          channelType: true,
          totalValue: true,
          totalAllValue: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsTotalRentalsByRentalType.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          rentalType: true,
          totalBookings: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsRevenueByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalValue: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsRepresentativenessByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalRepresentativeness: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsTotalRentalsByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalBookings: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsTotalRentalsByChannelType.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          channelType: true,
          period: true,
          totalBookings: true,
          totalAllBookings: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsTicketAverageByChannelType.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          channelType: true,
          period: true,
          totalTicketAverage: true,
          totalAllTicketAverage: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsRepresentativenessByChannelType.findMany(
        {
          where: {
            period: period,
            createdDate: {
              gte: endDate,
            },
          },
          select: {
            createdDate: true,
            channelType: true,
            period: true,
            totalRepresentativeness: true,
            totalAllRepresentativeness: true,
          },
          orderBy: {
            createdDate: 'desc',
          },
        },
      ),
      this.prisma.prismaOnline.bookingsRevenueByChannelType.aggregate({
        _sum: {
          totalValue: true,
        },
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
          channelType: {
            in: ['WEBSITE_IMMEDIATE', 'WEBSITE_SCHEDULED'], // Filtra apenas os canais desejados
          },
        },
      }),
      this.prisma.prismaOnline.bookingsRevenueByChannelType.aggregate({
        _sum: {
          totalValue: true,
        },
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
          channelType: {
            in: ['WEBSITE_IMMEDIATE', 'WEBSITE_SCHEDULED'], // Filtra apenas os canais desejados
          },
        },
      }),
      this.prisma.prismaOnline.bookingsTotalRentalsByChannelType.aggregate({
        _sum: {
          totalBookings: true,
        },
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
          channelType: {
            in: ['WEBSITE_IMMEDIATE', 'WEBSITE_SCHEDULED'], // Filtra apenas os canais desejados
          },
        },
      }),
      this.prisma.prismaOnline.bookingsTotalRentalsByChannelType.aggregate({
        _sum: {
          totalBookings: true,
        },
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
          channelType: {
            in: ['WEBSITE_IMMEDIATE', 'WEBSITE_SCHEDULED'], // Filtra apenas os canais desejados
          },
        },
      }),
      this.prisma.prismaOnline.bookingsTotalRentalsByPeriodEcommerce.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          totalBookings: true,
          createdDate: true,
          period: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.bookingsRevenueByPeriodEcommerce.findMany({
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
          period: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.kpiRevenue.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate, // Filtra pela data inicial
          },
        },
        select: {
          totalAllValue: true,
          createdDate: true,
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
          totalAllValue: true,
          createdDate: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
    ]);

    // Montando o retorno de BigNumbers
    const bigNumbers = {
      currentDate: {
        // Itera sobre cada item e acumula o totalValue
        totalAllValue: Number(BookingsRevenue[0]?.totalAllValue ?? 0),

        totalAllBookings: BookingsTotalRentals[0]?.totalAllBookings ?? 0,
        totalAllTicketAverage: Number(
          BookingsTicketAverage[0]?.totalAllTicketAverage ?? 0,
        ),

        totalAllRepresentativeness: Number(
          BookingsRepresentativeness[0]?.totalAllRepresentativeness ?? 0,
        ),
      },

      PreviousDate: {
        totalAllValuePreviousData: Number(
          BookingsRevenuePreviousData[0]?.totalAllValue ?? 0,
        ),

        totalAllBookingsPreviousData:
          BookingsTotalRentalsPreviousData[0]?.totalAllBookings ?? 0,

        totalAllTicketAveragePreviousData: Number(
          BookingsTicketAveragePreviousData[0]?.totalAllTicketAverage ?? 0,
        ),

        totalAllRepresentativenessPreviousData: Number(
          BookingsRepresentativenessPreviousData[0]
            ?.totalAllRepresentativeness ?? 0,
        ),
      },
    };

    const paymentMethods = {
      categories: BookingsRevenueByPayment.map((item) => item.paymentMethod),
      series: BookingsRevenueByPayment.map((item) => Number(item.totalValue)),
    };

    const billingPerChannel = {
      categories: BookingsRevenueByChannelType.map((item) => item.channelType),
      series: BookingsRevenueByChannelType.map((item) =>
        Number(item.totalValue),
      ),
    };

    const reservationsByRentalType = {
      categories: BookingsTotalRentalsByRentalType.map(
        (item) => item.rentalType,
      ),
      series: BookingsTotalRentalsByRentalType.map((item) =>
        Number(item.totalBookings),
      ),
    };

    // Aplicar o filtro se o período for LAST_6_M
    let filteredDataRevenuePeriod = BookingsRevenueByPeriod;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate(); // Obter o dia do mês do startDate
      filteredDataRevenuePeriod = filterByDayOfMonth(
        BookingsRevenueByPeriod,
        dayOfMonth,
      );
    }

    const billingOfReservationsByPeriod = {
      categories: filteredDataRevenuePeriod.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: filteredDataRevenuePeriod.map((item) => Number(item.totalValue)),
    };

    // Aplicar o filtro se o período for LAST_6_M
    let filteredDataRepresentativenessPeriod =
      BookingsRepresentativenessByPeriod;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate(); // Obter o dia do mês do startDate
      filteredDataRepresentativenessPeriod = filterByDayOfMonth(
        BookingsRepresentativenessByPeriod,
        dayOfMonth,
      );
    }

    const representativenessOfReservesByPeriod = {
      categories: filteredDataRepresentativenessPeriod.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: filteredDataRepresentativenessPeriod.map((item) =>
        Number(item.totalRepresentativeness),
      ),
    };

    // Aplicar o filtro se o período for LAST_6_M
    let filteredDataTotalRentalsPeriod = BookingsTotalRentalsByPeriod;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate(); // Obter o dia do mês do startDate
      filteredDataTotalRentalsPeriod = filterByDayOfMonth(
        BookingsTotalRentalsByPeriod,
        dayOfMonth,
      );
    }

    const numberOfReservationsPerPeriod = {
      categories: filteredDataTotalRentalsPeriod.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: filteredDataTotalRentalsPeriod.map((item) =>
        Number(item.totalBookings),
      ),
    };

    const kpiTableByChannelType = {
      bookingsTotalRentalsByChannelType: {} as Record<string, number>,
      bookingsRevenueByChannelType: {} as Record<string, number>,
      bookingsTicketAverageByChannelType: {} as Record<string, number>,
      bookingsRepresentativenessByChannelType: {} as Record<string, number>,
    };

    // Preencher bookingsTotalRentalsByChannelType
    BookingsTotalRentalsByChannelType.forEach((item) => {
      if (item.channelType) {
        kpiTableByChannelType.bookingsTotalRentalsByChannelType[
          item.channelType
        ] = Number(item.totalBookings);
      }
    });

    // Adiciona o total de bookings
    if (BookingsTotalRentalsByChannelType.length > 0) {
      kpiTableByChannelType.bookingsTotalRentalsByChannelType[
        'TOTALALLBOOKINGS'
      ] = Number(BookingsTotalRentalsByChannelType[0].totalAllBookings);
    }

    // Preencher bookingsRevenueByChannelType
    BookingsRevenueByChannelType.forEach((item) => {
      if (item.channelType) {
        kpiTableByChannelType.bookingsRevenueByChannelType[item.channelType] =
          Number(item.totalValue); // Garantir que seja um número
      }
    });

    // Adiciona o total de revenue
    if (BookingsRevenueByChannelType.length > 0) {
      kpiTableByChannelType.bookingsRevenueByChannelType['TOTALALLVALUE'] =
        Number(BookingsRevenueByChannelType[0].totalAllValue); // Garantir que seja um número
    }

    // Preencher bookingsTicketAverageByChannelType
    BookingsTicketAverageByChannelType.forEach((item) => {
      if (item.channelType) {
        kpiTableByChannelType.bookingsTicketAverageByChannelType[
          item.channelType
        ] = Number(item.totalTicketAverage); // Garantir que seja um número
      }
    });

    // Adiciona o total de ticket average
    if (BookingsTicketAverageByChannelType.length > 0) {
      kpiTableByChannelType.bookingsTicketAverageByChannelType[
        'TOTALALLTICKETAVERAGE'
      ] = Number(BookingsTicketAverageByChannelType[0].totalAllTicketAverage); // Garantir que seja um número
    }

    // Preencher bookingsRepresentativenessByChannelType
    BookingsRepresentativenessByChannelType.forEach((item) => {
      if (item.channelType) {
        kpiTableByChannelType.bookingsRepresentativenessByChannelType[
          item.channelType
        ] = Number(item.totalRepresentativeness); // Garantir que seja um número
      }
    });

    // Adiciona o total de representatividade
    if (BookingsRepresentativenessByChannelType.length > 0) {
      kpiTableByChannelType.bookingsRepresentativenessByChannelType[
        'TOTALALLREPRESENTATIVENESS'
      ] = Number(
        BookingsRepresentativenessByChannelType[0].totalAllRepresentativeness,
      ); // Garantir que seja um número
    }

    // Montando o retorno de BigNumbers do E-commerce
    const bigNumbersEcommerce = {
      currentDate: {
        // Itera sobre cada item e acumula o totalValue
        totalAllValue: Number(
          BookingsRevenueByChannelTypeEcommerce._sum.totalValue || 0,
        ),

        totalAllBookings: Number(
          BookingsTotalRentalsByChannelTypeEcommerce._sum.totalBookings || 0,
        ),
        totalAllTicketAverage: Number(
          BookingsRevenueByChannelTypeEcommerce._sum.totalValue
            ? BookingsRevenueByChannelTypeEcommerce._sum.totalValue.dividedBy(
                BookingsTotalRentalsByChannelTypeEcommerce._sum.totalBookings ||
                  1, // Usar 1 como divisor padrão para evitar divisão por zero
              ).toFixed(2)
            : 0, // Se o resultado for NaN, retorna 0
        ),

        totalAllRepresentativeness: Number(
          BookingsRevenueByChannelTypeEcommerce._sum.totalValue
            ? BookingsRevenueByChannelTypeEcommerce._sum.totalValue.dividedBy(
                KpiRevenue[0]?.totalAllValue || 1, // Usar 1 como divisor padrão para evitar divisão por zero
              ).toFixed(2)
            : 0, // Se o resultado for NaN, retorna 0
        ),
      },

      PreviousDate: {
        totalAllValuePreviousData: Number(
          BookingsRevenueByChannelTypeEcommercePrevious._sum.totalValue || 0,
        ),

        totalAllBookingsPreviousData: Number(
          BookingsTotalRentalsByChannelTypeEcommercePrevious._sum
            .totalBookings || 0,
        ),
        totalAllTicketAveragePreviousData: Number(
          BookingsRevenueByChannelTypeEcommercePrevious._sum.totalValue
            ? BookingsRevenueByChannelTypeEcommercePrevious._sum.totalValue.dividedBy(
                BookingsTotalRentalsByChannelTypeEcommercePrevious._sum
                  .totalBookings || 1, // Usar 1 como divisor padrão para evitar divisão por zero
              ).toFixed(2)
            : 0, // Se o resultado for NaN, retorna 0
        ),

        totalAllRepresentativenessPreviousData: Number(
          BookingsRevenueByChannelTypeEcommercePrevious._sum.totalValue
            ? BookingsRevenueByChannelTypeEcommercePrevious._sum.totalValue.dividedBy(
                KpiRevenuePreviousData[0]?.totalAllValue || 1, // Usar 1 como divisor padrão para evitar divisão por zero
              ).toFixed(2)
            : 0, // Se o resultado for NaN, retorna 0
        ),
      },
    };

    // Aplicar o filtro se o período for LAST_6_M
    let filteredDataTotalRentalsByPeriodEcommerce =
      BookingsTotalRentalsByPeriodEcommerce;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate(); // Obter o dia do mês do startDate
      filteredDataTotalRentalsByPeriodEcommerce = filterByDayOfMonth(
        BookingsTotalRentalsByPeriodEcommerce,
        dayOfMonth,
      );
    }

    const reservationsOfEcommerceByPeriod = {
      categories: filteredDataTotalRentalsByPeriodEcommerce.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: filteredDataTotalRentalsByPeriodEcommerce.map((item) =>
        Number(item.totalBookings),
      ),
    };

    // Aplicar o filtro se o período for LAST_6_M
    let filteredDataRevenueByPeriodEcommerce = BookingsRevenueByPeriodEcommerce;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate(); // Obter o dia do mês do startDate
      filteredDataRevenueByPeriodEcommerce = filterByDayOfMonth(
        BookingsRevenueByPeriodEcommerce,
        dayOfMonth,
      );
    }

    const billingOfEcommerceByPeriod = {
      categories: filteredDataRevenueByPeriodEcommerce.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: filteredDataRevenueByPeriodEcommerce.map((item) =>
        Number(item.totalValue),
      ),
    };

    return {
      Company: 'Lush Ipiranga',
      BigNumbers: [bigNumbers],
      PaymentMethods: paymentMethods,
      BillingPerChannel: billingPerChannel,
      ReservationsByRentalType: reservationsByRentalType,
      BillingOfReservationsByPeriod: billingOfReservationsByPeriod,
      RepresentativenessOfReservesByPeriod:
        representativenessOfReservesByPeriod,
      NumberOfReservationsPerPeriod: numberOfReservationsPerPeriod,
      KpiTableByChannelType: [kpiTableByChannelType],
      BigNumbersEcommerce: [bigNumbersEcommerce],
      ReservationsOfEcommerceByPeriod: reservationsOfEcommerceByPeriod,
      BillingOfEcommerceByPeriod: billingOfEcommerceByPeriod,
    };
  }

  private async calculateTotalSaleDirect(
    startDate: Date,
    endDate: Date,
  ): Promise<Prisma.Decimal> {
    const stockOutItems = await this.prisma.prismaLocal.stockOutItem.findMany({
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
    });

    return stockOutItems.reduce((totalSaleDirect, stockOutItem) => {
      const stockOut = stockOutItem.stockOuts;

      if (stockOut && stockOut.saleDirect) {
        const saleDirects = Array.isArray(stockOut.saleDirect)
          ? stockOut.saleDirect
          : [stockOut.saleDirect];
        const discountSale = stockOut.sale?.discount
          ? new Prisma.Decimal(stockOut.sale.discount)
          : new Prisma.Decimal(0);

        saleDirects.forEach((saleDirect) => {
          if (saleDirect && stockOutItem.stockOutId === saleDirect.stockOutId) {
            const itemTotal = new Prisma.Decimal(stockOutItem.priceSale).times(
              new Prisma.Decimal(stockOutItem.quantity),
            );
            totalSaleDirect = totalSaleDirect.plus(
              itemTotal.minus(discountSale),
            );
          }
        });
      }

      return totalSaleDirect;
    }, new Prisma.Decimal(0));
  }

  private async calculateTotalSaleDirectForDate(
    date: Date,
  ): Promise<Prisma.Decimal> {
    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();

    return await this.calculateTotalSaleDirect(startOfDay, endOfDay);
  }

  private async fetchAllSaleDirectDataOptimized(
    startDate: Date, 
    endDate: Date
  ): Promise<Map<string, Prisma.Decimal>> {
    
    const stockOutItems = await this.prisma.prismaLocal.stockOutItem.findMany({
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
    });

    const salesByDate = new Map<string, Prisma.Decimal>();
    
    stockOutItems.forEach(item => {
      if (item.stockOuts?.createdDate) {
        const dateKey = moment(item.stockOuts.createdDate)
          .format('YYYY-MM-DD');
        
        const currentTotal = salesByDate.get(dateKey) || new Prisma.Decimal(0);
        
        const stockOut = item.stockOuts;
        let itemValue = new Prisma.Decimal(0);

        if (stockOut && stockOut.saleDirect) {
          const saleDirects = Array.isArray(stockOut.saleDirect)
            ? stockOut.saleDirect
            : [stockOut.saleDirect];
          const discountSale = stockOut.sale?.discount
            ? new Prisma.Decimal(stockOut.sale.discount)
            : new Prisma.Decimal(0);

          saleDirects.forEach((saleDirect) => {
            if (saleDirect && item.stockOutId === saleDirect.stockOutId) {
              const itemTotal = new Prisma.Decimal(item.priceSale).times(
                new Prisma.Decimal(item.quantity),
              );
              itemValue = itemValue.plus(itemTotal.minus(discountSale));
            }
          });
        }
        
        salesByDate.set(dateKey, currentTotal.plus(itemValue));
      }
    });

    return salesByDate;
  }

  private async fetchKpiData(startDate: Date, endDate: Date) {
    // Busca os bookings
    const allBookings = await this.prisma.prismaLocal.booking.findMany({
      where: {
        dateService: {
          gte: startDate,
          lte: endDate,
        },
        OR: [
          {
            canceled: null, // Locações onde canceled é null
          },
          {
            noShow: true, // E noShow deve ser true
          },
        ],
      },
      select: {
        id: true,
        discountBooking: true,
        priceRental: true,
        idTypeOriginBooking: true,
        dateService: true,
        startDate: true,
        rentalApartmentId: true,
        originBooking: true,
        rentalApartment: true,
      },
    });

    const allBookingsEcommerce = await this.prisma.prismaLocal.booking.findMany(
      {
        where: {
          dateService: {
            gte: startDate,
            lte: endDate,
          },
          OR: [
            {
              canceled: null, // Locações onde canceled é null
            },
            {
              noShow: true, // E noShow deve ser true
            },
          ],
        },
        select: {
          id: true,
          discountBooking: true,
          priceRental: true,
          idTypeOriginBooking: true,
          dateService: true,
          startDate: true,
          rentalApartmentId: true,
          originBooking: true,
          rentalApartment: true,
        },
      },
    );

    // Busca os newReleases
    const newReleases = await this.prisma.prismaLocal.newRelease.findMany({
      where: {
        deletionDate: {
          equals: null,
        },
        releaseType: {
          equals: 'RESERVA',
        },
        accountPayReceiveId: {
          equals: null,
        },
      },
      select: {
        value: true,
        halfPaymentId: true,
        originalsId: true,
      },
    });

    // Busca os halfPayments
    const halfPayments = await this.prisma.prismaLocal.halfPayment.findMany({
      where: {
        deletionDate: {
          equals: null,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    // Busca os rentalApartments
    const allRentalApartments =
      await this.prisma.prismaLocal.rentalApartment.findMany({
        where: {
          checkIn: {
            gte: startDate,
            lte: moment
              .utc(endDate)
              .add(1, 'day')
              .set({ hour: 5, minute: 59, second: 59 })
              .toDate(),
          },
          endOccupationType: 'FINALIZADA',
        },
        select: {
          checkIn: true,
          totalValue: true,
          saleLease: true,
          permanenceValueLiquid: true,
        },
      });

    // Coleta todos os stockOutIds antes de fazer as consultas
    const stockOutIds: number[] = [];
    for (const rentalApartment of allRentalApartments) {
      const saleLease = rentalApartment.saleLease;
      if (saleLease && saleLease.stockOutId) {
        stockOutIds.push(saleLease.stockOutId);
      }
    }

    // Busca todos os stockOuts de uma vez, se houver algum
    const stockOuts =
      stockOutIds.length > 0
        ? await this.prisma.prismaLocal.stockOut.findMany({
            where: { id: { in: stockOutIds } },
            include: {
              stockOutItem: {
                where: {
                  canceled: null,
                },
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
          })
        : [];

    const stockOutMap = new Map(
      stockOuts.map((stockOut) => [stockOut.id, stockOut]),
    );

    const totalSaleDirect = await this.calculateTotalSaleDirect(
      startDate,
      endDate,
    );

    return {
      allBookings,
      allBookingsEcommerce,
      newReleases,
      halfPayments,
      allRentalApartments,
      stockOutMap,
      totalSaleDirect,
    };
  }

  async calculateKpisByDateRange(startDate: Date, endDate: Date): Promise<any> {
    try {
      console.log('startDate:', startDate);
      console.log('endDate:', endDate);

      const {
        allBookings,
        allBookingsEcommerce,
        newReleases,
        halfPayments,
        allRentalApartments,
        stockOutMap,
        totalSaleDirect,
      } = await this.fetchKpiData(startDate, endDate);

      // P0-002: Fetch ALL sale direct data once to avoid N+1 queries
      const salesByDateMap = await this.fetchAllSaleDirectDataOptimized(
        startDate, 
        endDate
      );

      if (!allBookings || allBookings.length === 0) {
        throw new NotFoundException('No booking revenue found.');
      }

      // Calcular o total de priceRental baseado no newRelease
      const totalAllValue = allBookings.reduce((total, booking) => {
        // Verifica se o id do booking está presente no newRelease
        const matchingRelease = newReleases.find(
          (release) => release.originalsId === booking.id,
        );

        if (matchingRelease) {
          // Se o value do newRelease for 0
          if (Number(matchingRelease.value) === 0) {
            // Verifica se há um discountBooking
            const discount = booking.discountBooking || 0; // Supondo que discountBooking seja uma propriedade do booking
            const adjustedPriceRental =
              Number(booking.priceRental || 0) - Number(discount); // Subtrai o desconto do priceRental
            return total.plus(
              adjustedPriceRental > 0 ? adjustedPriceRental : 0,
            ); // Adiciona ao total, garantindo que não seja negativo
          }
          // Caso contrário, usa o value do newRelease
          return total.plus(Number(matchingRelease.value));
        }

        // Se não houver correspondência pelo id, verifica pelo rentalApartmentId
        const matchingReleaseByApartment = newReleases.find(
          (release) => release.originalsId === booking.rentalApartmentId,
        );

        if (matchingReleaseByApartment) {
          // Se o value do newRelease for 0
          if (Number(matchingReleaseByApartment.value) === 0) {
            const discount = booking.discountBooking || 0; // Supondo que discountBooking seja uma propriedade do booking
            const adjustedPriceRental =
              Number(booking.priceRental || 0) - Number(discount); // Subtrai o desconto do priceRental
            return total.plus(
              adjustedPriceRental > 0 ? adjustedPriceRental : 0,
            ); // Adiciona ao total, garantindo que não seja negativo
          }
          // Caso contrário, usa o value do newRelease
          return total.plus(Number(matchingReleaseByApartment.value));
        }

        // Se não houver correspondência e o idTypeOriginBooking for 7 ou 8, não soma o priceRental
        if (
          booking.idTypeOriginBooking === 7 ||
          booking.idTypeOriginBooking === 8
        ) {
          return total; // Não soma nada
        }

        // Se não houver correspondência, usa o priceRental do booking
        return total.plus(Number(booking.priceRental || 0)); // Garante que priceRental não seja null
      }, new Prisma.Decimal(0));

      // Calcular o total de reservas
      const totalAllBookings = allBookings.length;

      // Calcular o total do ticket médio de reservas
      const totalAllTicketAverage = Number(totalAllValue) / totalAllBookings;

      // Calcular a receita geral de locações
      const totalValueForRentalApartments = allRentalApartments.reduce(
        (total, apartment) => {
          return total.plus(new Prisma.Decimal(apartment.totalValue || 0)); // Adiciona 0 se totalValue for nulo
        },
        new Prisma.Decimal(0),
      );

      // Calcular a receita total somando as vendas diretas com as locações gerais
      const totalRevenue = totalSaleDirect.plus(totalValueForRentalApartments);

      // Calcular o total de representatividade
      const totalAllRepresentativeness = totalRevenue
        ? totalAllValue.dividedBy(totalRevenue)
        : new Prisma.Decimal(0);

      const bigNumbers = {
        currentDate: {
          totalAllValue: Number(totalAllValue),
          totalAllBookings: Number(totalAllBookings),
          totalAllTicketAverage: Number(totalAllTicketAverage.toFixed(2)),
          totalAllRepresentativeness: Number(
            totalAllRepresentativeness.toFixed(2),
          ),
        },
      };

      // Cria um mapa para associar halfPaymentId ao name
      const halfPaymentMap = new Map<number, string>();
      for (const halfPayment of halfPayments) {
        halfPaymentMap.set(halfPayment.id, halfPayment.name);
      }

      // Inicializa um objeto para armazenar os totais por meio de pagamento
      const revenueByPaymentMethod = new Map<string, Prisma.Decimal>(); // Mapeia o nome do meio de pagamento

      // Calcular o total de priceRental por meio de pagamento
      for (const booking of allBookings) {
        const matchingNewRelease = newReleases.find(
          (release) => release.originalsId === booking.id, // Comparando booking.id com release.originalsId
        );

        if (matchingNewRelease) {
          const halfPaymentId = matchingNewRelease.halfPaymentId;
          const paymentName = halfPaymentMap.get(halfPaymentId); // Obtém o nome do meio de pagamento

          // Inicializa o total para o meio de pagamento se não existir
          if (paymentName !== undefined && !revenueByPaymentMethod.has(paymentName)) {
            revenueByPaymentMethod.set(paymentName, new Prisma.Decimal(0));
          }

          // Acumula o valor atual ao total existente
          if (paymentName !== undefined) {
            const currentTotal = revenueByPaymentMethod.get(paymentName) ?? new Prisma.Decimal(0);
            revenueByPaymentMethod.set(
              paymentName,
              currentTotal.plus(new Prisma.Decimal(booking.priceRental || 0)),
            );
          }
        }
      }

      const paymentMethods = {
        categories: [],
        series: [],
      };

      for (const [
        paymentName,
        totalValue,
      ] of revenueByPaymentMethod.entries()) {
        // Adiciona o nome do método de pagamento à array de categorias
        (paymentMethods.categories as string[]).push(paymentName);

        // Adiciona o valor total à array de séries
        (paymentMethods.series as number[]).push(totalValue.toNumber()); // Converte para número, se necessário
      }

      // Mapa para armazenar os totais por channelType
      const revenueByChannelType = new Map<ChannelTypeEnum, Prisma.Decimal>([
        [ChannelTypeEnum.INTERNAL, new Prisma.Decimal(0)],
        [ChannelTypeEnum.GUIA_GO, new Prisma.Decimal(0)],
        [ChannelTypeEnum.GUIA_SCHEDULED, new Prisma.Decimal(0)],
        [ChannelTypeEnum.WEBSITE_IMMEDIATE, new Prisma.Decimal(0)],
        [ChannelTypeEnum.WEBSITE_SCHEDULED, new Prisma.Decimal(0)],
        [ChannelTypeEnum.BOOKING, new Prisma.Decimal(0)],
        [ChannelTypeEnum.EXPEDIA, new Prisma.Decimal(0)],
      ]);

      // Função para determinar o channelType com base no idTypeOriginBooking e na dateService
      const getChannelType = (
        idTypeOriginBooking: number,
        dateService: Date,
        startDate: Date,
      ): ChannelTypeEnum | null => {
        const isSameDate = (date1: Date, date2: Date) => {
          return (
            date1.getFullYear() === date2.getFullYear() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getDate() === date2.getDate()
          );
        };

        // Função para verificar se a diferença entre duas datas é de até 1 hora
        const isWithinOneHour = (date1: Date, date2: Date) => {
          const differenceInMilliseconds = Math.abs(
            date1.getTime() - date2.getTime(),
          );
          return differenceInMilliseconds <= 3600000; // 1 hora em milissegundos
        };

        switch (idTypeOriginBooking) {
          case 1: // SISTEMA
            return ChannelTypeEnum.INTERNAL;
          case 3: // GUIA_DE_MOTEIS
            if (isWithinOneHour(dateService, startDate)) {
              // Se a diferença for de até 1 hora, retorna GUIA_GO
              return ChannelTypeEnum.GUIA_GO;
            } else {
              // Se não estiver dentro de 1 hora, verifica se são do mesmo dia
              return isSameDate(dateService, startDate)
                ? ChannelTypeEnum.GUIA_GO
                : ChannelTypeEnum.GUIA_SCHEDULED;
            }
          case 4: // RESERVA_API
            if (isWithinOneHour(dateService, startDate)) {
              // Se a diferença for de até 1 hora, retorna WEBSITE_IMMEDIATE
              return ChannelTypeEnum.WEBSITE_IMMEDIATE;
            } else {
              // Se não estiver dentro de 1 hora, verifica se são do mesmo dia
              return isSameDate(dateService, startDate)
                ? ChannelTypeEnum.WEBSITE_IMMEDIATE
                : ChannelTypeEnum.WEBSITE_SCHEDULED;
            }
          case 6: // INTERNA
            return ChannelTypeEnum.INTERNAL;
          case 7: // BOOKING
            return ChannelTypeEnum.BOOKING;
          case 8: // EXPEDIA
            return ChannelTypeEnum.EXPEDIA;
          default:
            return null; // Para outros casos, retorna null
        }
      };

      // Calcular o total de priceRental por channelType
      allBookings.forEach((booking) => {
        const channelType = getChannelType(
          booking.idTypeOriginBooking,
          booking.dateService,
          booking.startDate,
        ); // Mapeia o idTypeOriginBooking para channelType

        if (channelType) {
          // Acumula o valor atual ao total existente
          const currentTotal = revenueByChannelType.get(channelType);
          if (currentTotal !== undefined) {
            revenueByChannelType.set(
              channelType,
              currentTotal.plus(new Prisma.Decimal(booking.priceRental || 0)),
            );
          } else {
            revenueByChannelType.set(
              channelType,
              new Prisma.Decimal(booking.priceRental || 0),
            );
          }
        }
      });

      // Preparar o retorno no formato desejado
      const categories = Array.from(revenueByChannelType.keys());
      const series = Array.from(revenueByChannelType.values()).map(
        (value) => value.toNumber() || 0, // Garantir que valores nulos sejam convertidos para R$0,00
      );

      const billingPerChannel = {
        categories,
        series,
      };
      
      // Inicializa um contador para cada tipo de locação
      const rentalCounts: Record<RentalTypeEnum, number> = {
        [RentalTypeEnum.THREE_HOURS]: 0,
        [RentalTypeEnum.SIX_HOURS]: 0,
        [RentalTypeEnum.TWELVE_HOURS]: 0,
        [RentalTypeEnum.DAY_USE]: 0,
        [RentalTypeEnum.OVERNIGHT]: 0,
        [RentalTypeEnum.DAILY]: 0,
      };
      
      // Cria o objeto final
      const reservationsByRentalType = {
        categories: [] as RentalTypeEnum[],
        series: [] as number[],
      };
      
      // Processa cada reserva para contar o tipo de locação
      for (const booking of allBookings) {
        const checkIn = booking.rentalApartment?.checkIn;
        const checkOut = booking.rentalApartment?.checkOut;
      
        if (checkIn && checkOut) {
          const rentalType = this.determineRentalPeriod(checkIn, checkOut, allBookings);
      
          // Incrementa o contador se o rentalType for válido
          if (rentalType && Object.prototype.hasOwnProperty.call(rentalCounts, rentalType)) {
            rentalCounts[rentalType as RentalTypeEnum]++;
          }
        }
      }
      // Preenche as arrays de categorias e séries com os resultados
      for (const rentalType of Object.keys(rentalCounts) as RentalTypeEnum[]) {
        reservationsByRentalType.categories.push(rentalType);
        reservationsByRentalType.series.push(rentalCounts[rentalType]);
      }      

      const billingOfReservationsByPeriod = {
        categories: [],
        series: [],
      };

      // Supondo que você tenha startDate e endDate definidos como moment.js
      let currentDate = moment(startDate).utc();
      const finalDate = moment(endDate).utc();

      // Iterar sobre as datas do período
      while (currentDate.isSameOrBefore(finalDate, 'day')) {
        const dateKey = currentDate.format('DD/MM/YYYY'); // Formata a data como "DD/MM/YYYY"
        let totalValueForCurrentDate = new Prisma.Decimal(0); // Inicializa o total para a data atual

        // Calcular o total para a data atual
        allBookings.forEach((booking) => {
          const bookingDate = moment.utc(booking.dateService);

          // Se a data do booking corresponder à data atual, soma o priceRental
          if (bookingDate.isSame(currentDate, 'day')) {
            totalValueForCurrentDate = totalValueForCurrentDate.plus(
              new Prisma.Decimal(booking.priceRental || 0),
            );
          }
        });

        // Adiciona a data e o total ao objeto de retorno
        (billingOfReservationsByPeriod.categories as string[]).push(dateKey);
        (billingOfReservationsByPeriod.series as number[]).push(
          totalValueForCurrentDate.toNumber(),
        ); // Converte para número

        // P0-003: Memory leak fix - increment using assignment instead of mutation
        currentDate = currentDate.clone().add(1, 'day');
      }

      // Inverter a ordem das categorias e séries para ficar em ordem decrescente
      billingOfReservationsByPeriod.categories.reverse();
      billingOfReservationsByPeriod.series.reverse();

      const representativenessOfReservesByPeriod = {
        categories: [],
        series: [],
      };

      // Ajustar a endDate para o início do dia seguinte
      const adjustedEndDate = moment(endDate).utc().startOf('day'); // Define o início do dia da endDate

      // Iniciar currentDate no início do dia da startDate
      let currentDateRep = moment(startDate).utc().startOf('day'); // Início do dia contábil às 00:00:00

      // Iterar sobre as datas do período
      while (currentDateRep.isSameOrBefore(adjustedEndDate, 'day')) {
        const dateKeyRep = currentDateRep.format('DD/MM/YYYY'); // Formata a data como "DD/MM/YYYY"

        // Definir o intervalo para reservas e representatividade (00:00 a 23:59)
        const startOfDay = currentDateRep.clone().startOf('day'); // 00:00
        const endOfDay = currentDateRep.clone().endOf('day'); // 23:59

        // Calcular a receita total de reservas para a data atual
        const totalAllValue = allBookings.reduce((total, booking) => {
          const bookingDate = moment.utc(booking.dateService);

          return bookingDate.isSameOrAfter(startOfDay) &&
            bookingDate.isSameOrBefore(endOfDay)
            ? total.plus(new Prisma.Decimal(booking.priceRental || 0)) // Adiciona 0 se priceRental for nulo
            : total;
        }, new Prisma.Decimal(0));

        // Definir o intervalo para locação e vendas diretas (06:00 a 05:59)
        const rentalStartDate = currentDateRep
          .clone()
          .set({ hour: 6, minute: 0, second: 0 }); // 06:00
        const rentalEndDate = currentDateRep
          .clone()
          .add(1, 'day')
          .set({ hour: 5, minute: 59, second: 59 }); // 05:59 do dia seguinte

        // Calcular a receita total de locação para a data atual
        const totalValueForRentalApartments = allRentalApartments.reduce(
          (total, apartment) => {
            const apartmentDate = moment.utc(apartment.checkIn);

            // Verifica se a data do check-in do apartamento está dentro do intervalo
            if (
              apartmentDate.isSameOrAfter(rentalStartDate) &&
              apartmentDate.isSameOrBefore(rentalEndDate)
            ) {
              let priceSale = new Prisma.Decimal(0);
              let discountSale = new Prisma.Decimal(0);

              // Lógica para calcular o priceSale
              if (apartment.saleLease && apartment.saleLease.stockOutId) {
                const stockOutSaleLease = stockOutMap.get(
                  apartment.saleLease.stockOutId,
                );
                if (stockOutSaleLease) {
                  if (Array.isArray(stockOutSaleLease.stockOutItem)) {
                    priceSale = stockOutSaleLease.stockOutItem.reduce(
                      (acc, current) =>
                        acc.plus(
                          new Prisma.Decimal(current.priceSale).times(
                            new Prisma.Decimal(current.quantity),
                          ),
                        ),
                      new Prisma.Decimal(0),
                    );
                    discountSale = stockOutSaleLease.sale?.discount
                      ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
                      : new Prisma.Decimal(0);
                    priceSale = priceSale.minus(discountSale);
                  }
                }
              }

              const permanenceValueLiquid = apartment.permanenceValueLiquid
                ? new Prisma.Decimal(apartment.permanenceValueLiquid)
                : new Prisma.Decimal(0);

              // Soma priceSale e permanenceValueLiquid
              return total.plus(priceSale).plus(permanenceValueLiquid);
            }
            return total; // Retorna o total inalterado se não estiver no intervalo
          },
          new Prisma.Decimal(0),
        );

        // P0-002: Optimized lookup instead of database query
        const saleDateKey = rentalStartDate.format('YYYY-MM-DD');
        const totalSaleDirectForDate = salesByDateMap.get(saleDateKey) || 
          new Prisma.Decimal(0);

        // Calcular a receita total combinada (vendas diretas + locação)
        const totalRevenue = totalValueForRentalApartments.plus(
          totalSaleDirectForDate,
        );

        // Calcular a representatividade
        const representativeness =
          totalRevenue && !totalRevenue.isZero()
            ? Number(totalAllValue.dividedBy(totalRevenue).toFixed(2))
            : 0; // Se totalRevenue for null ou zero, retorna 0

        // Adiciona a data e a representatividade ao objeto de retorno
        (representativenessOfReservesByPeriod.categories as string[]).push(dateKeyRep);
        (representativenessOfReservesByPeriod.series as number[]).push(representativeness);

        // P0-003: Memory leak fix - increment using assignment instead of mutation
        currentDateRep = currentDateRep.clone().add(1, 'day');
      }

      // Inverter a ordem das categorias e séries para ficar em ordem decrescente
      representativenessOfReservesByPeriod.categories.reverse();
      representativenessOfReservesByPeriod.series.reverse();

      const numberOfReservationsPerPeriod = {
        categories: [],
        series: [],
      };

      // Ajustar a endDate para o início do dia seguinte
      const adjustedEndDateBooking = moment(endDate).utc().startOf('day'); // Define o início do dia da endDate

      // Iniciar currentDate no início do dia da startDate
      let currentDateBooking = moment(startDate).utc().startOf('day'); // Início do dia contábil às 00:00:00

      // Iterar sobre as datas do período
      while (currentDateBooking.isSameOrBefore(adjustedEndDateBooking, 'day')) {
        const nextDateBooking = currentDateBooking.clone().add(1, 'day'); // Clona currentDateRep e avança um dia

        const dateKey = currentDateBooking.format('DD/MM/YYYY'); // Formata a data como "YYYY-MM-DD"

        // Contar o total de reservas para a data atual
        const totalBookingsForCurrentPeriod = allBookings.reduce(
          (total, booking) => {
            const bookingDate = moment.utc(booking.dateService);
            return bookingDate.isBetween(
              currentDateBooking,
              nextDateBooking,
              null,
              '[]',
            )
              ? total + 1 // Incrementa o total se a data do booking estiver no intervalo
              : total;
          },
          0,
        );

        // Adiciona o resultado ao objeto de resultados
        (numberOfReservationsPerPeriod.categories as string[]).push(dateKey);
        (numberOfReservationsPerPeriod.series as number[]).push(
          totalBookingsForCurrentPeriod,
        );

        // Avança para o próximo dia
        currentDateBooking = nextDateBooking; // Atualiza currentDateRep para o próximo dia
      }

      // Inverter a ordem das categorias e séries para ficar em ordem decrescente
      numberOfReservationsPerPeriod.categories.reverse();
      numberOfReservationsPerPeriod.series.reverse();

      type ChannelTypeMap = Record<ChannelTypeEnum, number>;

const kpiTableByChannelType: {
  bookingsTotalRentalsByChannelType: ChannelTypeMap;
  bookingsRevenueByChannelType: ChannelTypeMap;
  bookingsTicketAverageByChannelType: ChannelTypeMap;
  bookingsRepresentativenessByChannelType: ChannelTypeMap;
} = {
  bookingsTotalRentalsByChannelType: {
    [ChannelTypeEnum.WEBSITE_IMMEDIATE]: 0,
    [ChannelTypeEnum.WEBSITE_SCHEDULED]: 0,
    [ChannelTypeEnum.INTERNAL]: 0,
    [ChannelTypeEnum.GUIA_GO]: 0,
    [ChannelTypeEnum.GUIA_SCHEDULED]: 0,
    [ChannelTypeEnum.BOOKING]: 0,
    [ChannelTypeEnum.EXPEDIA]: 0,
  },
  bookingsRevenueByChannelType: {
    [ChannelTypeEnum.WEBSITE_IMMEDIATE]: 0,
    [ChannelTypeEnum.WEBSITE_SCHEDULED]: 0,
    [ChannelTypeEnum.INTERNAL]: 0,
    [ChannelTypeEnum.GUIA_GO]: 0,
    [ChannelTypeEnum.GUIA_SCHEDULED]: 0,
    [ChannelTypeEnum.BOOKING]: 0,
    [ChannelTypeEnum.EXPEDIA]: 0,
  },
  bookingsTicketAverageByChannelType: {
    [ChannelTypeEnum.WEBSITE_IMMEDIATE]: 0,
    [ChannelTypeEnum.WEBSITE_SCHEDULED]: 0,
    [ChannelTypeEnum.INTERNAL]: 0,
    [ChannelTypeEnum.GUIA_GO]: 0,
    [ChannelTypeEnum.GUIA_SCHEDULED]: 0,
    [ChannelTypeEnum.BOOKING]: 0,
    [ChannelTypeEnum.EXPEDIA]: 0,
  },
  bookingsRepresentativenessByChannelType: {
    [ChannelTypeEnum.WEBSITE_IMMEDIATE]: 0,
    [ChannelTypeEnum.WEBSITE_SCHEDULED]: 0,
    [ChannelTypeEnum.INTERNAL]: 0,
    [ChannelTypeEnum.GUIA_GO]: 0,
    [ChannelTypeEnum.GUIA_SCHEDULED]: 0,
    [ChannelTypeEnum.BOOKING]: 0,
    [ChannelTypeEnum.EXPEDIA]: 0,
  },
};

      // Inicializa o objeto para armazenar contagem e receita
      const channelData = {
        [ChannelTypeEnum.EXPEDIA]: { count: 0, revenue: new Prisma.Decimal(0) },
        [ChannelTypeEnum.BOOKING]: { count: 0, revenue: new Prisma.Decimal(0) },
        [ChannelTypeEnum.GUIA_SCHEDULED]: {
          count: 0,
          revenue: new Prisma.Decimal(0),
        },
        [ChannelTypeEnum.GUIA_GO]: { count: 0, revenue: new Prisma.Decimal(0) },
        [ChannelTypeEnum.INTERNAL]: {
          count: 0,
          revenue: new Prisma.Decimal(0),
        },
        [ChannelTypeEnum.WEBSITE_IMMEDIATE]: {
          count: 0,
          revenue: new Prisma.Decimal(0),
        },
        [ChannelTypeEnum.WEBSITE_SCHEDULED]: {
          count: 0,
          revenue: new Prisma.Decimal(0),
        },
      };

      // Processa cada reserva para contar o tipo de canal e calcular a receita
      for (const booking of allBookings) {
        const channelType = getChannelType(
          booking.originBooking?.id ?? 0,
          booking.dateService,
          booking.startDate,
        );

        // Incrementa o contador e a receita para o tipo de canal correspondente
        if (channelType && channelData[channelType]) {
          channelData[channelType].count++;
          channelData[channelType].revenue = channelData[
            channelType
          ].revenue.plus(new Prisma.Decimal(booking.priceRental || 0));
        }
      }

      // Calcular o total de reservas
      const totalAllBookingsChannelType = Object.values(channelData).reduce(
        (total, { count }) => total + count,
        0,
      );

      // Calcular o total de todos os canais
      const totalAllValueChannelType = Object.values(channelData).reduce(
        (total, { revenue }) => total.plus(revenue),
        new Prisma.Decimal(0),
      );

      // Preenche o objeto kpiTableByChannelType com os dados calculados
      kpiTableByChannelType.bookingsTotalRentalsByChannelType = {
        ...Object.fromEntries(
          Object.entries(channelData).map(([key, { count }]) => [key, count]),
        ),
        // @ts-expect-error: Propriedade adicional TOTALALLBOOKINGS adicionada intencionalmente
        TOTALALLBOOKINGS: totalAllBookingsChannelType,
      };

      kpiTableByChannelType.bookingsRevenueByChannelType = {
        ...Object.fromEntries(
          Object.entries(channelData).map(([key, { revenue }]) => [
            key,
            revenue.toNumber(),
          ]),
        ),
        // @ts-expect-error: Propriedade adicional TOTALALLVALUE adicionada intencionalmente
        TOTALALLVALUE: totalAllValueChannelType.toNumber(),
      };

      // Calcular a média total de todos os canais
      const totalCount = totalAllBookingsChannelType;
      const totalSum = totalAllValueChannelType;

      const totalAllTicketAverageByChannelType =
        totalCount > 0 ? totalSum.dividedBy(totalCount).toNumber() : 0;

      // Calcular o ticket médio por canal
      kpiTableByChannelType.bookingsTicketAverageByChannelType = {
        ...Object.fromEntries(
          Object.entries(channelData).map(([key, { count, revenue }]) => {
            const average = count > 0 ? revenue.dividedBy(count).toNumber() : 0;
            return [key, Number(average.toFixed(2))];
          }),
        ),
        // @ts-expect-error: Propriedade adicional TOTALALLTICKETAVERAGE adicionada intencionalmente
        TOTALALLTICKETAVERAGE: Number(
          totalAllTicketAverageByChannelType.toFixed(2),
        ),
      };

      // Calcular a receita total (vendas diretas + locações)
      const totalAllRevenue = totalSaleDirect.plus(
        allRentalApartments.reduce((total, apartment) => {
          return total.plus(new Prisma.Decimal(apartment.totalValue || 0)); // Adiciona 0 se totalValue for nulo
        }, new Prisma.Decimal(0)),
      );

      // Calcular a representatividade para cada canal
      const representativenessByChannel = {};
      let totalAllRepresentativenessByChannelType = new Prisma.Decimal(0); // Inicializa a representatividade total

      for (const [channelType, { revenue }] of Object.entries(channelData)) {
        const representativeness =
          totalAllRevenue && !totalAllRevenue.isZero() // Se a receita total for 0 ou null
            ? revenue.dividedBy(totalAllRevenue).toNumber() // Receita do canal dividido pela receita total
            : 0; // Se totalRevenue for null ou zero, retorna 0

        // Corrigido: representativeness pode ser number, então só chama toFixed se for number
        // Adiciona assinatura de índice para evitar erro de tipagem
        (representativenessByChannel as Record<string, number>)[channelType] = 
          typeof representativeness === 'number'
            ? Number(representativeness.toFixed(2))
            : 0;

        // Acumula a representatividade total
        totalAllRepresentativenessByChannelType =
          totalAllRepresentativenessByChannelType.plus(
            revenue || new Prisma.Decimal(0),
          ); // Se revenue for null, usa 0
      }

      // Calcular o totalAllRepresentativeness
      const finalTotalAllRepresentativeness =
        totalAllRevenue && !totalAllRevenue.isZero()
          ? totalAllRepresentativenessByChannelType
              .dividedBy(totalAllRevenue)
              .toNumber()
          : 0;

      // Adiciona a representatividade ao objeto kpiTableByChannelType
      kpiTableByChannelType.bookingsRepresentativenessByChannelType = {
        ...representativenessByChannel,
        TOTALALLREPRESENTATIVENESS: Number(finalTotalAllRepresentativeness.toFixed(2)),
      } as Record<string, number>;
      

      const bigNumbersEcommerce = {
        currentDate: {
          // Captura a soma de totalAllValue
          totalAllValue:
            (kpiTableByChannelType.bookingsRevenueByChannelType[ChannelTypeEnum.WEBSITE_IMMEDIATE] ?? 0) +
            (kpiTableByChannelType.bookingsRevenueByChannelType[ChannelTypeEnum.WEBSITE_SCHEDULED] ?? 0),
      
          // Captura a soma de totalAllBookings
          totalAllBookings:
            (kpiTableByChannelType.bookingsTotalRentalsByChannelType[ChannelTypeEnum.WEBSITE_IMMEDIATE] ?? 0) +
            (kpiTableByChannelType.bookingsTotalRentalsByChannelType[ChannelTypeEnum.WEBSITE_SCHEDULED] ?? 0),
      
          // Captura a soma de totalAllTicketAverage
          totalAllTicketAverage: (() => {
            const totalValue =
              (kpiTableByChannelType.bookingsRevenueByChannelType[ChannelTypeEnum.WEBSITE_IMMEDIATE] ?? 0) +
              (kpiTableByChannelType.bookingsRevenueByChannelType[ChannelTypeEnum.WEBSITE_SCHEDULED] ?? 0);
      
            const totalBookings =
              (kpiTableByChannelType.bookingsTotalRentalsByChannelType[ChannelTypeEnum.WEBSITE_IMMEDIATE] ?? 0) +
              (kpiTableByChannelType.bookingsTotalRentalsByChannelType[ChannelTypeEnum.WEBSITE_SCHEDULED] ?? 0);
      
            return totalBookings > 0 ? Number((totalValue / totalBookings).toFixed(2)) : 0;
          })(),
      
          // Captura a soma de totalAllRepresentativeness
          totalAllRepresentativeness:
            (kpiTableByChannelType.bookingsRepresentativenessByChannelType[ChannelTypeEnum.WEBSITE_IMMEDIATE] ?? 0) +
            (kpiTableByChannelType.bookingsRepresentativenessByChannelType[ChannelTypeEnum.WEBSITE_SCHEDULED] ?? 0),
        },
      };      

      const reservationsOfEcommerceByPeriod = {
        categories: [],
        series: [],
      };

      // Ajustar a endDate para o início do dia seguinte
      const adjustedEndDateBookingEcommerce = moment(endDate)
        .utc()
        .startOf('day'); // Define o início do dia da endDate

      // Iniciar currentDate no início do dia da startDate
      let currentDateBookingEcommerce = moment(startDate).utc().startOf('day'); // Início do dia contábil às 00:00:00

      // Iterar sobre as datas do período
      while (
        currentDateBookingEcommerce.isSameOrBefore(
          adjustedEndDateBookingEcommerce,
          'day',
        )
      ) {
        const nextDateBookingEcommerce = currentDateBookingEcommerce
          .clone()
          .add(1, 'day'); // Clona currentDateRep e avança um dia

        const dateKey = currentDateBookingEcommerce.format('DD/MM/YYYY'); // Formata a data como "YYYY-MM-DD"

        // Contar o total de reservas para a data atual
        const totalBookingsForCurrentPeriod = allBookingsEcommerce.reduce(
          (total, booking) => {
            const bookingDate = moment.utc(booking.dateService);
            return bookingDate.isBetween(
              currentDateBookingEcommerce,
              nextDateBookingEcommerce,
              null,
              '[]',
            )
              ? total + 1 // Incrementa o total se a data do booking estiver no intervalo
              : total;
          },
          0,
        );

        // Adiciona o resultado ao objeto de resultados
        (reservationsOfEcommerceByPeriod.categories as string[]).push(dateKey);
        (reservationsOfEcommerceByPeriod.series as number[]).push(
          totalBookingsForCurrentPeriod,
        );

        // Avança para o próximo dia
        currentDateBookingEcommerce = nextDateBookingEcommerce; // Atualiza currentDateRep para o próximo dia
      }

      // Inverter a ordem das categorias e séries para ficar em ordem decrescente
      reservationsOfEcommerceByPeriod.categories.reverse();
      reservationsOfEcommerceByPeriod.series.reverse();

      const billingOfEcommerceByPeriod = {
        categories: [],
        series: [],
      };

      // Supondo que você tenha startDate e endDate definidos como moment.js
      let currentDateEcommerce = moment(startDate).utc();
      const finalDateEcommerce = moment(endDate).utc();

      // Iterar sobre as datas do período
      while (currentDateEcommerce.isSameOrBefore(finalDateEcommerce, 'day')) {
        const dateKeyEcommerce = currentDateEcommerce.format('DD/MM/YYYY'); // Formata a data como "DD/MM/YYYY"
        let totalValueForCurrentDate = new Prisma.Decimal(0); // Inicializa o total para a data atual

        // Calcular o total para a data atual
        allBookingsEcommerce.forEach((booking) => {
          const bookingDate = moment.utc(booking.dateService);

          // Se a data do booking corresponder à data atual, soma o priceRental
          if (bookingDate.isSame(currentDateEcommerce, 'day')) {
            totalValueForCurrentDate = totalValueForCurrentDate.plus(
              new Prisma.Decimal(booking.priceRental || 0),
            );
          }
        });

        // Adiciona a data e o total ao objeto de retorno
        (billingOfEcommerceByPeriod.categories as string[]).push(dateKeyEcommerce);
        (billingOfEcommerceByPeriod.series as number[]).push(
          totalValueForCurrentDate.toNumber(),
        ); // Converte para número

        // P0-003: Memory leak fix - increment using assignment instead of mutation
        currentDateEcommerce = currentDateEcommerce.clone().add(1, 'day');
      }

      // Inverter a ordem das categorias e séries para ficar em ordem decrescente
      billingOfEcommerceByPeriod.categories.reverse();
      billingOfEcommerceByPeriod.series.reverse();

      return {
        Company: 'Lush Ipiranga',
        BigNumbers: [bigNumbers],
        PaymentMethods: paymentMethods,
        BillingPerChannel: billingPerChannel,
        ReservationsByRentalType: reservationsByRentalType,
        BillingOfReservationsByPeriod: billingOfReservationsByPeriod,
        RepresentativenessOfReservesByPeriod:
          representativenessOfReservesByPeriod,
        NumberOfReservationsPerPeriod: numberOfReservationsPerPeriod,
        KpiTableByChannelType: [kpiTableByChannelType],
        BigNumbersEcommerce: [bigNumbersEcommerce],
        ReservationsOfEcommerceByPeriod: reservationsOfEcommerceByPeriod,
        BillingOfEcommerceByPeriod: billingOfEcommerceByPeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular os KPIs:', error);
      throw new BadRequestException();
    }
  }

  async calculateKpibyDateRangeSQL(
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    const formattedStart = moment
      .utc(startDate)
      .set({ hour: 0, minute: 0, second: 0 })
      .format('YYYY-MM-DD HH:mm:ss');

    const formattedEnd = moment
      .utc(endDate)
      .set({ hour: 23, minute: 59, second: 59 })
      .format('YYYY-MM-DD HH:mm:ss');

    const totalBookingRevenueSQL = `
  SELECT
  COALESCE(r."id_tipoorigemreserva", 0) AS "id_tipoorigemreserva",
  ROUND(SUM(r."valorcontratado")::numeric, 2) AS "totalAllValue"
FROM "reserva" r
WHERE
  r."cancelada" IS NULL
  AND r."valorcontratado" IS NOT NULL
  AND (
    (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}')
    OR
    (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}')
  )
GROUP BY ROLLUP (r."id_tipoorigemreserva")
HAVING r."id_tipoorigemreserva" IN (1, 3, 4, 6, 7, 8) OR r."id_tipoorigemreserva" IS NULL
ORDER BY "id_tipoorigemreserva";
`;

    const totalBookingCountSQL = `
  SELECT
  COALESCE(r."id_tipoorigemreserva", 0) AS "id_tipoorigemreserva",
  COUNT(r."id") AS "totalAllBookings"
FROM "reserva" r
WHERE
  r."cancelada" IS NULL
  AND r."valorcontratado" IS NOT NULL
  AND (
    (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}')
    OR
    (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}')
  )
GROUP BY ROLLUP (r."id_tipoorigemreserva")
HAVING r."id_tipoorigemreserva" IN (1, 3, 4, 6, 7, 8) OR r."id_tipoorigemreserva" IS NULL
ORDER BY "id_tipoorigemreserva";
`;

    const totalRevenueSQL = `
WITH vendas_diretas AS (
  SELECT COALESCE(SUM((sei."precovenda" * sei."quantidade") - COALESCE(v."desconto", 0)), 0) AS total
  FROM "saidaestoqueitem" sei
  JOIN "saidaestoque" se ON sei."id_saidaestoque" = se."id"
  JOIN "vendadireta" vd ON se."id" = vd."id_saidaestoque"
  LEFT JOIN "venda" v ON se."id" = v."id_saidaestoque"
  WHERE se."datasaida" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND sei."cancelado" IS NULL
    AND sei."tipoprecovenda" IS NOT NULL
),
locacoes AS (
  SELECT COALESCE(SUM(la."valortotal"), 0) AS total
  FROM "locacaoapartamento" la
  JOIN "apartamentostate" ast ON la."id_apartamentostate" = ast."id"
  WHERE ast."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND la."fimocupacaotipo" = 'FINALIZADA'
)
SELECT
  ROUND((COALESCE(vd.total, 0) + COALESCE(loc.total, 0))::numeric, 2) AS "totalRevenue"
FROM vendas_diretas vd, locacoes loc;
`;

    const paymentMethodsSQL = `
  WITH reservas_com_pagamento AS (
    -- Reservas que JÁ têm lançamentos do tipo RESERVA
    SELECT DISTINCT r."id" as reserva_id
    FROM "reserva" r
    JOIN "novo_lancamento" nl ON r."id" = nl."id_originado"
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND nl."dataexclusao" IS NULL
      AND nl."tipolancamento" = 'RESERVA'
      AND nl."id_contapagarreceber" IS NULL
      AND (
        (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}')
        OR
        (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}')
      )
  ),
  pagamentos_reserva AS (
    -- Lançamentos do tipo RESERVA (usa valor contratado com desconto para Guia Go)
    SELECT
      mp."nome" AS "paymentMethod",
      CASE
        WHEN r."id_tipoorigemreserva" = 3 AND r."reserva_programada_guia" = false THEN
          r."valorcontratado" - COALESCE(r."desconto_reserva", 0)
        ELSE
          r."valorcontratado"
      END AS "valor",
      r."id" as reserva_id
    FROM "reserva" r
    JOIN "novo_lancamento" nl ON r."id" = nl."id_originado"
    JOIN "meiopagamento" mp ON nl."id_meiopagamento" = mp."id"
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND nl."dataexclusao" IS NULL
      AND nl."tipolancamento" = 'RESERVA'
      AND nl."id_contapagarreceber" IS NULL
      AND mp."dataexclusao" IS NULL
      AND (
        (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}')
        OR
        (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}')
      )
  ),
  pagamentos_locacao AS (
    -- Lançamentos do tipo LOCACAO apenas para reservas SEM lançamento RESERVA
    SELECT
      mp."nome" AS "paymentMethod",
      nl."valor" AS "valor",
      r."id" as reserva_id
    FROM "reserva" r
    JOIN "novo_lancamento" nl ON r."id" = nl."id_originado"
    JOIN "meiopagamento" mp ON nl."id_meiopagamento" = mp."id"
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND nl."dataexclusao" IS NULL
      AND nl."tipolancamento" = 'LOCACAO'
      AND nl."id_contapagarreceber" IS NULL
      AND mp."dataexclusao" IS NULL
      AND r."id" NOT IN (SELECT reserva_id FROM reservas_com_pagamento)
      AND (
        (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}')
        OR
        (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}')
      )
  ),
  todos_pagamentos AS (
    SELECT "paymentMethod", "valor", reserva_id FROM pagamentos_reserva
    UNION ALL
    SELECT "paymentMethod", "valor", reserva_id FROM pagamentos_locacao
  )
  SELECT
    "paymentMethod",
    ROUND(SUM("valor")::numeric, 2) AS "totalValue",
    COUNT(DISTINCT reserva_id) AS "quantidadeReservas"
  FROM todos_pagamentos
  GROUP BY "paymentMethod"
  ORDER BY "totalValue" DESC;
`;

    const rentalTypeSQL = `
  SELECT
    r."id",
    r."dataatendimento",
    r."datainicio",
    CASE
      WHEN r."id_tipoorigemreserva" = 3 AND r."reserva_programada_guia" = false THEN
        r."valorcontratado" - COALESCE(r."desconto_reserva", 0)
      ELSE
        r."valorcontratado"
    END AS "valorcontratado",
    r."id_tipoorigemreserva",
    r."id_locacaoapartamento" AS "rentalApartmentId",
    la."datainicialdaocupacao" AS "checkIn",
    la."datafinaldaocupacao" AS "checkOut"
  FROM "reserva" r
  LEFT JOIN "locacaoapartamento" la ON r."id_locacaoapartamento" = la."id_apartamentostate"
  WHERE r."cancelada" IS NULL
    AND r."valorcontratado" IS NOT NULL
    AND (
      (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}')
      OR
      (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}')
    );
`;

    // SQL para obter dados agrupados por data para os períodos
    const billingByDateSQL = `
  SELECT
    DATE(CASE
      WHEN r."id_tipoorigemreserva" IN (7, 8) THEN r."datainicio"
      ELSE r."dataatendimento"
    END) as booking_date,
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
      (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}')
      OR
      (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}')
    )
    AND DATE(CASE
      WHEN r."id_tipoorigemreserva" IN (7, 8) THEN r."datainicio"
      ELSE r."dataatendimento"
    END) BETWEEN DATE('${formattedStart}') AND DATE('${formattedEnd}')
  GROUP BY booking_date
  ORDER BY booking_date DESC;
`;

    // SQL para dados de ecommerce por data (canal 4 = RESERVA_API)
    const ecommerceByDateSQL = `
  SELECT
    DATE(CASE
      WHEN r."id_tipoorigemreserva" IN (7, 8) THEN r."datainicio"
      ELSE r."dataatendimento"
    END) as booking_date,
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
      (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}')
      OR
      (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}')
    )
    AND DATE(CASE
      WHEN r."id_tipoorigemreserva" IN (7, 8) THEN r."datainicio"
      ELSE r."dataatendimento"
    END) BETWEEN DATE('${formattedStart}') AND DATE('${formattedEnd}')
  GROUP BY booking_date
  ORDER BY booking_date DESC;
`;

    // Query SQL para classificação refinada de canais (sem AIRBNB, com desconto Guia Go)
    const billingPerChannelSQL = `
  WITH reservas_com_canal_refinado AS (
    SELECT
      r."id",
      CASE
        WHEN r."id_tipoorigemreserva" = 3 AND r."reserva_programada_guia" = false THEN
          r."valorcontratado" - COALESCE(r."desconto_reserva", 0)
        ELSE
          r."valorcontratado"
      END AS "valorcontratado",
      r."id_tipoorigemreserva",
      r."datainicio",
      r."dataatendimento",
      r."reserva_programada_guia",
      CASE
        WHEN r."id_tipoorigemreserva" = 1 THEN 'INTERNAL'
        WHEN r."id_tipoorigemreserva" = 6 THEN 'INTERNAL'
        WHEN r."id_tipoorigemreserva" = 7 THEN 'BOOKING'
        WHEN r."id_tipoorigemreserva" = 8 THEN 'EXPEDIA'
        WHEN r."id_tipoorigemreserva" = 10 THEN 'GIFT_CARD'
        WHEN r."id_tipoorigemreserva" = 3 THEN
          CASE
            WHEN COALESCE(r."reserva_programada_guia", false) = true THEN 'GUIA_SCHEDULED'
            ELSE 'GUIA_GO'
          END
        WHEN r."id_tipoorigemreserva" = 4 THEN
          CASE
            -- Verifica se a hora é "fechada" (20:00, 15:00, 13:00) - reserva programada
            WHEN EXTRACT(HOUR FROM r."datainicio") IN (20, 15, 13)
                 AND EXTRACT(MINUTE FROM r."datainicio") = 0
                 AND EXTRACT(SECOND FROM r."datainicio") = 0 THEN 'WEBSITE_SCHEDULED'
            ELSE 'WEBSITE_IMMEDIATE'
          END
        ELSE CONCAT('CANAL_', r."id_tipoorigemreserva")
      END AS channel_type
    FROM "reserva" r
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND (
        (r."id_tipoorigemreserva" NOT IN (7, 8) AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}')
        OR
        (r."id_tipoorigemreserva" IN (7, 8) AND r."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}')
      )
  )
  SELECT
    channel_type,
    ROUND(SUM("valorcontratado")::numeric, 2) AS "totalValue",
    COUNT(*) AS "totalBookings"
  FROM reservas_com_canal_refinado
  GROUP BY channel_type
  ORDER BY "totalValue" DESC;
`;

    const [bookingRevenue, bookingCount, totalRevenue, paymentMethodsData, rentalTypeData, billingPerChannelData, billingByDateData, ecommerceByDateData] = await Promise.all([
      this.prisma.prismaLocal.$queryRaw<any[]>(
        Prisma.sql([totalBookingRevenueSQL]),
      ),
      this.prisma.prismaLocal.$queryRaw<any[]>(
        Prisma.sql([totalBookingCountSQL]),
      ),
      this.prisma.prismaLocal.$queryRaw<any[]>(
        Prisma.sql([totalRevenueSQL]),
      ),
      this.prisma.prismaLocal.$queryRaw<any[]>(
        Prisma.sql([paymentMethodsSQL]),
      ),
      this.prisma.prismaLocal.$queryRaw<any[]>(
        Prisma.sql([rentalTypeSQL]),
      ),
      this.prisma.prismaLocal.$queryRaw<any[]>(
        Prisma.sql([billingPerChannelSQL]),
      ),
      this.prisma.prismaLocal.$queryRaw<any[]>(
        Prisma.sql([billingByDateSQL]),
      ),
      this.prisma.prismaLocal.$queryRaw<any[]>(
        Prisma.sql([ecommerceByDateSQL]),
      ),
    ]);

    const totalLineRevenue = bookingRevenue.find(
      (r: any) => r.id_tipoorigemreserva === null || r.id_tipoorigemreserva === 0,
    );

    const totalLineCount = bookingCount.find(
      (r: any) => r.id_tipoorigemreserva === null || r.id_tipoorigemreserva === 0,
    );

    // Calcula o ticket médio
    const totalValue = Number(totalLineRevenue?.totalAllValue ?? 0);
    const totalBookings = Number(totalLineCount?.totalAllBookings ?? 0);
    const ticketAverage = totalBookings > 0 ? Number((totalValue / totalBookings).toFixed(2)) : 0;

    // Extrai a receita total
    const revenueTotal = Number(totalRevenue[0]?.totalRevenue ?? 0);

    // Calcula a representatividade
    const representativeness = revenueTotal > 0
      ? Number((totalValue / revenueTotal).toFixed(4))
      : 0;

    // Processa os dados dos métodos de pagamento
    const paymentMethods = {
      categories: paymentMethodsData.map((item: any) => item.paymentMethod),
      series: paymentMethodsData.map((item: any) => Number(item.totalValue)),
    };

    // Definir todas as categorias de canal possíveis na ordem desejada
    const allChannelCategories = [
      'EXPEDIA',
      'BOOKING',
      'GUIA_SCHEDULED',
      'GUIA_GO',
      'INTERNAL',
      'WEBSITE_IMMEDIATE',
      'WEBSITE_SCHEDULED'
    ];

    // Criar mapa dos dados retornados da query
    const channelDataMap = new Map();
    billingPerChannelData.forEach((item: any) => {
      channelDataMap.set(item.channel_type, Number(item.totalValue));
    });

    // Garantir que todas as categorias sejam incluídas, mesmo com valor 0
    const billingPerChannel = {
      categories: allChannelCategories,
      series: allChannelCategories.map(category => channelDataMap.get(category) || 0),
    };

    // Processa os tipos de locação usando a lógica existente
    const rentalCounts = {
      'THREE_HOURS': 0,
      'SIX_HOURS': 0,
      'TWELVE_HOURS': 0,
      'DAY_USE': 0,
      'OVERNIGHT': 0,
      'DAILY': 0,
    };

    let validRecordsCount = 0;
    let invalidRecordsCount = 0;

    // Objetos para armazenar receita por tipo de reserva
    const rentalRevenue = {
      'THREE_HOURS': 0,
      'SIX_HOURS': 0,
      'TWELVE_HOURS': 0,
      'DAY_USE': 0,
      'OVERNIGHT': 0,
      'DAILY': 0,
    };

    // Calcula o tipo de locação para cada reserva
    rentalTypeData.forEach((booking: any) => {
      if (booking.datainicio) {
        validRecordsCount++;

        // Primeiro verifica se é um período programado (dayuse, daily, overnight)
        const dataInicio = new Date(booking.datainicio);
        const hora = dataInicio.getHours();

        let rentalType = '';

        // Períodos programados - não precisa calcular encerramento_previsto
        if (hora === 13) {
          rentalType = 'DAY_USE'; // 13:00 - Dayuse
        } else if (hora === 20) {
          rentalType = 'OVERNIGHT'; // 20:00 - Pernoite
        } else if (hora === 15) {
          rentalType = 'DAILY'; // 15:00 - Diária
        } else {
          // Para períodos imediatos, usa checkIn/checkOut da locacaoapartamento
          if (booking.checkIn && booking.checkOut) {
              const checkInDate = new Date(booking.checkIn);
            const checkOutDate = new Date(booking.checkOut);
            rentalType = this.determineRentalPeriod(checkInDate, checkOutDate, rentalTypeData);
          } else {
            // Default para THREE_HOURS quando não tem locacaoapartamento vinculada
            rentalType = 'THREE_HOURS';
          }
        }

        if (rentalCounts[rentalType as keyof typeof rentalCounts] !== undefined) {
          rentalCounts[rentalType as keyof typeof rentalCounts]++;
          // Acumula também a receita por tipo
          rentalRevenue[rentalType as keyof typeof rentalRevenue] += Number(booking.valorcontratado || 0);
        }
      } else {
        invalidRecordsCount++;
      }
    });

    const reservationsByRentalType = {
      categories: Object.keys(rentalCounts),
      series: Object.values(rentalCounts),
    };

    // Cria KpiTableByChannelType consolidado
    const kpiTableByChannelType = {
      bookingsTotalRentalsByChannelType: {} as Record<string, number>,
      bookingsRevenueByChannelType: {} as Record<string, number>,
      bookingsTicketAverageByChannelType: {} as Record<string, number>,
      bookingsRepresentativenessByChannelType: {} as Record<string, number>,
    };

    // Popula dados por canal usando dados refinados de classificação
    let totalChannelBookings = 0;
    let totalChannelRevenue = 0;

    billingPerChannelData.forEach((channelItem: any) => {
      const channelName = channelItem.channel_type;
      const revenue = Number(channelItem.totalValue);
      const count = Number(channelItem.totalBookings);

      // Calcula ticket médio
      const ticketAverage = count > 0 ? Number((revenue / count).toFixed(2)) : 0;

      // Calcula representatividade
      const representativeness = revenueTotal > 0 ? Number((revenue / revenueTotal).toFixed(4)) : 0;

      // Popula os dados
      kpiTableByChannelType.bookingsTotalRentalsByChannelType[channelName] = count;
      kpiTableByChannelType.bookingsRevenueByChannelType[channelName] = Number(revenue.toFixed(2));
      kpiTableByChannelType.bookingsTicketAverageByChannelType[channelName] = ticketAverage;
      kpiTableByChannelType.bookingsRepresentativenessByChannelType[channelName] = representativeness;

      totalChannelBookings += count;
      totalChannelRevenue += revenue;
    });

    // Adiciona totais
    kpiTableByChannelType.bookingsTotalRentalsByChannelType['TOTALALLBOOKINGS'] = totalChannelBookings;
    kpiTableByChannelType.bookingsRevenueByChannelType['TOTALALLVALUE'] = Number(totalChannelRevenue.toFixed(2));
    kpiTableByChannelType.bookingsTicketAverageByChannelType['TOTALALLTICKETAVERAGE'] =
      totalChannelBookings > 0 ? Number((totalChannelRevenue / totalChannelBookings).toFixed(2)) : 0;
    kpiTableByChannelType.bookingsRepresentativenessByChannelType['TOTALALLREPRESENTATIVENESS'] =
      revenueTotal > 0 ? Number((totalChannelRevenue / revenueTotal).toFixed(4)) : 0;

    // Calcula BigNumbersEcommerce (soma WEBSITE_IMMEDIATE + WEBSITE_SCHEDULED)
    const ecommerceRevenueImediata = kpiTableByChannelType.bookingsRevenueByChannelType['WEBSITE_IMMEDIATE'] || 0;
    const ecommerceRevenueProgramada = kpiTableByChannelType.bookingsRevenueByChannelType['WEBSITE_SCHEDULED'] || 0;
    const ecommerceRevenue = ecommerceRevenueImediata + ecommerceRevenueProgramada;

    const ecommerceBookingsImediata = kpiTableByChannelType.bookingsTotalRentalsByChannelType['WEBSITE_IMMEDIATE'] || 0;
    const ecommerceBookingsProgramada = kpiTableByChannelType.bookingsTotalRentalsByChannelType['WEBSITE_SCHEDULED'] || 0;
    const ecommerceBookings = ecommerceBookingsImediata + ecommerceBookingsProgramada;

    const ecommerceTicketAverage = ecommerceBookings > 0 ? Number((ecommerceRevenue / ecommerceBookings).toFixed(2)) : 0;
    const ecommerceRepresentativeness = revenueTotal > 0 ? Number((ecommerceRevenue / revenueTotal).toFixed(4)) : 0;

    const bigNumbersEcommerce = {
      currentDate: {
        totalAllValue: ecommerceRevenue,
        totalAllBookings: ecommerceBookings,
        totalAllTicketAverage: ecommerceTicketAverage,
        totalAllRepresentativeness: ecommerceRepresentativeness,
      },
    };

    // Gera array completo de datas no período solicitado
    const periodsArray: string[] = [];
    let currentDate = moment(startDate).utc();
    const finalDate = moment(endDate).utc();

    while (currentDate.isSameOrBefore(finalDate, 'day')) {
      periodsArray.push(currentDate.format('DD/MM/YYYY'));
      currentDate.add(1, 'day');
    }

    // Cria mapeamento de dados por data
    const billingDataMap = new Map();
    billingByDateData.forEach((item: any) => {
      const dateKey = new Date(item.booking_date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      billingDataMap.set(dateKey, item);
    });

    const ecommerceDataMap = new Map();
    ecommerceByDateData.forEach((item: any) => {
      const dateKey = new Date(item.booking_date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      ecommerceDataMap.set(dateKey, item);
    });

    // Calcula dados por período de data (dia a dia) baseado na lógica original
    const billingOfReservationsByPeriod = {
      categories: [...periodsArray], // Ordem crescente (01/07 até 31/07)
      series: [...periodsArray].map((dateKey: string) => {
        const item = billingDataMap.get(dateKey);
        return item ? Number(item.total_value) : 0;
      }),
    };

    const representativenessOfReservesByPeriod = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = billingDataMap.get(dateKey);
        const dayRevenue = item ? Number(item.total_value) : 0;
        return totalValue > 0 ? Number((dayRevenue / totalValue).toFixed(2)) : 0;
      }),
    };

    const numberOfReservationsPerPeriod = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = billingDataMap.get(dateKey);
        return item ? Number(item.total_bookings) : 0;
      }),
    };

    const reservationsOfEcommerceByPeriod = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = ecommerceDataMap.get(dateKey);
        return item ? Number(item.total_bookings) : 0;
      }),
    };

    const billingOfEcommerceByPeriod = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = ecommerceDataMap.get(dateKey);
        return item ? Number(item.total_value) : 0;
      }),
    };

    const bigNumbers = {
      currentDate: {
        totalAllValue: totalValue,
        totalAllBookings: totalBookings,
        totalAllTicketAverage: ticketAverage,
        totalAllRepresentativeness: representativeness,
      },
    };

    return {
      Company: 'Lush Ipiranga',
      BigNumbers: [bigNumbers],
      PaymentMethods: paymentMethods,
        BillingPerChannel: billingPerChannel,
        ReservationsByRentalType: reservationsByRentalType,
        BillingOfReservationsByPeriod: billingOfReservationsByPeriod,
        RepresentativenessOfReservesByPeriod:
          representativenessOfReservesByPeriod,
        NumberOfReservationsPerPeriod: numberOfReservationsPerPeriod,
        KpiTableByChannelType: [kpiTableByChannelType],
        BigNumbersEcommerce: [bigNumbersEcommerce],
        ReservationsOfEcommerceByPeriod: reservationsOfEcommerceByPeriod,
        BillingOfEcommerceByPeriod: billingOfEcommerceByPeriod,
    };
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

  private calculateOccupationTime(checkIn: Date, checkOut: Date): number {
    const checkInTime = new Date(checkIn).getTime();
    const checkOutTime = new Date(checkOut).getTime();
    return (checkOutTime - checkInTime) / 1000; // Tempo em segundos
  }
}

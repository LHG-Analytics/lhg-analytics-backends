import { Injectable } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { PeriodEnum } from '../../dist/generated/client-online';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingsService {
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
    console.log('startDate:', startDate);
    console.log('endDate:', endDate);
    console.log('startDatePrevious:', startDatePrevious);
    console.log('endDatePrevious:', endDatePrevious);

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
      BookingsTicketAverageByChannelTypeEcommerce,
      BookingsTicketAverageByChannelTypeEcommercePrevious,
      BookingsRepresentativenessByChannelTypeEcommerce,
      BookingsRepresentativenessByChannelTypeEcommercePrevious,
      BookingsTotalRentalsByPeriodEcommerce,
      BookingsRevenueByPeriodEcommerce,
    ] = await this.prisma.prismaOnline.$transaction([
      this.prisma.prismaOnline.bookingsRevenue.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
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
            gte: startDate,
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
            gte: startDate,
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
            gte: startDate,
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
            gte: startDate,
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
            gte: startDate,
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
            gte: startDate,
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
              gte: startDate,
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
            gte: startDate,
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
            gte: startDate,
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
      this.prisma.prismaOnline.bookingsTicketAverageByChannelType.aggregate({
        _sum: {
          totalTicketAverage: true,
        },
        where: {
          period: period,
          createdDate: {
            gte: startDate,
          },
          channelType: {
            in: ['WEBSITE_IMMEDIATE', 'WEBSITE_SCHEDULED'], // Filtra apenas os canais desejados
          },
        },
      }),
      this.prisma.prismaOnline.bookingsTicketAverageByChannelType.aggregate({
        _sum: {
          totalTicketAverage: true,
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
      this.prisma.prismaOnline.bookingsRepresentativenessByChannelType.aggregate(
        {
          _sum: {
            totalRepresentativeness: true,
          },
          where: {
            period: period,
            createdDate: {
              gte: startDate,
            },
            channelType: {
              in: ['WEBSITE_IMMEDIATE', 'WEBSITE_SCHEDULED'], // Filtra apenas os canais desejados
            },
          },
        },
      ),
      this.prisma.prismaOnline.bookingsRepresentativenessByChannelType.aggregate(
        {
          _sum: {
            totalRepresentativeness: true,
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
        },
      ),
      this.prisma.prismaOnline.bookingsTotalRentalsByPeriodEcommerce.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
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

    const billingOfReservationsByPeriod = {
      categories: BookingsRevenueByPeriod.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: BookingsRevenueByPeriod.map((item) => Number(item.totalValue)),
    };

    const representativenessOfReservesByPeriod = {
      categories: BookingsRepresentativenessByPeriod.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: BookingsRepresentativenessByPeriod.map((item) =>
        Number(item.totalRepresentativeness),
      ),
    };

    const numberOfReservationsPerPeriod = {
      categories: BookingsTotalRentalsByPeriod.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: BookingsTotalRentalsByPeriod.map((item) =>
        Number(item.totalBookings),
      ),
    };

    const kpiTableByChannelType = {
      bookingsTotalRentalsByChannelType: {},
      bookingsRevenueByChannelType: {},
      bookingsTicketAverageByChannelType: {},
      bookingsRepresentativenessByChannelType: {},
    };

    // Preencher bookingsTotalRentalsByChannelType
    BookingsTotalRentalsByChannelType.forEach((item) => {
      kpiTableByChannelType.bookingsTotalRentalsByChannelType[
        item.channelType
      ] = Number(item.totalBookings);
    });

    // Adiciona o total de bookings
    if (BookingsTotalRentalsByChannelType.length > 0) {
      kpiTableByChannelType.bookingsTotalRentalsByChannelType[
        'TOTALALLBOOKINGS'
      ] = Number(BookingsTotalRentalsByChannelType[0].totalAllBookings);
    }

    // Preencher bookingsRevenueByChannelType
    BookingsRevenueByChannelType.forEach((item) => {
      kpiTableByChannelType.bookingsRevenueByChannelType[item.channelType] =
        Number(item.totalValue); // Garantir que seja um número
    });

    // Adiciona o total de revenue
    if (BookingsRevenueByChannelType.length > 0) {
      kpiTableByChannelType.bookingsRevenueByChannelType['TOTALALLVALUE'] =
        Number(BookingsRevenueByChannelType[0].totalAllValue); // Garantir que seja um número
    }

    // Preencher bookingsTicketAverageByChannelType
    BookingsTicketAverageByChannelType.forEach((item) => {
      kpiTableByChannelType.bookingsTicketAverageByChannelType[
        item.channelType
      ] = Number(item.totalTicketAverage); // Garantir que seja um número
    });

    // Adiciona o total de ticket average
    if (BookingsTicketAverageByChannelType.length > 0) {
      kpiTableByChannelType.bookingsTicketAverageByChannelType[
        'TOTALALLTICKETAVERAGE'
      ] = Number(BookingsTicketAverageByChannelType[0].totalAllTicketAverage); // Garantir que seja um número
    }

    // Preencher bookingsRepresentativenessByChannelType
    BookingsRepresentativenessByChannelType.forEach((item) => {
      kpiTableByChannelType.bookingsRepresentativenessByChannelType[
        item.channelType
      ] = Number(item.totalRepresentativeness); // Garantir que seja um número
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
          BookingsTicketAverageByChannelTypeEcommerce._sum.totalTicketAverage.dividedBy(
            2,
          ) || 0,
        ),

        totalAllRepresentativeness: Number(
          BookingsRepresentativenessByChannelTypeEcommerce._sum
            .totalRepresentativeness || 0,
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
          BookingsTicketAverageByChannelTypeEcommercePrevious._sum.totalTicketAverage.dividedBy(
            2,
          ) || 0,
        ),

        totalAllRepresentativenessPreviousData: Number(
          BookingsRepresentativenessByChannelTypeEcommercePrevious._sum
            .totalRepresentativeness ?? 0,
        ),
      },
    };

    const reservationsOfEcommerceByPeriod = {
      categories: BookingsTotalRentalsByPeriodEcommerce.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: BookingsTotalRentalsByPeriodEcommerce.map((item) =>
        Number(item.totalBookings),
      ),
    };

    const billingOfEcommerceByPeriod = {
      categories: BookingsRevenueByPeriodEcommerce.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: BookingsRevenueByPeriodEcommerce.map((item) =>
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
}

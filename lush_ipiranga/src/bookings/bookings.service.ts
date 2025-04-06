import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as moment from 'moment-timezone';
import {
  ChannelTypeEnum,
  PeriodEnum,
  Prisma,
  RentalTypeEnum,
} from '../../dist/generated/client-online';
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
      BookingsTotalRentalsByPeriodEcommerce,
      BookingsRevenueByPeriodEcommerce,
      KpiRevenue,
      KpiRevenuePreviousData,
    ] = await this.prisma.prismaOnline.$transaction([
      this.prisma.prismaOnline.bookingsRevenue.findMany({
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
            lte: endDate,
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
            lte: endDate,
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
            lte: endDate,
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
            lte: endDate,
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
            lte: endDate,
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
            gte: startDate,
            lte: endDate,
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
            lte: endDate,
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
              lte: endDate,
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
            lte: endDate,
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
          (
            BookingsRevenueByChannelTypeEcommerce._sum.totalValue.dividedBy(
              BookingsTotalRentalsByChannelTypeEcommerce._sum.totalBookings,
            ) || 0
          ).toFixed(2),
        ),

        totalAllRepresentativeness: Number(
          (
            BookingsRevenueByChannelTypeEcommerce._sum.totalValue.dividedBy(
              KpiRevenue[0].totalAllValue,
            ) || 0
          ).toFixed(2),
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
          (
            BookingsRevenueByChannelTypeEcommercePrevious._sum.totalValue.dividedBy(
              BookingsTotalRentalsByChannelTypeEcommercePrevious._sum
                .totalBookings,
            ) || 0
          ).toFixed(2),
        ),

        totalAllRepresentativenessPreviousData: Number(
          (
            BookingsRevenueByChannelTypeEcommercePrevious._sum.totalValue.dividedBy(
              KpiRevenuePreviousData[0].totalAllValue,
            ) || 0
          ).toFixed(2),
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

  private async fetchKpiData(startDate: Date, endDate: Date) {
    return await Promise.all([
      this.prisma.prismaLocal.booking.findMany({
        where: {
          dateService: {
            gte: startDate,
            lte: endDate,
          },
          canceled: {
            equals: null,
          },
          priceRental: {
            not: null,
          },
        },
        select: {
          id: true,
          priceRental: true,
          idTypeOriginBooking: true,
          dateService: true,
          startDate: true,
          rentalApartmentId: true,
          originBooking: true,
          rentalApartment: true,
        },
      }),
      this.prisma.prismaLocal.originBooking.findMany({
        where: {
          deletionDate: {
            equals: null,
          },
        },
        select: {
          typeOrigin: true,
        },
      }),
      this.prisma.prismaLocal.newRelease.findMany({
        where: {
          deletionDate: {
            equals: null,
          },
          releaseType: {
            equals: 'RESERVA',
          },
          maturity: {
            equals: null,
          },
        },
        select: {
          value: true,
          halfPaymentId: true,
          originalsId: true,
        },
      }),
      this.prisma.prismaLocal.halfPayment.findMany({
        where: {
          deletionDate: {
            equals: null,
          },
        },
        select: {
          id: true, // Adicione o id para o mapeamento
          name: true,
        },
      }),
      this.calculateTotalSaleDirect(startDate, endDate),
      this.prisma.prismaLocal.rentalApartment.findMany({
        where: {
          checkIn: {
            gte: startDate,
            lte: endDate,
          },
          endOccupationType: 'FINALIZADA',
        },
      }),
    ]);
  }

  async calculateKpisByDateRange(startDate: Date, endDate: Date): Promise<any> {
    try {
      console.log('startDate:', startDate);
      console.log('endDate:', endDate);

      const timezone = 'America/Sao_Paulo';

      const [
        allBookings,
        originBookings,
        newReleases,
        halfPayments,
        totalSaleDirect,
        allRentalApartments,
      ] = await this.fetchKpiData(startDate, endDate);

      if (!allBookings || allBookings.length === 0) {
        throw new NotFoundException('No booking revenue found.');
      }

      // Calcular o total da receita de reservas
      const totalAllValue = allBookings.reduce((total, bookings) => {
        return total.plus(new Prisma.Decimal(bookings.priceRental));
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
      const totalAllRepresentativeness = totalAllValue.dividedBy(totalRevenue);

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
          if (!revenueByPaymentMethod.has(paymentName)) {
            revenueByPaymentMethod.set(paymentName, new Prisma.Decimal(0));
          }

          // Acumula o valor atual ao total existente
          const currentTotal = revenueByPaymentMethod.get(paymentName);
          revenueByPaymentMethod.set(
            paymentName,
            currentTotal.plus(new Prisma.Decimal(booking.priceRental)),
          );
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
        paymentMethods.categories.push(paymentName);

        // Adiciona o valor total à array de séries
        paymentMethods.series.push(totalValue.toNumber()); // Converte para número, se necessário
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
        switch (idTypeOriginBooking) {
          case 1: // SISTEMA
            return ChannelTypeEnum.INTERNAL;
          case 3: // GUIA_DE_MOTEIS
            return dateService.toDateString() === startDate.toDateString()
              ? ChannelTypeEnum.GUIA_GO
              : ChannelTypeEnum.GUIA_SCHEDULED;
          case 4: // RESERVA_API
            return dateService.toDateString() === startDate.toDateString()
              ? ChannelTypeEnum.WEBSITE_IMMEDIATE
              : ChannelTypeEnum.WEBSITE_SCHEDULED;
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
          revenueByChannelType.set(
            channelType,
            currentTotal.plus(new Prisma.Decimal(booking.priceRental)),
          );
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
      const rentalCounts = {
        [RentalTypeEnum.THREE_HOURS]: 0,
        [RentalTypeEnum.SIX_HOURS]: 0,
        [RentalTypeEnum.TWELVE_HOURS]: 0,
        [RentalTypeEnum.DAY_USE]: 0,
        [RentalTypeEnum.OVERNIGHT]: 0,
        [RentalTypeEnum.DAILY]: 0,
      };

      // Inicializa as arrays para categorias e séries
      const categoriesBookings = [];
      const seriesBookings = [];

      // Processa cada reserva para contar o tipo de locação
      for (const booking of allBookings) {
        const checkIn = booking.rentalApartment?.checkIn; // Acessa checkIn do apartamento
        const checkOut = booking.rentalApartment?.checkOut; // Acessa checkOut do apartamento

        // Determina o tipo de locação
        const rentalType = this.determineRentalPeriod(
          checkIn,
          checkOut,
          allBookings,
        );

        // Incrementa o contador para o tipo de locação correspondente
        if (rentalCounts[rentalType] !== undefined) {
          rentalCounts[rentalType]++;
        }
      }

      // Preenche as arrays de categorias e séries com os resultados
      for (const rentalType in rentalCounts) {
        categoriesBookings.push(rentalType);
        seriesBookings.push(rentalCounts[rentalType]);
      }

      // Cria o objeto final
      const reservationsByRentalType = {
        categoriesBookings,
        seriesBookings,
      };

      return {
        Company: 'Lush Ipiranga',
        BigNumbers: [bigNumbers],
        PaymentMethods: paymentMethods,
        BillingPerChannel: billingPerChannel,
        ReservationsByRentalType: reservationsByRentalType,
      };
    } catch (error) {
      console.error('Erro ao calcular os KPIs:', error);
      throw new BadRequestException();
    }
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

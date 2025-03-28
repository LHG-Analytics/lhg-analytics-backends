import { Injectable, NotFoundException } from '@nestjs/common';
import { PeriodEnum, Prisma } from '../../dist/generated/client-online';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsTicketAverage } from './entities/bookingsTicketAverage.entity';

@Injectable()
export class BookingsTicketAverageService {
  constructor(private prisma: PrismaService) {}

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  async findAllBookingsTicketAverage(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    const companyId = 1; // Defina o ID da empresa conforme necessário

    // Ajustar a data final para não incluir a data atual
    const adjustedEndDate = new Date(endDate);
    if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
    } else if (period === PeriodEnum.LAST_6_M) {
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
    }

    const allBookings = await this.prisma.prismaLocal.booking.findMany({
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
        rentalApartmentId: {
          not: null,
        },
      },
      select: {
        priceRental: true,
      },
    });

    if (!allBookings || allBookings.length === 0) {
      throw new NotFoundException('No bookings found.');
    }

    let totalPriceRental = 0;
    let totalBookings = allBookings.length;

    // Soma todos os valores de priceRental
    for (const booking of allBookings) {
      totalPriceRental += booking.priceRental; // Supondo que priceRental é um número
    }

    // Calcular a média
    const averageTicket =
      totalBookings > 0 ? Number(totalPriceRental) / totalBookings : 0;

    // Monta o resultado total
    const totalResult = {
      totalAllTicketAverage: this.formatCurrency(averageTicket), // Formata o valor em reais
      totalBookings: totalBookings,
      createdDate: adjustedEndDate, // Ajusta a data para o final do período
    };

    // Inserir no banco de dados
    await this.insertBookingsTicketAverage({
      totalAllTicketAverage: new Prisma.Decimal(averageTicket),
      period: period,
      createdDate: adjustedEndDate,
      companyId,
    });

    // Log para verificar o resultado
    console.log('Total Result:', totalResult);

    return totalResult;
  }

  async insertBookingsTicketAverage(
    data: BookingsTicketAverage,
  ): Promise<BookingsTicketAverage> {
    return this.prisma.prismaOnline.bookingsTicketAverage.upsert({
      where: {
        period_createdDate: {
          period: data.period,
          createdDate: data.createdDate,
        },
      },
      create: {
        ...data,
      },
      update: {
        ...data,
      },
    });
  }
}

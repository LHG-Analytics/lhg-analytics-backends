import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PeriodEnum } from '../../dist/generated/client-online';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsTotalRental } from './entities/bookingsTotalRental.entity';

@Injectable()
export class BookingsTotalRentalsService {
  constructor(private prisma: PrismaService) {}

  async findAllKpiTotalRentals(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
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
          rentalApartmentId: {
            not: null, // Considerar apenas reservas onde rentalApartmentId não é nulo
          },
          canceled: {
            equals: null,
          },
        },
      });

      if (!allBookings || allBookings.length === 0) {
        throw new NotFoundException('No bookings found.');
      }

      const totalAllBookings = allBookings.length; // Total de reservas agregadas

      // Monta o resultado total agregado
      const totalResult = {
        totalBookings: totalAllBookings, // Total geral de reservas
        createdDate: adjustedEndDate,
      };

      // Inserir no banco de dados
      await this.insertKpiTotalRentals({
        totalAllBookings,
        companyId,
        period: period || null,
        createdDate: adjustedEndDate,
      });

      console.log('Total Result:', totalResult);

      return {
        'Total Result': totalResult,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch KpiTotalRentals: ${error.message}`,
      );
    }
  }

  async insertKpiTotalRentals(
    data: BookingsTotalRental,
  ): Promise<BookingsTotalRental> {
    return this.prisma.prismaOnline.bookingsTotalRentals.upsert({
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

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import {
  PeriodEnum,
  Prisma,
  RentalTypeEnum,
} from '../../dist/generated/client-online';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsRepresentativeness } from './entities/bookingsRepresentativeness.entity';

@Injectable()
export class BookingsRepresentativenessService {
  constructor(private prisma: PrismaService) {}

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
          rentalApartmentId: {
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
        },
      }),
    ]);
  }

  async findAllBookingsRepresentativeness(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        adjustedEndDate.setMonth(adjustedEndDate.getMonth() - 1); // Para LAST_6_M, subtrair um mês
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      }

      // Buscar todas as receitas de reservas e apartamentos
      const [totalSaleDirect, allRentalApartments, allBookingsRevenue] =
        await this.fetchKpiData(startDate, endDate);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      // Calcular o total de rentalApartment
      const totalValueForRentalApartments = allRentalApartments.reduce(
        (total, apartment) => {
          return total.plus(new Prisma.Decimal(apartment.totalValue || 0)); // Adiciona 0 se totalValue for nulo
        },
        new Prisma.Decimal(0),
      );

      // Calcular a receita total
      const totalRevenue = totalSaleDirect.plus(totalValueForRentalApartments);

      // Calcular a receita total de bookings
      const totalAllValue = allBookingsRevenue.reduce((total, booking) => {
        return total.plus(new Prisma.Decimal(booking.priceRental || 0)); // Adiciona 0 se priceRental for nulo
      }, new Prisma.Decimal(0));

      // Calcular a representatividade
      const representativeness = totalAllValue
        .dividedBy(totalRevenue)
        .toNumber();

      // Inserir a representatividade no banco de dados
      await this.insertBookingsRepresentativeness({
        totalAllRepresentativeness: new Prisma.Decimal(representativeness),
        createdDate: adjustedEndDate, // Data de criação
        period: period,
        companyId,
      });

      // Retornar apenas o totalAllRepresentativeness e createdDate
      return {
        totalAllRepresentativeness: this.formatPercentage(representativeness),
        createdDate: adjustedEndDate,
      };
    } catch (error) {
      console.error('Erro ao buscar Bookings Representativeness data:', error);
      throw new BadRequestException(
        `Failed to fetch Bookings Representativeness data: ${error.message}`,
      );
    }
  }

  private async insertBookingsRepresentativeness(
    data: BookingsRepresentativeness,
  ): Promise<BookingsRepresentativeness> {
    return this.prisma.prismaOnline.bookingsRepresentativeness.upsert({
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

  private formatPercentage(value: number): string {
    const percentageValue = value * 100;
    return `${percentageValue.toFixed(2)}%`;
  }
}

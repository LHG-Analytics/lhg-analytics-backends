import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { ConsumptionGroup, PeriodEnum, Prisma } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantSales } from './entities/restaurantSale.entity';
@Injectable()
export class RestaurantSalesService {
  constructor(private prisma: PrismaService) {}

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
          saleLease: true,
        },
      }),
    ]);
  }

  async findAllRestaurantSales(
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

      // Buscar todas as locações no intervalo de datas
      const [allRentalApartments] = await this.fetchKpiData(
        startDate,
        adjustedEndDate,
      );

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      // Coletar todos os stockOutSaleLease de uma vez
      const stockOutIds = allRentalApartments
        .map((rentalApartment) => rentalApartment.saleLease?.stockOutId)
        .filter((id) => id !== undefined);

      const stockOutSaleLeases =
        await this.prisma.prismaLocal.stockOut.findMany({
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

      let totalAllSales = 0;

      const stockOutMap = new Map<number, any>();
      stockOutSaleLeases.forEach((stockOut) => {
        stockOutMap.set(stockOut.id, stockOut);
      });

      if (stockOutSaleLeases.length!) {
        totalAllSales = 0;
      }

      totalAllSales = stockOutSaleLeases.length;

      await this.insertRestaurantSales({
        totalAllSales,
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
        period: period,
        companyId,
      });

      const formattedRestaurantRevenueData = {
        totalAllRestaurantSales: totalAllSales, // Converte para número
      };

      return formattedRestaurantRevenueData;
    } catch (error) {
      console.error('Erro ao buscar Restaurant Revenue data:', error);
      throw new BadRequestException(
        `Failed to fetch Restaurant Revenue data: ${error.message}`,
      );
    }
  }

  private async insertRestaurantSales(
    data: RestaurantSales,
  ): Promise<RestaurantSales> {
    return this.prisma.prismaOnline.restaurantSales.upsert({
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

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

      stockOutSaleLeases.forEach((stockOut) => {
        if (stockOut.stockOutItem.length > 0) {
          totalAllSales++;
        }
      });

      await this.insertRestaurantSales({
        totalAllSales,
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
        period: period,
        companyId,
      });

      const formattedRestaurantRevenueData = {
        totalAllRestaurantSales: totalAllSales,
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

  @Cron('0 0 * * *', { disabled: true })
  async handleCron() {
    const timezone = 'America/Sao_Paulo'; // Defina seu fuso horário

    // Obter a data atual no fuso horário correto
    const currentDate = moment().tz(timezone).toDate();

    // Últimos 7 dias
    const endDateLast7Days = currentDate;
    endDateLast7Days.setUTCHours(23, 59, 59, 999);

    const startDateLast7Days = new Date(endDateLast7Days);
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 7); // Vai 6 dias para trás
    startDateLast7Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: parsedStartDateLast7Days,
      endDate: parsedEndDateLast7Days,
    } = this.parseDateString(
      this.formatDateString(startDateLast7Days),
      this.formatDateString(endDateLast7Days),
    );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast7Days = parsedStartDateLast7Days;
    const previousStartDateLast7Days = new Date(previousParsedEndDateLast7Days);
    previousStartDateLast7Days.setDate(
      previousStartDateLast7Days.getDate() - 7,
    );
    previousStartDateLast7Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: previousParsedStartDateLast7Days,
      endDate: previousParsedEndDateLast7DaysParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast7Days),
      this.formatDateString(previousParsedEndDateLast7Days),
    );

    // Log para verificar as datas
    const startTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob RestaurantSales - últimos 7 dias: ${startTimeLast7Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllRestaurantSales(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllRestaurantSales(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    // await this.calculateRestaurantRevenueByPeriod(
    //   parsedStartDateLast7Days,
    //   parsedEndDateLast7Days,
    //   PeriodEnum.LAST_7_D,
    // );
    // await this.calculateRestaurantRevenueByPeriodPercent(
    //   parsedStartDateLast7Days,
    //   parsedEndDateLast7Days,
    //   PeriodEnum.LAST_7_D,
    // );
    // await this.calculateRestaurantRevenueByGroupByPeriod(
    //   parsedStartDateLast7Days,
    //   parsedEndDateLast7Days,
    //   PeriodEnum.LAST_7_D,
    // );
    // await this.calculateRestaurantRevenueByFoodCategory(
    //   parsedStartDateLast7Days,
    //   parsedEndDateLast7Days,
    //   PeriodEnum.LAST_7_D,
    // );
    // await this.calculateRestaurantRevenueByDrinkCategory(
    //   parsedStartDateLast7Days,
    //   parsedEndDateLast7Days,
    //   PeriodEnum.LAST_7_D,
    // );
    // await this.calculateRestaurantRevenueByOthersCategory(
    //   parsedStartDateLast7Days,
    //   parsedEndDateLast7Days,
    //   PeriodEnum.LAST_7_D,
    // );
    // await this.calculateRestaurantRevenueByFoodCategoryPercent(
    //   parsedStartDateLast7Days,
    //   parsedEndDateLast7Days,
    //   PeriodEnum.LAST_7_D,
    // );
    // await this.calculateRestaurantRevenueByDrinkCategoryPercent(
    //   parsedStartDateLast7Days,
    //   parsedEndDateLast7Days,
    //   PeriodEnum.LAST_7_D,
    // );
    // await this.calculateRestaurantRevenueByOthersCategoryPercent(
    //   parsedStartDateLast7Days,
    //   parsedEndDateLast7Days,
    //   PeriodEnum.LAST_7_D,
    // );

    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob RestaurantSales - últimos 7 dias: ${endTimeLast7Days}`,
    );

    // Últimos 30 dias
    const endDateLast30Days = new Date(currentDate);
    endDateLast30Days.setUTCHours(23, 59, 59, 999);

    const startDateLast30Days = new Date(endDateLast30Days);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30); // Vai 29 dias para trás
    startDateLast30Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: parsedStartDateLast30Days,
      endDate: parsedEndDateLast30Days,
    } = this.parseDateString(
      this.formatDateString(startDateLast30Days),
      this.formatDateString(endDateLast30Days),
    );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast30Days = parsedStartDateLast30Days;
    const previousStartDateLast30Days = new Date(
      previousParsedEndDateLast30Days,
    );
    previousStartDateLast30Days.setDate(
      previousStartDateLast30Days.getDate() - 30,
    );
    previousStartDateLast30Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: previousParsedStartDateLast30Days,
      endDate: previousParsedEndDateLast30DaysParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast30Days),
      this.formatDateString(previousParsedEndDateLast30Days),
    );

    // Log para verificar as datas
    const startTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob RestaurantSales - últimos 30 dias: ${startTimeLast30Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllRestaurantSales(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllRestaurantSales(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    // await this.calculateRestaurantRevenueByPeriod(
    //   parsedStartDateLast30Days,
    //   parsedEndDateLast30Days,
    //   PeriodEnum.LAST_30_D,
    // );
    // await this.calculateRestaurantRevenueByPeriodPercent(
    //   parsedStartDateLast30Days,
    //   parsedEndDateLast30Days,
    //   PeriodEnum.LAST_30_D,
    // );
    // await this.calculateRestaurantRevenueByGroupByPeriod(
    //   parsedStartDateLast30Days,
    //   parsedEndDateLast30Days,
    //   PeriodEnum.LAST_30_D,
    // );
    // await this.calculateRestaurantRevenueByFoodCategory(
    //   parsedStartDateLast30Days,
    //   parsedEndDateLast30Days,
    //   PeriodEnum.LAST_30_D,
    // );
    // await this.calculateRestaurantRevenueByDrinkCategory(
    //   parsedStartDateLast30Days,
    //   parsedEndDateLast30Days,
    //   PeriodEnum.LAST_30_D,
    // );
    // await this.calculateRestaurantRevenueByOthersCategory(
    //   parsedStartDateLast30Days,
    //   parsedEndDateLast30Days,
    //   PeriodEnum.LAST_30_D,
    // );
    // await this.calculateRestaurantRevenueByFoodCategoryPercent(
    //   parsedStartDateLast30Days,
    //   parsedEndDateLast30Days,
    //   PeriodEnum.LAST_30_D,
    // );
    // await this.calculateRestaurantRevenueByDrinkCategoryPercent(
    //   parsedStartDateLast30Days,
    //   parsedEndDateLast30Days,
    //   PeriodEnum.LAST_30_D,
    // );
    // await this.calculateRestaurantRevenueByOthersCategoryPercent(
    //   parsedStartDateLast30Days,
    //   parsedEndDateLast30Days,
    //   PeriodEnum.LAST_30_D,
    // );

    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob RestaurantSales - últimos 30 dias: ${endTimeLast30Days}`,
    );

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = new Date(currentDate);
    endDateLast6Months.setUTCHours(23, 59, 59, 999);

    const startDateLast6Months = new Date(endDateLast6Months);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6); // Vai 6 meses para trás
    startDateLast6Months.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: parsedStartDateLast6Months,
      endDate: parsedEndDateLast6Months,
    } = this.parseDateString(
      this.formatDateString(startDateLast6Months),
      this.formatDateString(endDateLast6Months),
    );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast6Months = parsedStartDateLast6Months;
    const previousStartDateLast6Months = new Date(
      previousParsedEndDateLast6Months,
    );
    previousStartDateLast6Months.setMonth(
      previousStartDateLast6Months.getMonth() - 6,
    );
    previousStartDateLast6Months.setHours(0, 0, 0, 0); // Configuração de horas

    // Parse as datas para o formato desejado
    const {
      startDate: previousParsedStartDateLast6Months,
      endDate: previousParsedEndDateLast6MonthsParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast6Months),
      this.formatDateString(previousParsedEndDateLast6Months),
    );

    // Log para verificar as datas
    const startTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob RestaurantSales - últimos 6 meses: ${startTimeLast6Months}`,
    );

    // Chamar a função para o período atual
    await this.findAllRestaurantSales(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllRestaurantSales(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    // await this.calculateRestaurantRevenueByPeriod(
    //   parsedStartDateLast6Months,
    //   parsedEndDateLast6Months,
    //   PeriodEnum.LAST_6_M,
    // );
    // await this.calculateRestaurantRevenueByPeriodPercent(
    //   parsedStartDateLast6Months,
    //   parsedEndDateLast6Months,
    //   PeriodEnum.LAST_6_M,
    // );
    // await this.calculateRestaurantRevenueByGroupByPeriod(
    //   parsedStartDateLast6Months,
    //   parsedEndDateLast6Months,
    //   PeriodEnum.LAST_6_M,
    // );
    // await this.calculateRestaurantRevenueByFoodCategory(
    //   parsedStartDateLast6Months,
    //   parsedEndDateLast6Months,
    //   PeriodEnum.LAST_6_M,
    // );
    // await this.calculateRestaurantRevenueByDrinkCategory(
    //   parsedStartDateLast6Months,
    //   parsedEndDateLast6Months,
    //   PeriodEnum.LAST_6_M,
    // );
    // await this.calculateRestaurantRevenueByOthersCategory(
    //   parsedStartDateLast6Months,
    //   parsedEndDateLast6Months,
    //   PeriodEnum.LAST_6_M,
    // );
    // await this.calculateRestaurantRevenueByFoodCategoryPercent(
    //   parsedStartDateLast6Months,
    //   parsedEndDateLast6Months,
    //   PeriodEnum.LAST_6_M,
    // );
    // await this.calculateRestaurantRevenueByDrinkCategoryPercent(
    //   parsedStartDateLast6Months,
    //   parsedEndDateLast6Months,
    //   PeriodEnum.LAST_6_M,
    // );
    // await this.calculateRestaurantRevenueByOthersCategoryPercent(
    //   parsedStartDateLast6Months,
    //   parsedEndDateLast6Months,
    //   PeriodEnum.LAST_6_M,
    // );

    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob RestaurantSales - últimos 6 meses: ${endTimeLast6Months}`,
    );
  }

  private formatDateString(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Mês é baseado em 0
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
  }

  // Lógica para ajustar as datas com os horários
  private parseDateString(
    startDateString: string,
    endDateString: string,
  ): { startDate: Date; endDate: Date } {
    const [startDay, startMonth, startYear] = startDateString.split('/');
    const [endDay, endMonth, endYear] = endDateString.split('/');

    const parsedStartDate = new Date(
      Date.UTC(+startYear, +startMonth - 1, +startDay),
    );
    const parsedEndDate = new Date(Date.UTC(+endYear, +endMonth - 1, +endDay));

    parsedStartDate.setUTCHours(0, 0, 0, 0); // Define início às 06:00
    parsedEndDate.setUTCHours(23, 59, 59, 999); // Define final às 05:59:59.999

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }
}

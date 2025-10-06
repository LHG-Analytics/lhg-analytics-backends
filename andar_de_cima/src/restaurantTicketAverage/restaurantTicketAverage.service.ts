import { PeriodEnum, Prisma } from '@client-online';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PrismaService } from '../prisma/prisma.service';
import {
  RestaurantTicketAverage,
  RestaurantTicketAverageByPeriod,
  RestaurantTicketAverageByTotalRentals,
} from './entities/restaurantTicketAverage.entity';

@Injectable()
export class RestaurantTicketAverageService {
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

  async findAllRestaurantTicketAverage(
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
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      }

      const abProductTypes = [
        '08 - CAFE DA MANHA',
        '09 - PETICOS, ENTRADAS E PIZZAS',
        '10 - LANCHES',
        '11 - PRATOS',
        '12 - SOBREMESA',
        '14 - BOMBONIERE',
        '01 - SOFT DRINKS',
        '02 - CERVEJAS',
        '03 - COQUETEIS',
        '04 - DOSES',
        '05 - GARRAFAS',
        '06 - VINHOS',
        '07 - ESPUMANTES',
      ];

      const [allRentalApartments] = await this.fetchKpiData(startDate, adjustedEndDate);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      const stockOutIds = allRentalApartments
        .map((r) => r.saleLease?.stockOutId)
        .filter((id) => id !== undefined);

      const stockOutSaleLeases = await this.prisma.prismaLocal.stockOut.findMany({
        where: { id: { in: stockOutIds } },
        include: {
          stockOutItem: {
            where: { canceled: null },
            select: {
              priceSale: true,
              quantity: true,
              stockOutId: true,
              productStock: {
                select: {
                  product: {
                    select: {
                      typeProduct: {
                        select: {
                          description: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          sale: {
            select: {
              discount: true,
            },
          },
        },
      });

      const stockOutMap = new Map<number, any>();
      stockOutSaleLeases.forEach((s) => {
        stockOutMap.set(s.id, s);
      });

      let totalABNetRevenue = new Prisma.Decimal(0);
      let rentalsWithABCount = 0;

      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;
        if (!saleLease?.stockOutId) continue;

        const stockOut = stockOutMap.get(saleLease.stockOutId);
        if (!stockOut?.stockOutItem?.length) continue;

        let abItemTotal = new Prisma.Decimal(0);
        let hasABItem = false;

        for (const item of stockOut.stockOutItem) {
          const description = item.productStock?.product?.typeProduct?.description;
          if (description && abProductTypes.includes(description)) {
            const price = new Prisma.Decimal(item.priceSale || 0);
            const quantity = new Prisma.Decimal(item.quantity || 0);
            abItemTotal = abItemTotal.plus(price.times(quantity));
            hasABItem = true;
          }
        }

        if (hasABItem) {
          const discount = stockOut.sale?.discount
            ? new Prisma.Decimal(stockOut.sale.discount)
            : new Prisma.Decimal(0);

          const netValue = abItemTotal.minus(discount);
          totalABNetRevenue = totalABNetRevenue.plus(netValue);
          rentalsWithABCount += 1;
        }
      }

      const ticketAverage =
        rentalsWithABCount > 0 ? totalABNetRevenue.div(rentalsWithABCount) : new Prisma.Decimal(0);

      // ⬇️ Inserir no banco de dados
      await this.insertRestaurantTicketAverage({
        totalAllTicketAverage: ticketAverage,
        companyId,
        period,
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)),
      });

      return {
        totalNetRevenue: totalABNetRevenue.toNumber(),
        rentalsWithABCount,
        ticketAverage: ticketAverage.toNumber(),
      };
    } catch (error) {
      console.error('Erro ao calcular ticket médio de A&B:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Erro ao calcular ticket médio de A&B: ${errorMessage}`);
    }
  }

  private async insertRestaurantTicketAverage(
    data: RestaurantTicketAverage,
  ): Promise<RestaurantTicketAverage> {
    return this.prisma.prismaOnline.restaurantTicketAverage.upsert({
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

  async calculateRestaurantTicketAverageByTotalRentals(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      } else if (period === PeriodEnum.LAST_6_M) {
        adjustedEndDate.setMonth(adjustedEndDate.getMonth() - 1);
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      }

      const abProductTypes = [
        '08 - CAFE DA MANHA',
        '09 - PETICOS, ENTRADAS E PIZZAS',
        '10 - LANCHES',
        '11 - PRATOS',
        '12 - SOBREMESA',
        '14 - BOMBONIERE',
        '01 - SOFT DRINKS',
        '02 - CERVEJAS',
        '03 - COQUETEIS',
        '04 - DOSES',
        '05 - GARRAFAS',
        '06 - VINHOS',
        '07 - ESPUMANTES',
      ];

      const [allRentalApartments] = await this.fetchKpiData(startDate, adjustedEndDate);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      const stockOutIds = allRentalApartments
        .map((r) => r.saleLease?.stockOutId)
        .filter((id) => id !== undefined);

      const stockOutSaleLeases = await this.prisma.prismaLocal.stockOut.findMany({
        where: { id: { in: stockOutIds } },
        include: {
          stockOutItem: {
            where: { canceled: null },
            select: {
              priceSale: true,
              quantity: true,
              stockOutId: true,
              productStock: {
                select: {
                  product: {
                    select: {
                      typeProduct: {
                        select: {
                          description: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          sale: {
            select: {
              discount: true,
            },
          },
        },
      });

      const stockOutMap = new Map<number, any>();
      stockOutSaleLeases.forEach((s) => {
        stockOutMap.set(s.id, s);
      });

      let totalABNetRevenue = new Prisma.Decimal(0);
      let rentalsWithABCount = 0;

      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;
        if (!saleLease?.stockOutId) continue;

        const stockOut = stockOutMap.get(saleLease.stockOutId);
        if (!stockOut?.stockOutItem?.length) continue;

        let abItemTotal = new Prisma.Decimal(0);
        let hasABItem = false;

        for (const item of stockOut.stockOutItem) {
          const description = item.productStock?.product?.typeProduct?.description;
          if (description && abProductTypes.includes(description)) {
            const price = new Prisma.Decimal(item.priceSale || 0);
            const quantity = new Prisma.Decimal(item.quantity || 0);
            abItemTotal = abItemTotal.plus(price.times(quantity));
            hasABItem = true;
          }
        }

        if (hasABItem) {
          const discount = stockOut.sale?.discount
            ? new Prisma.Decimal(stockOut.sale.discount)
            : new Prisma.Decimal(0);

          const netValue = abItemTotal.minus(discount);
          totalABNetRevenue = totalABNetRevenue.plus(netValue);
          rentalsWithABCount += 1;
        }
      }

      const totalRentals = allRentalApartments.length;

      const ticketAverage =
        totalRentals > 0 ? totalABNetRevenue.div(totalRentals) : new Prisma.Decimal(0);

      // ⬇️ Inserir no banco de dados
      await this.insertRestaurantTicketAverageByTotalRentals({
        totalAllTicketAverageByTotalRentals: ticketAverage,
        companyId,
        period,
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)),
      });

      return {
        totalNetRevenue: totalABNetRevenue.toNumber(),
        rentalsWithABCount,
        ticketAverage: ticketAverage.toNumber(),
      };
    } catch (error) {
      console.error('Erro ao calcular ticket médio de A&B:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Erro ao calcular ticket médio de A&B: ${errorMessage}`);
    }
  }

  private async insertRestaurantTicketAverageByTotalRentals(
    data: RestaurantTicketAverageByTotalRentals,
  ): Promise<RestaurantTicketAverageByTotalRentals> {
    return this.prisma.prismaOnline.restaurantTicketAverageByTotalRentals.upsert({
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

  async calculateRestaurantTicketAverageByPeriod(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      // Ajustar a endDate para o final do dia anterior
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Subtrai um dia
      adjustedEndDate.setUTCHours(23, 59, 59, 999); // Define o final do dia

      // Iniciar currentDate no início do dia da startDate
      let currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0); // Início do dia contábil às 00:00:00

      const abProductTypes = [
        '08 - CAFE DA MANHA',
        '09 - PETICOS, ENTRADAS E PIZZAS',
        '10 - LANCHES',
        '11 - PRATOS',
        '12 - SOBREMESA',
        '14 - BOMBONIERE',
        '01 - SOFT DRINKS',
        '02 - CERVEJAS',
        '03 - COQUETEIS',
        '04 - DOSES',
        '05 - GARRAFAS',
        '06 - VINHOS',
        '07 - ESPUMANTES',
      ];

      let totalABNetRevenue = new Prisma.Decimal(0);
      let totalRentals = 0;

      while (currentDate <= adjustedEndDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
        } else if (period === PeriodEnum.LAST_6_M) {
          currentDate.setDate(currentDate.getDate() - 1); // Ajuste para último dia do mês anterior
          currentDate.setUTCHours(23, 59, 59, 999);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
        }

        const [allRentalApartments] = await this.fetchKpiData(currentDate, nextDate);

        if (!allRentalApartments || allRentalApartments.length === 0) {
          currentDate = new Date(nextDate);
          continue;
        }

        const stockOutIds = allRentalApartments
          .map((r) => r.saleLease?.stockOutId)
          .filter((id) => id !== undefined);

        const stockOutSaleLeases = await this.prisma.prismaLocal.stockOut.findMany({
          where: { id: { in: stockOutIds } },
          include: {
            stockOutItem: {
              where: { canceled: null },
              select: {
                priceSale: true,
                quantity: true,
                stockOutId: true,
                productStock: {
                  select: {
                    product: {
                      select: {
                        typeProduct: {
                          select: {
                            description: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            sale: {
              select: {
                discount: true,
              },
            },
          },
        });

        const stockOutMap = new Map<number, any>();
        stockOutSaleLeases.forEach((s) => {
          stockOutMap.set(s.id, s);
        });

        let currentPeriodNetRevenue = new Prisma.Decimal(0);

        for (const rentalApartment of allRentalApartments) {
          const saleLease = rentalApartment.saleLease;
          if (!saleLease?.stockOutId) continue;

          const stockOut = stockOutMap.get(saleLease.stockOutId);
          if (!stockOut?.stockOutItem?.length) continue;

          let abItemTotal = new Prisma.Decimal(0);

          for (const item of stockOut.stockOutItem) {
            const description = item.productStock?.product?.typeProduct?.description;
            if (description && abProductTypes.includes(description)) {
              const price = new Prisma.Decimal(item.priceSale || 0);
              const quantity = new Prisma.Decimal(item.quantity || 0);
              abItemTotal = abItemTotal.plus(price.times(quantity));
            }
          }

          const discount = stockOut.sale?.discount
            ? new Prisma.Decimal(stockOut.sale.discount)
            : new Prisma.Decimal(0);

          const netValue = abItemTotal.minus(discount);
          currentPeriodNetRevenue = currentPeriodNetRevenue.plus(netValue);
        }

        const currentPeriodRentals = allRentalApartments.length;

        const ticketAverage =
          currentPeriodRentals > 0
            ? currentPeriodNetRevenue.div(currentPeriodRentals)
            : new Prisma.Decimal(0);

        await this.insertRestaurantTicketAverageByPeriod({
          totalTicketAverage: ticketAverage,
          companyId,
          period,
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)),
        });

        totalABNetRevenue = totalABNetRevenue.plus(currentPeriodNetRevenue);
        totalRentals += currentPeriodRentals;

        currentDate = new Date(nextDate);
      }

      const finalAverage =
        totalRentals > 0 ? totalABNetRevenue.div(totalRentals) : new Prisma.Decimal(0);

      return {
        totalNetRevenue: totalABNetRevenue.toNumber(),
        totalRentals,
        ticketAverage: finalAverage.toNumber(),
      };
    } catch (error) {
      console.error('Erro ao calcular ticket médio de A&B:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Erro ao calcular ticket médio de A&B: ${errorMessage}`);
    }
  }

  private async insertRestaurantTicketAverageByPeriod(
    data: RestaurantTicketAverageByPeriod,
  ): Promise<RestaurantTicketAverageByPeriod> {
    return this.prisma.prismaOnline.restaurantTicketAverageByPeriod.upsert({
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
    const { startDate: parsedStartDateLast7Days, endDate: parsedEndDateLast7Days } =
      this.parseDateString(
        this.formatDateString(startDateLast7Days),
        this.formatDateString(endDateLast7Days),
      );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast7Days = parsedStartDateLast7Days;
    const previousStartDateLast7Days = new Date(previousParsedEndDateLast7Days);
    previousStartDateLast7Days.setDate(previousStartDateLast7Days.getDate() - 7);
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
    const startTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob RestaurantTicketAverage - últimos 7 dias: ${startTimeLast7Days}`);

    // Chamar a função para o período atual
    await this.findAllRestaurantTicketAverage(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllRestaurantTicketAverage(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantTicketAverageByTotalRentals(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantTicketAverageByTotalRentals(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantTicketAverageByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    const endTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob RestaurantTicketAverage - últimos 7 dias: ${endTimeLast7Days}`);

    // Últimos 30 dias
    const endDateLast30Days = new Date(currentDate);
    endDateLast30Days.setUTCHours(23, 59, 59, 999);

    const startDateLast30Days = new Date(endDateLast30Days);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30); // Vai 29 dias para trás
    startDateLast30Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const { startDate: parsedStartDateLast30Days, endDate: parsedEndDateLast30Days } =
      this.parseDateString(
        this.formatDateString(startDateLast30Days),
        this.formatDateString(endDateLast30Days),
      );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast30Days = parsedStartDateLast30Days;
    const previousStartDateLast30Days = new Date(previousParsedEndDateLast30Days);
    previousStartDateLast30Days.setDate(previousStartDateLast30Days.getDate() - 30);
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
    const startTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob RestaurantTicketAverage - últimos 30 dias: ${startTimeLast30Days}`);

    // Chamar a função para o período atual
    await this.findAllRestaurantTicketAverage(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllRestaurantTicketAverage(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantTicketAverageByTotalRentals(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantTicketAverageByTotalRentals(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantTicketAverageByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );

    const endTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob RestaurantTicketAverage - últimos 30 dias: ${endTimeLast30Days}`);

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = new Date(currentDate);
    endDateLast6Months.setUTCHours(23, 59, 59, 999);

    const startDateLast6Months = new Date(endDateLast6Months);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6); // Vai 6 meses para trás
    startDateLast6Months.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const { startDate: parsedStartDateLast6Months, endDate: parsedEndDateLast6Months } =
      this.parseDateString(
        this.formatDateString(startDateLast6Months),
        this.formatDateString(endDateLast6Months),
      );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast6Months = parsedStartDateLast6Months;
    const previousStartDateLast6Months = new Date(previousParsedEndDateLast6Months);
    previousStartDateLast6Months.setMonth(previousStartDateLast6Months.getMonth() - 6);
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
    const startTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob RestaurantTicketAverage - últimos 6 meses: ${startTimeLast6Months}`,
    );

    // Chamar a função para o período atual
    await this.findAllRestaurantTicketAverage(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllRestaurantTicketAverage(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantTicketAverageByTotalRentals(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantTicketAverageByTotalRentals(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantTicketAverageByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );

    const endTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob RestaurantTicketAverage - últimos 6 meses: ${endTimeLast6Months}`);
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

    const parsedStartDate = new Date(Date.UTC(+startYear, +startMonth - 1, +startDay));
    const parsedEndDate = new Date(Date.UTC(+endYear, +endMonth - 1, +endDay));

    parsedStartDate.setUTCHours(0, 0, 0, 0); // Define início às 06:00
    parsedEndDate.setUTCHours(23, 59, 59, 999); // Define final às 05:59:59.999

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }
}

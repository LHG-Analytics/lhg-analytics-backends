import { PeriodEnum, Prisma } from '@client-online';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PrismaService } from '../prisma/prisma.service';
import {
  RestaurantSales,
  RestaurantSalesByDrinkCategory,
  RestaurantSalesByFoodCategory,
  RestaurantSalesByOthersCategory,
  RestaurantSalesRanking,
} from './entities/restaurantSale.entity';
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

  async findAllRestaurantSales(startDate: Date, endDate: Date, period?: PeriodEnum): Promise<any> {
    try {
      const companyId = 1;

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      }

      // Buscar todas as locações no intervalo de datas
      const [allRentalApartments] = await this.fetchKpiData(startDate, adjustedEndDate);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      // Coletar todos os stockOutSaleLease de uma vez
      const stockOutIds = allRentalApartments
        .map((rentalApartment) => rentalApartment.saleLease?.stockOutId)
        .filter((id) => id !== undefined);

      const stockOutSaleLeases = await this.prisma.prismaLocal.stockOut.findMany({
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
      throw new BadRequestException(`Failed to fetch Restaurant Revenue data: ${error.message}`);
    }
  }

  private async insertRestaurantSales(data: RestaurantSales): Promise<RestaurantSales> {
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

  private async calculateRestaurantSalesRanking(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      // Ajustar a endDate para o final do dia anterior
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      adjustedEndDate.setUTCHours(23, 59, 59, 999);

      // Lista de produtos permitidos (formato exato dos descriptions)
      const allowedProducts = [
        'SPECIAL BURGUER',
        'ESCALOPE DE MIGNON & RISOTO',
        'CAFE TOUT',
        'CAFE TOUT PREMIUN',
        'FRITAS COM MOLHO DE QUEIJO',
        'PARMEGGIANA TOUT',
        'MIX DE PASTEIS',
        'MIGNON BOQUINHA DE ANJO',
        'FILE MIGNON 220G',
        'BROWNIE',
        'FRANGO BLT',
        'MOUSSE DE CHOCOLATE',
        'DADINHO DE TAPIOCA',
        'LASANHA GRATINADA',
        'FRALDINHA 220G',
        'PIZZA QUATRO QUEIJOS',
        'PIZZA MARGUERITA',
        'CROQUETE DE CARNE',
        'TILAPIA 180G',
        'TARTAR DE SALMAO',
        'BOQUINHA DE ANJO TOUT(LINGUICA)',
        'RISOTO DE CAMARAO',
        'CUPIM COM MANDIOCA GRATINADA',
        'TORTA DE FRUTAS VERMELHAS COM NUTELLA',
        'DADINHO DE TAPIOCA',
        'MOUSSE DE CHOCOLATE',
        'TOAST DE CHORIPAN',
      ];

      // Buscar todas as locações no intervalo de datas
      const [allRentalApartments] = await this.fetchKpiData(startDate, adjustedEndDate);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      // Coletar os stockOutIds
      const stockOutIds = allRentalApartments
        .map((rentalApartment) => rentalApartment.saleLease?.stockOutId)
        .filter((id) => id !== undefined);

      // Buscar os stockOutSaleLeases
      const stockOutSaleLeases = await this.prisma.prismaLocal.stockOut.findMany({
        where: { id: { in: stockOutIds } },
        include: {
          stockOutItem: {
            where: { canceled: null },
            select: {
              quantity: true,
              productStock: {
                select: {
                  product: {
                    select: {
                      description: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Mapa para acumular a contagem por produto
      const productSalesMap = new Map<string, number>();

      // Agregando as quantidades somente dos produtos permitidos
      for (const stockOut of stockOutSaleLeases) {
        for (const item of stockOut.stockOutItem) {
          const description = item.productStock?.product?.description ?? 'Produto sem nome';
          if (!allowedProducts.includes(description.toUpperCase())) continue;

          const currentCount = productSalesMap.get(description) ?? 0;
          const quantity = Number(item.quantity) || 0;
          productSalesMap.set(description, currentCount + quantity);
        }
      }

      // Inserindo no banco
      for (const [productName, totalSales] of productSalesMap.entries()) {
        await this.insertRestaurantSalesRanking({
          companyId,
          period: period,
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          productName,
          totalSales,
        });
      }

      return { message: 'Restaurant sales ranking calculated successfully.' };
    } catch (error) {
      console.error('Erro ao calcular ranking de vendas do restaurante:', error);
      throw new BadRequestException(
        `Failed to calculate restaurant sales ranking: ${error.message}`,
      );
    }
  }

  private async insertRestaurantSalesRanking(
    data: RestaurantSalesRanking,
  ): Promise<RestaurantSalesRanking> {
    return this.prisma.prismaOnline.restaurantSalesRanking.upsert({
      where: {
        period_createdDate_productName: {
          period: data.period,
          createdDate: data.createdDate,
          productName: data.productName,
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

  private async calculateRestaurantSalesByFoodCategory(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<void> {
    const companyId = 1;

    const categories: string[] = [
      '08 - CAFE DA MANHA',
      '09 - ENTRADAS',
      '10 - SANDUICHES',
      '11 - PRATO PRINCIPAL',
      '12 - ACOMPANHAMENTOS',
      '13 - SOBREMESA',
      '14 - BOMBONIERI',
    ];

    // Ajustar endDate para ontem às 23:59:59.999
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
    adjustedEndDate.setUTCHours(23, 59, 59, 999);

    const createdDate = new Date(adjustedEndDate);
    createdDate.setUTCHours(5, 59, 59, 999);

    const allRentalApartments = await this.prisma.prismaLocal.rentalApartment.findMany({
      where: {
        checkIn: {
          gte: startDate.toISOString(),
          lte: adjustedEndDate.toISOString(),
        },
        endOccupationType: 'FINALIZADA',
      },
      include: {
        saleLease: true,
      },
    });

    const stockOutIds = allRentalApartments
      .map((r) => r.saleLease?.stockOutId)
      .filter((id): id is number => id !== undefined);

    const stockOuts = await this.prisma.prismaLocal.stockOut.findMany({
      where: { id: { in: stockOutIds } },
      include: {
        stockOutItem: {
          where: { canceled: null },
          include: {
            productStock: {
              include: {
                product: {
                  include: {
                    typeProduct: { select: { description: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const totalByCategory: { [category: string]: number } = {};
    categories.forEach((cat) => (totalByCategory[cat] = 0));

    for (const stockOut of stockOuts) {
      for (const item of stockOut.stockOutItem) {
        const category = item.productStock?.product?.typeProduct?.description;
        if (category && categories.includes(category)) {
          totalByCategory[category] += Number(item.quantity || 0);
        }
      }
    }

    const totalAllSales = Object.values(totalByCategory).reduce((sum, qty) => sum + qty, 0);

    for (const category of categories) {
      const totalSales = totalByCategory[category];

      const totalSalesPercent = new Prisma.Decimal(totalSales / totalAllSales);

      await this.insertRestaurantSalesByFoodCategory({
        companyId,
        period,
        createdDate,
        foodCategory: category,
        totalSales,
        totalAllSales,
        totalSalesPercent: new Prisma.Decimal(totalSalesPercent.times(100).toFixed(2)),
      });
    }
  }

  private async insertRestaurantSalesByFoodCategory(
    data: RestaurantSalesByFoodCategory,
  ): Promise<RestaurantSalesByFoodCategory> {
    return this.prisma.prismaOnline.restaurantSalesByFoodCategory.upsert({
      where: {
        period_createdDate_foodCategory: {
          period: data.period,
          createdDate: data.createdDate,
          foodCategory: data.foodCategory,
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

  private async calculateRestaurantSalesByDrinkCategory(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<void> {
    const companyId = 1;

    const categories: string[] = [
      '01 - SOFT DRINKS',
      '02 - CERVEJAS',
      '03 - BONS DRINKS',
      '04 - DOSE',
      '05 - BEBIDAS ALCOOLICAS',
      '06 - VINHO, VI, BEBI',
      '07 - ESPUMANTES',
    ];

    // Ajustar endDate para ontem às 23:59:59.999
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
    adjustedEndDate.setUTCHours(23, 59, 59, 999);

    const createdDate = new Date(adjustedEndDate);
    createdDate.setUTCHours(5, 59, 59, 999);

    const allRentalApartments = await this.prisma.prismaLocal.rentalApartment.findMany({
      where: {
        checkIn: {
          gte: startDate.toISOString(),
          lte: adjustedEndDate.toISOString(),
        },
        endOccupationType: 'FINALIZADA',
      },
      include: {
        saleLease: true,
      },
    });

    const stockOutIds = allRentalApartments
      .map((r) => r.saleLease?.stockOutId)
      .filter((id): id is number => id !== undefined);

    const stockOuts = await this.prisma.prismaLocal.stockOut.findMany({
      where: { id: { in: stockOutIds } },
      include: {
        stockOutItem: {
          where: { canceled: null },
          include: {
            productStock: {
              include: {
                product: {
                  include: {
                    typeProduct: { select: { description: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const totalByCategory: { [category: string]: number } = {};
    categories.forEach((cat) => (totalByCategory[cat] = 0));

    for (const stockOut of stockOuts) {
      for (const item of stockOut.stockOutItem) {
        const category = item.productStock?.product?.typeProduct?.description;
        if (category && categories.includes(category)) {
          totalByCategory[category] += Number(item.quantity || 0);
        }
      }
    }

    const totalAllSales = Object.values(totalByCategory).reduce((sum, qty) => sum + qty, 0);

    for (const category of categories) {
      const totalSale = totalByCategory[category];

      const totalSalePercent = new Prisma.Decimal(totalSale / totalAllSales);

      await this.insertRestaurantSalesByDrinkCategory({
        companyId,
        period,
        createdDate,
        drinkCategory: category,
        totalSale,
        totalAllSales,
        totalSalePercent: new Prisma.Decimal(totalSalePercent.times(100).toFixed(2)),
      });
    }
  }

  private async insertRestaurantSalesByDrinkCategory(
    data: RestaurantSalesByDrinkCategory,
  ): Promise<RestaurantSalesByDrinkCategory> {
    return this.prisma.prismaOnline.restaurantSalesByDrinkCategory.upsert({
      where: {
        period_createdDate_drinkCategory: {
          period: data.period,
          createdDate: data.createdDate,
          drinkCategory: data.drinkCategory,
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

  private async calculateRestaurantSalesByOthersCategory(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<void> {
    const companyId = 1;

    const categories: string[] = [
      'CIGARROS',
      '15 - MENU SENSUAL',
      '16 - CONVENIENCIA E HIGIENE',
      '17 - PRESERVATIVOS',
      'DIVERSOS',
      'SOUVENIRS',
    ];

    // Ajustar endDate para ontem às 23:59:59.999
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
    adjustedEndDate.setUTCHours(23, 59, 59, 999);

    const createdDate = new Date(adjustedEndDate);
    createdDate.setUTCHours(5, 59, 59, 999);

    const allRentalApartments = await this.prisma.prismaLocal.rentalApartment.findMany({
      where: {
        checkIn: {
          gte: startDate.toISOString(),
          lte: adjustedEndDate.toISOString(),
        },
        endOccupationType: 'FINALIZADA',
      },
      include: {
        saleLease: true,
      },
    });

    const stockOutIds = allRentalApartments
      .map((r) => r.saleLease?.stockOutId)
      .filter((id): id is number => id !== undefined);

    const stockOuts = await this.prisma.prismaLocal.stockOut.findMany({
      where: { id: { in: stockOutIds } },
      include: {
        stockOutItem: {
          where: { canceled: null },
          include: {
            productStock: {
              include: {
                product: {
                  include: {
                    typeProduct: { select: { description: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const totalByCategory: { [category: string]: number } = {};
    categories.forEach((cat) => (totalByCategory[cat] = 0));

    for (const stockOut of stockOuts) {
      for (const item of stockOut.stockOutItem) {
        const category = item.productStock?.product?.typeProduct?.description;
        if (category && categories.includes(category)) {
          totalByCategory[category] += Number(item.quantity || 0);
        }
      }
    }

    const totalAllSales = Object.values(totalByCategory).reduce((sum, qty) => sum + qty, 0);

    for (const category of categories) {
      const totalSales = totalByCategory[category];

      const totalSalesPercent = new Prisma.Decimal(totalSales / totalAllSales);

      await this.insertRestaurantSalesByOthersCategory({
        companyId,
        period,
        createdDate,
        othersCategory: category,
        totalSales,
        totalAllSales,
        totalSalesPercent: new Prisma.Decimal(totalSalesPercent.times(100).toFixed(2)),
      });
    }
  }

  private async insertRestaurantSalesByOthersCategory(
    data: RestaurantSalesByOthersCategory,
  ): Promise<RestaurantSalesByOthersCategory> {
    return this.prisma.prismaOnline.restaurantSalesByOthersCategory.upsert({
      where: {
        period_createdDate_othersCategory: {
          period: data.period,
          createdDate: data.createdDate,
          othersCategory: data.othersCategory,
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
    console.log(`Início CronJob RestaurantSales - últimos 7 dias: ${startTimeLast7Days}`);

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
    await this.calculateRestaurantSalesRanking(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantSalesByFoodCategory(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantSalesByDrinkCategory(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantSalesByOthersCategory(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    const endTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob RestaurantSales - últimos 7 dias: ${endTimeLast7Days}`);

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
    console.log(`Início CronJob RestaurantSales - últimos 30 dias: ${startTimeLast30Days}`);

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
    await this.calculateRestaurantSalesRanking(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantSalesByFoodCategory(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantSalesByDrinkCategory(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantSalesByOthersCategory(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );

    const endTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob RestaurantSales - últimos 30 dias: ${endTimeLast30Days}`);

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
    console.log(`Início CronJob RestaurantSales - últimos 6 meses: ${startTimeLast6Months}`);

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
    await this.calculateRestaurantSalesRanking(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantSalesByFoodCategory(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantSalesByDrinkCategory(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantSalesByOthersCategory(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );

    const endTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob RestaurantSales - últimos 6 meses: ${endTimeLast6Months}`);
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

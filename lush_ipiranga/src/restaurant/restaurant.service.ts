import { PeriodEnum, Prisma } from '@client-online';
import { Injectable } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class RestaurantService {
  constructor(private prisma: PrismaService) {}

  async findAllRestaurants(period: PeriodEnum) {
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

    // Função de filtro para LAST_6_M
    const filterByDayOfMonth = (data, dayOfMonth) => {
      return data.filter((item) => {
        const createdDate = moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo');
        return createdDate.date() === dayOfMonth; // Verifica se o dia do mês é o mesmo
      });
    };

    // Consultas para buscar os dados de KPIs com base nas datas selecionadas
    const [
      RestaurantRevenue,
      RestaurantRevenuePrevious,
      RestaurantSales,
      RestaurantSalesPrevious,
      RestaurantTicketAverage,
      RestaurantTicketAveragePrevious,
      RestaurantTicketAverageByTotalRentals,
      RestaurantTicketAverageByTotalRentalsPrevious,
      RestaurantRevenueByPeriod,
      RestaurantRevenueByPeriodPercent,
      RestaurantTicketAverageByPeriod,
      RestaurantSalesRanking,
      RestaurantRevenueByGroupByPeriod,
      RestaurantRevenueByFoodCategory,
      RestaurantRevenueByDrinkCategory,
      RestaurantRevenueByDrinkCategoryPercent,
      RestaurantSalesByDrinkCategory,
      RestaurantRevenueByOthersCategory,
      RestaurantRevenueByOthersCategoryPercent,
      RestaurantSalesByOthersCategory,
      RestaurantRevenueByFoodCategoryPercent,
      RestaurantSalesByFoodCategory,
    ] = await this.prisma.prismaOnline.$transaction([
      this.prisma.prismaOnline.restaurantRevenue.findMany({
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
      this.prisma.prismaOnline.restaurantRevenue.findMany({
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
      this.prisma.prismaOnline.restaurantSales.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllSales: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantSales.findMany({
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
          totalAllSales: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantTicketAverage.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
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
      this.prisma.prismaOnline.restaurantTicketAverage.findMany({
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
      this.prisma.prismaOnline.restaurantTicketAverageByTotalRentals.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllTicketAverageByTotalRentals: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantTicketAverageByTotalRentals.findMany({
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
          totalAllTicketAverageByTotalRentals: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantRevenueByPeriod.findMany({
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
      this.prisma.prismaOnline.restaurantRevenueByPeriodPercent.findMany({
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
          totalValuePercent: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantTicketAverageByPeriod.findMany({
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
          totalTicketAverage: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantSalesRanking.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          productName: true,
          totalSales: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantRevenueByGroupByPeriod.findMany({
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
          consumptionGroup: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantRevenueByFoodCategory.findMany({
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
          foodCategory: true,
          totalAllValue: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantRevenueByDrinkCategory.findMany({
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
          totalAllValue: true,
          drinkCategory: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantRevenueByDrinkCategoryPercent.findMany(
        {
          where: {
            period: period,
            createdDate: {
              gte: endDate,
            },
          },
          select: {
            createdDate: true,
            period: true,
            totalValuePercent: true,
            drinkCategory: true,
          },
          orderBy: {
            createdDate: 'desc',
          },
        },
      ),
      this.prisma.prismaOnline.restaurantSalesByDrinkCategory.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllSales: true,
          totalSale: true,
          totalSalePercent: true,
          drinkCategory: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantRevenueByOthersCategory.findMany({
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
          totalAllValue: true,
          othersCategory: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantRevenueByOthersCategoryPercent.findMany(
        {
          where: {
            period: period,
            createdDate: {
              gte: endDate,
            },
          },
          select: {
            createdDate: true,
            period: true,
            totalValuePercent: true,
            othersCategory: true,
          },
          orderBy: {
            createdDate: 'desc',
          },
        },
      ),
      this.prisma.prismaOnline.restaurantSalesByOthersCategory.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllSales: true,
          totalSales: true,
          totalSalesPercent: true,
          othersCategory: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantRevenueByFoodCategoryPercent.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalValuePercent: true,
          foodCategory: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.restaurantSalesByFoodCategory.findMany({
        where: {
          period: period,
          createdDate: {
            gte: endDate,
          },
        },
        select: {
          createdDate: true,
          period: true,
          totalAllSales: true,
          totalSales: true,
          totalSalesPercent: true,
          foodCategory: true,
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
        totalAllValue: Number(RestaurantRevenue[0]?.totalAllValue ?? 0),

        totalAllSales: RestaurantSales[0]?.totalAllSales ?? 0,
        totalAllTicketAverage: Number(
          RestaurantTicketAverage[0]?.totalAllTicketAverage ?? 0,
        ),

        totalAllTicketAverageByTotalRentals: Number(
          RestaurantTicketAverageByTotalRentals[0]
            ?.totalAllTicketAverageByTotalRentals ?? 0,
        ),
      },

      PreviousDate: {
        totalAllValuePreviousData: Number(
          RestaurantRevenuePrevious[0]?.totalAllValue ?? 0,
        ),

        totalAllSalesPreviousData:
          RestaurantSalesPrevious[0]?.totalAllSales ?? 0,

        totalAllTicketAveragePreviousData: Number(
          RestaurantTicketAveragePrevious[0]?.totalAllTicketAverage ?? 0,
        ),

        totalAllTicketAverageByTotalRentalsPreviousData: Number(
          RestaurantTicketAverageByTotalRentalsPrevious[0]
            ?.totalAllTicketAverageByTotalRentals ?? 0,
        ),
      },
    };

    // Aplicar o filtro se o período for LAST_6_M
    let filteredDataRevenuePeriod = RestaurantRevenueByPeriod;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate('day'); // Obter o dia do mês do startDate
      filteredDataRevenuePeriod = filterByDayOfMonth(
        RestaurantRevenueByPeriod,
        dayOfMonth,
      );
    }

    const revenueAbByPeriod = {
      categories: filteredDataRevenuePeriod.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: filteredDataRevenuePeriod.map((item) => Number(item.totalValue)),
    };

    // Aplicar o filtro se o período for LAST_6_M
    let filteredDataRevenuePeriodPercent = RestaurantRevenueByPeriodPercent;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate('day'); // Obter o dia do mês do startDate
      filteredDataRevenuePeriodPercent = filterByDayOfMonth(
        RestaurantRevenueByPeriodPercent,
        dayOfMonth,
      );
    }

    const revenueAbByPeriodPercent = {
      categories: filteredDataRevenuePeriodPercent.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: filteredDataRevenuePeriodPercent.map((item) =>
        Number(item.totalValuePercent),
      ),
    };

    // Aplicar o filtro se o período for LAST_6_M
    let filteredDataTicketAveragePeriod = RestaurantTicketAverageByPeriod;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate('day'); // Obter o dia do mês do startDate
      filteredDataTicketAveragePeriod = filterByDayOfMonth(
        RestaurantTicketAverageByPeriod,
        dayOfMonth,
      );
    }

    const ticketAverageByPeriod = {
      categories: filteredDataTicketAveragePeriod.map((item) =>
        moment
          .utc(item.createdDate)
          .tz('America/Sao_Paulo')
          .format('DD/MM/YYYY'),
      ),
      series: filteredDataTicketAveragePeriod.map((item) =>
        Number(item.totalTicketAverage),
      ),
    };

    const top15Sales = [...RestaurantSalesRanking]
      .sort((a, b) => Number(b.totalSales) - Number(a.totalSales)) // já ordena decrescente
      .slice(0, 15); // pega os 15 com maior totalSales

    // Como já está ordenado, basta usar top15Sales diretamente
    const bestSellingItems = {
      categories: top15Sales.map((item) => item.productName),
      series: top15Sales.map((item) => Number(item.totalSales)),
    };

    const top15LeastSales = [...RestaurantSalesRanking]
      .sort((a, b) => Number(a.totalSales) - Number(b.totalSales)) // já ordena crescente
      .slice(0, 15); // pega os 15 com menor totalSales

    // Como já está ordenado, basta usar top15LeastSales diretamente
    const leastSellingItems = {
      categories: top15LeastSales.map((item) => item.productName),
      series: top15LeastSales.map((item) => Number(item.totalSales)),
    };

    // Aplicar o filtro se o período for LAST_6_M
    let filteredDataRevenueByGroupPeriod = RestaurantRevenueByGroupByPeriod;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate('day'); // Obter o dia do mês do startDate
      filteredDataRevenueByGroupPeriod = filterByDayOfMonth(
        RestaurantRevenueByGroupByPeriod,
        dayOfMonth,
      );
    }

    const formattedData = filteredDataRevenueByGroupPeriod.map((item) => {
      const formattedDate = moment
        .utc(item.createdDate)
        .tz('America/Sao_Paulo')
        .format('DD/MM/YYYY');

      return {
        date: formattedDate,
        group: item.consumptionGroup,
        value: Number(item.totalValue),
      };
    });

    // 1. Pegar datas únicas (ordenadas)
    const categoriesSet = new Set(formattedData.map((item) => item.date));
    const categories = Array.from(categoriesSet).sort(
      (a, b) =>
        moment(a, 'DD/MM/YYYY').toDate().getTime() -
        moment(b, 'DD/MM/YYYY').toDate().getTime(),
    );

    // 2. Pegar todos os grupos únicos
    const groupSet = new Set(formattedData.map((item) => item.group));
    const groupNames = Array.from(groupSet);

    // 3. Construir a série para o ApexCharts
    const series = groupNames.map((groupName) => {
      const data = categories.map((date) => {
        const match = formattedData.find(
          (item) => item.date === date && item.group === groupName,
        );
        return match ? match.value : 0;
      });

      return {
        name: groupName,
        data,
      };
    });

    const revenueByGroupPeriod = {
      categories,
      series,
    };

    let filteredDataRevenueByFoodPeriod = RestaurantRevenueByFoodCategory;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate('day'); // Obter o dia do mês do startDate
      filteredDataRevenueByFoodPeriod = filterByDayOfMonth(
        RestaurantRevenueByFoodCategory,
        dayOfMonth,
      );
    }

    const formattedDataFood = filteredDataRevenueByFoodPeriod.map((item) => {
      const formattedDate = moment
        .utc(item.createdDate)
        .tz('America/Sao_Paulo')
        .format('DD/MM/YYYY');

      return {
        date: formattedDate,
        group: item.foodCategory,
        value: Number(item.totalValue),
      };
    });

    // 1. Pegar datas únicas (ordenadas)
    const categoriesSetFood = new Set(
      formattedDataFood.map((item) => item.date),
    );
    const categoriesFood = Array.from(categoriesSetFood).sort(
      (a, b) =>
        moment(a, 'DD/MM/YYYY').toDate().getTime() -
        moment(b, 'DD/MM/YYYY').toDate().getTime(),
    );

    // 2. Pegar todos os grupos únicos
    const groupSetFood = new Set(formattedDataFood.map((item) => item.group));
    const groupNamesFood = Array.from(groupSetFood);

    // 3. Construir a série para o ApexCharts
    const seriesFood = groupNamesFood.map((groupNameFood) => {
      const data = categoriesFood.map((date) => {
        const match = formattedDataFood.find(
          (item) => item.date === date && item.group === groupNameFood,
        );
        return match ? match.value : 0;
      });

      return {
        name: groupNameFood,
        data,
      };
    });

    const revenueFoodByPeriod = {
      categoriesFood,
      seriesFood,
    };

    let filteredDataRevenueByDrinksPeriod = RestaurantRevenueByDrinkCategory;
    if (period === PeriodEnum.LAST_6_M) {
      const dayOfMonth = startDate.getDate('day'); // Obter o dia do mês do startDate
      filteredDataRevenueByDrinksPeriod = filterByDayOfMonth(
        RestaurantRevenueByDrinkCategory,
        dayOfMonth,
      );
    }

    const formattedDataDrink = filteredDataRevenueByDrinksPeriod.map((item) => {
      const formattedDate = moment
        .utc(item.createdDate)
        .tz('America/Sao_Paulo')
        .format('DD/MM/YYYY');

      return {
        date: formattedDate,
        group: item.drinkCategory,
        value: Number(item.totalValue),
      };
    });

    // 1. Pegar datas únicas (ordenadas)
    const categoriesSetDrink = new Set(
      formattedDataDrink.map((item) => item.date),
    );
    const categoriesDrink = Array.from(categoriesSetDrink).sort(
      (a, b) =>
        moment(a, 'DD/MM/YYYY').toDate().getTime() -
        moment(b, 'DD/MM/YYYY').toDate().getTime(),
    );

    // 2. Pegar todos os grupos únicos
    const groupSetDrink = new Set(formattedDataDrink.map((item) => item.group));
    const groupNamesDrink = Array.from(groupSetDrink);

    // 3. Construir a série para o ApexCharts
    const seriesDrink = groupNamesDrink.map((groupNameDrink) => {
      const data = categoriesDrink.map((date) => {
        const match = formattedDataDrink.find(
          (item) => item.date === date && item.group === groupNameDrink,
        );
        return match ? match.value : 0;
      });

      return {
        name: groupNameDrink,
        data,
      };
    });

    const revenueDrinksByPeriod = {
      categoriesDrink,
      seriesDrink,
    };

    const reportByDrinks: Record<
      string,
      {
        revenue: number;
        revenuePercent: number;
        quantity: number;
        quantityPercent: number;
      }
    > = {};

    // Preencher com dados de receita
    for (const revenue of RestaurantRevenueByDrinkCategory) {
      const category = revenue.drinkCategory;
      reportByDrinks[category] = {
        revenue: Number(revenue.totalAllValue),
        revenuePercent: 0,
        quantity: 0,
        quantityPercent: 0,
      };
    }

    // Preencher com dados de percentual de receita
    for (const revenuePercent of RestaurantRevenueByDrinkCategoryPercent) {
      const category = revenuePercent.drinkCategory;
      if (reportByDrinks[category]) {
        reportByDrinks[category].revenuePercent = Number(
          revenuePercent.totalValuePercent,
        );
      }
    }

    // Preencher com dados de quantidade e percentual de quantidade
    for (const sales of RestaurantSalesByDrinkCategory) {
      const category = sales.drinkCategory;
      if (reportByDrinks[category]) {
        reportByDrinks[category].quantity = Number(sales.totalSale);
        reportByDrinks[category].quantityPercent = Number(
          sales.totalSalePercent,
        );
      }
    }

    // Inserir TOTAL se ele existir (normalmente vem com drinkCategory = 'TOTAL')
    const totalCategory = 'TOTAL';

    reportByDrinks[totalCategory] = {
      revenue: Object.entries(reportByDrinks)
        .filter(([category]) => category !== totalCategory)
        .reduce((sum, [, data]) => sum + data.revenue, 0),

      revenuePercent: Math.round(
        RestaurantRevenueByDrinkCategoryPercent.filter(
          (item) => item.drinkCategory !== totalCategory,
        ).reduce((sum, item) => sum + Number(item.totalValuePercent || 0), 0),
      ),

      quantity:
        Number(
          RestaurantSalesByDrinkCategory.find((item) => item.drinkCategory[0])
            ?.totalAllSales,
        ) || 0,

      quantityPercent: Math.round(
        RestaurantSalesByDrinkCategory.filter(
          (item) => item.drinkCategory !== totalCategory,
        ).reduce((sum, item) => sum + Number(item.totalSalePercent || 0), 0),
      ),
    };

    const reportByOthers: Record<
      string,
      {
        revenue: number;
        revenuePercent: number;
        quantity: number;
        quantityPercent: number;
      }
    > = {};

    // Preencher com dados de receita
    for (const revenue of RestaurantRevenueByOthersCategory) {
      const category = revenue.othersCategory;
      reportByOthers[category] = {
        revenue: Number(revenue.totalAllValue),
        revenuePercent: 0,
        quantity: 0,
        quantityPercent: 0,
      };
    }

    // Preencher com dados de percentual de receita
    for (const revenuePercent of RestaurantRevenueByOthersCategoryPercent) {
      const category = revenuePercent.othersCategory;
      if (reportByOthers[category]) {
        reportByOthers[category].revenuePercent = Number(
          revenuePercent.totalValuePercent,
        );
      }
    }

    // Preencher com dados de quantidade e percentual de quantidade
    for (const sales of RestaurantSalesByOthersCategory) {
      const category = sales.othersCategory;
      if (reportByOthers[category]) {
        reportByOthers[category].quantity = Number(sales.totalSales);
        reportByOthers[category].quantityPercent = Number(
          sales.totalSalesPercent,
        );
      }
    }

    // Inserir TOTAL se ele existir (normalmente vem com drinkCategory = 'TOTAL')
    const totalCategoryOthers = 'TOTAL';

    reportByOthers[totalCategoryOthers] = {
      revenue: Object.entries(reportByOthers)
        .filter(([category]) => category !== totalCategoryOthers)
        .reduce((sum, [, data]) => sum + data.revenue, 0),

      revenuePercent: Math.round(
        RestaurantRevenueByOthersCategoryPercent.filter(
          (item) => item.othersCategory !== totalCategoryOthers,
        ).reduce((sum, item) => sum + Number(item.totalValuePercent || 0), 0),
      ),

      quantity:
        Number(
          RestaurantSalesByOthersCategory.find((item) => item.othersCategory[0])
            ?.totalAllSales,
        ) || 0,

      quantityPercent: Math.round(
        RestaurantSalesByOthersCategory.filter(
          (item) => item.othersCategory !== totalCategoryOthers,
        ).reduce((sum, item) => sum + Number(item.totalSalesPercent || 0), 0),
      ),
    };
    //------------------
    const reportByFood: Record<
      string,
      {
        revenue: number;
        revenuePercent: number;
        quantity: number;
        quantityPercent: number;
      }
    > = {};

    // Preencher com dados de receita
    for (const revenue of RestaurantRevenueByFoodCategory) {
      const category = revenue.foodCategory;
      reportByFood[category] = {
        revenue: Number(revenue.totalAllValue),
        revenuePercent: 0,
        quantity: 0,
        quantityPercent: 0,
      };
    }

    // Preencher com dados de percentual de receita
    for (const revenuePercent of RestaurantRevenueByFoodCategoryPercent) {
      const category = revenuePercent.foodCategory;
      if (reportByFood[category]) {
        reportByFood[category].revenuePercent = Number(
          revenuePercent.totalValuePercent,
        );
      }
    }

    // Preencher com dados de quantidade e percentual de quantidade
    for (const sales of RestaurantSalesByFoodCategory) {
      const category = sales.foodCategory;
      if (reportByFood[category]) {
        reportByFood[category].quantity = Number(sales.totalSales);
        reportByFood[category].quantityPercent = Number(
          sales.totalSalesPercent,
        );
      }
    }

    // Inserir TOTAL se ele existir (normalmente vem com drinkCategory = 'TOTAL')
    const totalCategoryFood = 'TOTAL';

    reportByFood[totalCategoryFood] = {
      revenue: Object.entries(reportByFood)
        .filter(([category]) => category !== totalCategoryFood)
        .reduce((sum, [, data]) => sum + data.revenue, 0),

      revenuePercent: Math.round(
        RestaurantRevenueByFoodCategoryPercent.filter(
          (item) => item.foodCategory !== totalCategoryFood,
        ).reduce((sum, item) => sum + Number(item.totalValuePercent || 0), 0),
      ),

      quantity:
        Number(
          RestaurantSalesByFoodCategory.find((item) => item.foodCategory[0])
            ?.totalAllSales,
        ) || 0,

      quantityPercent: Math.round(
        RestaurantSalesByFoodCategory.filter(
          (item) => item.foodCategory !== totalCategoryFood,
        ).reduce((sum, item) => sum + Number(item.totalSalesPercent || 0), 0),
      ),
    };

    return {
      Company: 'Lush Ipiranga',
      BigNumbers: [bigNumbers],
      RevenueAbByPeriod: revenueAbByPeriod,
      RevenueAbByPeriodPercent: revenueAbByPeriodPercent,
      TicketAverageByPeriod: ticketAverageByPeriod,
      BestSellingItems: bestSellingItems,
      LeastSellingItems: leastSellingItems,
      RevenueByGroupPeriod: revenueByGroupPeriod,
      RevenueFoodByPeriod: revenueFoodByPeriod,
      RevenueDrinksByPeriod: revenueDrinksByPeriod,
      ReportByDrinks: reportByDrinks,
      ReportByOthers: reportByOthers,
      ReportByFood: reportByFood,
    };
  }
}

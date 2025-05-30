import { PeriodEnum, Prisma } from '@client-online';
import { BadRequestException, Injectable } from '@nestjs/common';
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
      RestaurantSalesByDrinkCategory,
      RestaurantRevenueByOthersCategory,
      RestaurantSalesByOthersCategory,
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
          totalValuePercent: true,
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
          totalValuePercent: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
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
          totalValuePercent: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
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

    const reportByDrinksMap: Record<
      string,
      {
        name: string;
        revenue: number;
        revenuePercent: number;
        quantity: number;
        quantityPercent: number;
      }
    > = {};

    // Preencher com dados de receita
    for (const revenue of RestaurantRevenueByDrinkCategory) {
      const category = revenue.drinkCategory;
      reportByDrinksMap[category] = {
        name: category,
        revenue: Number(revenue.totalAllValue),
        revenuePercent: 0,
        quantity: 0,
        quantityPercent: 0,
      };
    }

    // Preencher com dados de percentual de receita
    for (const revenuePercent of RestaurantRevenueByDrinkCategory) {
      const category = revenuePercent.drinkCategory;
      if (reportByDrinksMap[category]) {
        reportByDrinksMap[category].revenuePercent = Number(
          revenuePercent.totalValuePercent,
        );
      }
    }

    // Preencher com dados de quantidade e percentual de quantidade
    for (const sales of RestaurantSalesByDrinkCategory) {
      const category = sales.drinkCategory;
      if (reportByDrinksMap[category]) {
        reportByDrinksMap[category].quantity = Number(sales.totalSale);
        reportByDrinksMap[category].quantityPercent = Number(
          sales.totalSalePercent,
        );
      }
    }

    // Inserir TOTAL
    const totalCategory = 'TOTAL';

    reportByDrinksMap[totalCategory] = {
      name: totalCategory,
      revenue: Object.entries(reportByDrinksMap)
        .filter(([category]) => category !== totalCategory)
        .reduce((sum, [, data]) => Number((sum + data.revenue).toFixed(2)), 0),

      revenuePercent: 100,

      quantity: Object.entries(reportByDrinksMap)
        .filter(([category]) => category !== totalCategory)
        .reduce((sum, [, data]) => sum + data.quantity, 0),

      quantityPercent: 100,
    };

    // Converter para array com campo `name`
    const reportByDrinks = Object.values(reportByDrinksMap);

    const reportByOthersMap: Record<
      string,
      {
        name: string;
        revenue: number;
        revenuePercent: number;
        quantity: number;
        quantityPercent: number;
      }
    > = {};

    // Preencher com dados de receita
    for (const revenue of RestaurantRevenueByOthersCategory) {
      const category = revenue.othersCategory;
      reportByOthersMap[category] = {
        name: category,
        revenue: Number(revenue.totalAllValue),
        revenuePercent: 0,
        quantity: 0,
        quantityPercent: 0,
      };
    }

    // Percentual de receita
    for (const revenuePercent of RestaurantRevenueByOthersCategory) {
      const category = revenuePercent.othersCategory;
      if (reportByOthersMap[category]) {
        reportByOthersMap[category].revenuePercent = Number(
          revenuePercent.totalValuePercent,
        );
      }
    }

    // Quantidade e percentual
    for (const sales of RestaurantSalesByOthersCategory) {
      const category = sales.othersCategory;
      if (reportByOthersMap[category]) {
        reportByOthersMap[category].quantity = Number(sales.totalSales);
        reportByOthersMap[category].quantityPercent = Number(
          sales.totalSalesPercent,
        );
      }
    }

    // Inserir TOTAL
    const totalCategoryOthers = 'TOTAL';
    reportByOthersMap[totalCategoryOthers] = {
      name: totalCategoryOthers,
      revenue: Object.entries(reportByOthersMap)
        .filter(([category]) => category !== totalCategoryOthers)
        .reduce((sum, [, data]) => sum + data.revenue, 0),
      revenuePercent: 100,
      quantity: Object.entries(reportByOthersMap)
        .filter(([category]) => category !== totalCategoryOthers)
        .reduce((sum, [, data]) => sum + data.quantity, 0),

      quantityPercent: 100,
    };

    const reportByOthers = Object.values(reportByOthersMap);

    const reportByFoodMap: Record<
      string,
      {
        name: string;
        revenue: number;
        revenuePercent: number;
        quantity: number;
        quantityPercent: number;
      }
    > = {};

    // Receita
    for (const revenue of RestaurantRevenueByFoodCategory) {
      const category = revenue.foodCategory;
      reportByFoodMap[category] = {
        name: category,
        revenue: Number(revenue.totalAllValue),
        revenuePercent: 0,
        quantity: 0,
        quantityPercent: 0,
      };
    }

    // Percentual de receita
    for (const revenuePercent of RestaurantRevenueByFoodCategory) {
      const category = revenuePercent.foodCategory;
      if (reportByFoodMap[category]) {
        reportByFoodMap[category].revenuePercent = Number(
          revenuePercent.totalValuePercent,
        );
      }
    }

    // Quantidade
    for (const sales of RestaurantSalesByFoodCategory) {
      const category = sales.foodCategory;
      if (reportByFoodMap[category]) {
        reportByFoodMap[category].quantity = Number(sales.totalSales);
        reportByFoodMap[category].quantityPercent = Number(
          sales.totalSalesPercent,
        );
      }
    }

    // TOTAL
    const totalCategoryFood = 'TOTAL';
    reportByFoodMap[totalCategoryFood] = {
      name: totalCategoryFood,
      revenue: Object.entries(reportByFoodMap)
        .filter(([category]) => category !== totalCategoryFood)
        .reduce((sum, [, data]) => sum + data.revenue, 0),
      revenuePercent: 100,
      quantity: Object.entries(reportByFoodMap)
        .filter(([category]) => category !== totalCategoryFood)
        .reduce((sum, [, data]) => sum + data.quantity, 0),

      quantityPercent: 100,
    };

    const reportByFood = Object.values(reportByFoodMap);

    return {
      Company: 'Lush Lapa',
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

  async calculateKpisByDateRange(startDate: Date, endDate: Date): Promise<any> {
    try {
      console.log('startDate custom date:', startDate);
      console.log('endDate custom date:', endDate);

      const [allRentalApartments] = await this.fetchKpiData(startDate, endDate);

      const allSales = allRentalApartments.length;

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

      const stockOutMap = new Map<number, any>();
      stockOutSaleLeases.forEach((stockOut) => {
        stockOutMap.set(stockOut.id, stockOut);
      });

      let totalGrossRevenue = new Prisma.Decimal(0); // Inicializa a receita bruta
      let totalDiscount = new Prisma.Decimal(0); // Inicializa o total de descontos

      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;

        if (saleLease && saleLease.stockOutId) {
          const stockOutSaleLease = stockOutMap.get(saleLease.stockOutId);

          if (
            stockOutSaleLease &&
            Array.isArray(stockOutSaleLease.stockOutItem)
          ) {
            let itemTotalValue = new Prisma.Decimal(0);
            let discountSale = new Prisma.Decimal(0);

            // Calcular o valor total da venda para este item
            stockOutSaleLease.stockOutItem.forEach((stockOutItem) => {
              const priceSale = new Prisma.Decimal(stockOutItem.priceSale || 0);
              const quantity = new Prisma.Decimal(stockOutItem.quantity || 0);
              itemTotalValue = itemTotalValue.plus(priceSale.times(quantity));
            });

            // Aplica o desconto se existir
            discountSale = stockOutSaleLease.sale?.discount
              ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
              : new Prisma.Decimal(0);

            // Acumula a receita bruta e o desconto total
            totalGrossRevenue = totalGrossRevenue.plus(itemTotalValue);
            totalDiscount = totalDiscount.plus(discountSale);
          }
        }
      }

      // Calcular a receita líquida
      const totalAllValue = totalGrossRevenue.minus(totalDiscount);

      // Montando o retorno de BigNumbers
      const bigNumbers = {
        currentDate: {
          // Itera sobre cada item e acumula o totalValue
          totalAllValue: Number(totalAllValue ?? 0),

          allSales: Number(allSales),

          /*totalAllSales: RestaurantSales[0]?.totalAllSales ?? 0,
          totalAllTicketAverage: Number(
            RestaurantTicketAverage[0]?.totalAllTicketAverage ?? 0,
          ),

          totalAllTicketAverageByTotalRentals: Number(
            RestaurantTicketAverageByTotalRentals[0]
              ?.totalAllTicketAverageByTotalRentals ?? 0,
          ),*/
        },
      };

      return {
        Company: 'Lush Lapa',
        BigNumbers: [bigNumbers],
        /*RevenueAbByPeriod: revenueAbByPeriod,
        RevenueAbByPeriodPercent: revenueAbByPeriodPercent,
        TicketAverageByPeriod: ticketAverageByPeriod,
        BestSellingItems: bestSellingItems,
        LeastSellingItems: leastSellingItems,
        RevenueByGroupPeriod: revenueByGroupPeriod,
        RevenueFoodByPeriod: revenueFoodByPeriod,
        RevenueDrinksByPeriod: revenueDrinksByPeriod,
        ReportByDrinks: reportByDrinks,
        ReportByOthers: reportByOthers,
        ReportByFood: reportByFood,*/
      };
    } catch (error) {
      console.error('Erro ao calcular os KPIs:', error);
      throw new BadRequestException();
    }
  }
}

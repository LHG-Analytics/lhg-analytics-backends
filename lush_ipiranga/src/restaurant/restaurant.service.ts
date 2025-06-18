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

    const top10Sales = [...RestaurantSalesRanking]
      .sort((a, b) => Number(b.totalSales) - Number(a.totalSales)) // já ordena decrescente
      .slice(0, 10); // pega os 10 com maior totalSales

    // Como já está ordenado, basta usar top10Sales diretamente
    const bestSellingItems = {
      categories: top10Sales.map((item) => item.productName),
      series: top10Sales.map((item) => Number(item.totalSales)),
    };

    const top10LeastSales = [...RestaurantSalesRanking]
      .sort((a, b) => Number(a.totalSales) - Number(b.totalSales)) // já ordena crescente
      .slice(0, 10); // pega os 10 com menor totalSales

    // Como já está ordenado, basta usar top10LeastSales diretamente
    const leastSellingItems = {
      categories: top10LeastSales.map((item) => item.productName),
      series: top10LeastSales.map((item) => Number(item.totalSales)),
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

  async calculateKpisByDateRange(startDate: Date, endDate: Date) {
    const abProductTypes = [
      78, 64, 77, 57, 56, 79, 54, 55, 80, 53, 62, 59, 61, 58, 63,
    ];

    const aProductTypes = [78, 64, 77, 57, 62, 59, 61, 58, 63];

    const bProductTypes = [56, 79, 54, 55, 80, 53];

    const othersList = [71, 72, 69, 68, 70];

    const formattedStart = moment
      .utc(startDate)
      .set({ hour: 6, minute: 0, second: 0 })
      .format('YYYY-MM-DD HH:mm:ss');

    const formattedEnd = moment
      .utc(endDate)
      .add(1, 'day') // importante para pegar o último dia completo
      .set({ hour: 5, minute: 59, second: 59 })
      .format('YYYY-MM-DD HH:mm:ss');

    const abProductTypesSqlList = abProductTypes.join(', ');
    const aProductTypesSqlList = aProductTypes.join(', ');
    const bProductTypesSqlList = bProductTypes.join(', ');
    const othersProductTypesSqlList = othersList.join(', ');

    const kpisRawSql = `
  SELECT
    ra."id_apartamentostate",
    so.id AS "id_saidaestoque",
    COALESCE(SUM(soi."precovenda" * soi."quantidade"), 0) AS "totalGross",
    COALESCE(s."desconto", 0) AS "desconto",
    COALESCE(SUM(
      CASE
        WHEN tp.id IN (${abProductTypesSqlList})
        THEN soi."precovenda" * soi."quantidade"
        ELSE 0
      END
    ), 0) AS "abTotal"
  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
  LEFT JOIN "produto" p ON p.id = ps."id_produto"
  LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  LEFT JOIN "venda" s ON s."id_saidaestoque" = so.id
 WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND ra."fimocupacaotipo" = 'FINALIZADA'
  GROUP BY ra."id_apartamentostate", so.id, s."desconto"
`;

    const revenueAbPeriodSql = `
  SELECT
    TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
    COALESCE(SUM(
      CASE
        WHEN tp.id IN (${abProductTypesSqlList})
        THEN soi."precovenda" * soi."quantidade"
        ELSE 0
      END
    ), 0) AS "totalValue"
  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
  LEFT JOIN "produto" p ON p.id = ps."id_produto"
  LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND ra."fimocupacaotipo" = 'FINALIZADA'
  GROUP BY "date"
  ORDER BY "date" DESC
`;

    const totalRevenueByPeriodSql = `
  SELECT
    "date",
    SUM("valor") AS "totalRevenue"
  FROM (
    -- Receita de locações (valortotal já inclui consumo)
    SELECT
      TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
      ra."valortotal" AS "valor"
    FROM "locacaoapartamento" ra
    WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
      AND ra."fimocupacaotipo" = 'FINALIZADA'

    UNION ALL

    -- Receita de vendas diretas (soma dos itens - desconto)
    SELECT
      TO_CHAR(so."datasaida" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
      COALESCE(SUM(soi."precovenda" * soi."quantidade"), 0) - COALESCE(v."desconto", 0) AS "valor"
    FROM "vendadireta" vd
    INNER JOIN "saidaestoque" so ON so.id = vd."id_saidaestoque"
    LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
    LEFT JOIN "venda" v ON v."id_saidaestoque" = so.id
    WHERE so."datasaida" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    GROUP BY TO_CHAR(so."datasaida" - INTERVAL '6 hours', 'YYYY-MM-DD'), v."desconto"
  ) AS all_revenues
  GROUP BY "date"
  ORDER BY "date" DESC;
`;

    const abTicketCountByPeriodSql = `
  SELECT
    TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
    COUNT(DISTINCT ra."id_apartamentostate") AS "rentalsWithAB"
  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
  LEFT JOIN "produto" p ON p.id = ps."id_produto"
  LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${abProductTypesSqlList})
  GROUP BY "date"
  ORDER BY "date" DESC
`;

    const bestSellingItemsSql = `
  SELECT 
    p."descricao" AS "productName",
    SUM(soi."quantidade") AS "totalSales"
  FROM "saidaestoque" so
  JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  JOIN "produtoestoque" pe ON pe.id = soi."id_produtoestoque"
  JOIN "produto" p ON p.id = pe."id_produto"
  JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE tp.id IN (${abProductTypesSqlList})
    AND so."datasaida" BETWEEN '${formattedStart}' AND '${formattedEnd}'
  GROUP BY p."descricao"
  ORDER BY "totalSales" DESC
  LIMIT 10;
`;

    // Consulta para os 10 menos vendidos
    const leastSellingItemsSql = `
  SELECT 
    p."descricao" AS "productName",
    SUM(soi."quantidade") AS "totalSales"
  FROM "saidaestoque" so
  JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  JOIN "produtoestoque" pe ON pe.id = soi."id_produtoestoque"
  JOIN "produto" p ON p.id = pe."id_produto"
  JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE tp.id IN (${abProductTypesSqlList})
    AND so."datasaida" BETWEEN '${formattedStart}' AND '${formattedEnd}'
  GROUP BY p."descricao"
  HAVING SUM(soi."quantidade") > 0
  ORDER BY "totalSales" ASC
  LIMIT 10;
`;

    const revenueGroupByPeriodSql = `
  SELECT
    TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",

    COALESCE(SUM(
      CASE
        WHEN tp.id IN (${aProductTypesSqlList})
        THEN soi."precovenda" * soi."quantidade"
        ELSE 0
      END
    ), 0) AS "ALIMENTOS",

    COALESCE(SUM(
      CASE
        WHEN tp.id IN (${bProductTypesSqlList})
        THEN soi."precovenda" * soi."quantidade"
        ELSE 0
      END
    ), 0) AS "BEBIDAS",

    COALESCE(SUM(
      CASE
        WHEN tp.id NOT IN (${abProductTypesSqlList})
        THEN soi."precovenda" * soi."quantidade"
        ELSE 0
      END
    ), 0) AS "OUTROS"

  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
  LEFT JOIN "produto" p ON p.id = ps."id_produto"
  LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"

  WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND ra."fimocupacaotipo" = 'FINALIZADA'

  GROUP BY "date"
  ORDER BY "date" DESC;
`;

    const revenueAPeriodSql = `
  SELECT
    TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
    tp."descricao" AS "category",
    COALESCE(SUM(soi."precovenda" * soi."quantidade"), 0) AS "totalValue"
  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
  LEFT JOIN "produto" p ON p.id = ps."id_produto"
  LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${aProductTypesSqlList})
  GROUP BY "date", tp."descricao"
  ORDER BY "date" DESC;
`;

    const revenueBPeriodSql = `
  SELECT
    TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
    tp."descricao" AS "category",
    COALESCE(SUM(soi."precovenda" * soi."quantidade"), 0) AS "totalValue"
  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
  LEFT JOIN "produto" p ON p.id = ps."id_produto"
  LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${bProductTypesSqlList})
  GROUP BY "date", tp."descricao"
  ORDER BY "date" DESC;
`;

    const reportByFoodSql = `
  SELECT
    tp."descricao" AS "category",
    COALESCE(SUM(soi."precovenda" * soi."quantidade"), 0) AS "revenue",
    COALESCE(SUM(soi."quantidade"), 0) AS "quantity"
  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
  LEFT JOIN "produto" p ON p.id = ps."id_produto"
  LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${aProductTypesSqlList})
  GROUP BY tp."descricao"
  ORDER BY revenue DESC
`;

    const reportByDrinkSql = `
  SELECT
    tp."descricao" AS "category",
    COALESCE(SUM(soi."precovenda" * soi."quantidade"), 0) AS "revenue",
    COALESCE(SUM(soi."quantidade"), 0) AS "quantity"
  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
  LEFT JOIN "produto" p ON p.id = ps."id_produto"
  LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${bProductTypesSqlList})
  GROUP BY tp."descricao"
  ORDER BY revenue DESC
`;

    const reportByOthersSql = `
  SELECT
    tp."descricao" AS "category",
    COALESCE(SUM(soi."precovenda" * soi."quantidade"), 0) AS "revenue",
    COALESCE(SUM(soi."quantidade"), 0) AS "quantity"
  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
  LEFT JOIN "produto" p ON p.id = ps."id_produto"
  LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
 WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${othersProductTypesSqlList})
  GROUP BY tp."descricao"
  ORDER BY revenue DESC
`;

    try {
      const [
        rawResult,
        rawPeriodResult,
        rawTotalRevenueResult,
        rawAbTicketCountResult,
        bestSellingResult,
        leastSellingResult,
        revenueGroupByPeriodResult,
        rawAPeriodResult,
        rawBPeriodResult,
        resultByFood,
        resultByDrink,
        resultByOthers,
      ] = await Promise.all([
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(kpisRawSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(revenueAbPeriodSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(totalRevenueByPeriodSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(
          abTicketCountByPeriodSql,
        ),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(bestSellingItemsSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(leastSellingItemsSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(revenueGroupByPeriodSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(revenueAPeriodSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(revenueBPeriodSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(reportByFoodSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(reportByDrinkSql),
        this.prisma.prismaLocal.$queryRawUnsafe<any[]>(reportByOthersSql),
      ]);

      // --- BigNumbers ---
      let totalGrossRevenue = new Prisma.Decimal(0);
      let totalDiscount = new Prisma.Decimal(0);
      let totalABNetRevenue = new Prisma.Decimal(0);
      let rentalsWithABCount = 0;
      let totalAllSales = 0;

      for (const row of rawResult) {
        const gross = new Prisma.Decimal(row.totalGross);
        const discount = new Prisma.Decimal(row.desconto);
        const abTotal = new Prisma.Decimal(row.abTotal);
        const netAB = abTotal.minus(discount);

        totalGrossRevenue = totalGrossRevenue.plus(gross);
        totalDiscount = totalDiscount.plus(discount);

        if (abTotal.gt(0)) {
          totalABNetRevenue = totalABNetRevenue.plus(netAB);
          rentalsWithABCount++;
        }

        if (gross.gt(0)) {
          totalAllSales++;
        }
      }

      const totalNetRevenue = totalGrossRevenue.minus(totalDiscount);
      const totalRentals = rawResult.length;
      const totalAllTicketAverage =
        rentalsWithABCount > 0
          ? totalABNetRevenue.div(rentalsWithABCount)
          : new Prisma.Decimal(0);
      const totalAllTicketAverageByTotalRentals =
        totalRentals > 0
          ? totalABNetRevenue.div(totalRentals)
          : new Prisma.Decimal(0);

      const isMonthly = moment(endDate).diff(moment(startDate), 'days') > 31;

      // --- RevenueAbByPeriod / Percent / TicketAverageByPeriod ---
      const abGrouped = new Map<string, number>();
      const totalGrouped = new Map<string, number>();
      const rentalsWithAbGrouped = new Map<string, number>();

      for (const abItem of rawPeriodResult) {
        const dateKey = isMonthly
          ? moment(abItem.date).format('YYYY-MM')
          : moment(abItem.date).format('YYYY-MM-DD');
        const current = abGrouped.get(dateKey) || 0;
        abGrouped.set(dateKey, current + Number(abItem.totalValue));
      }

      for (const totalItem of rawTotalRevenueResult) {
        const dateKey = isMonthly
          ? moment(totalItem.date).format('YYYY-MM')
          : moment(totalItem.date).format('YYYY-MM-DD');
        const current = totalGrouped.get(dateKey) || 0;
        totalGrouped.set(dateKey, current + Number(totalItem.totalRevenue));
      }

      for (const item of rawAbTicketCountResult) {
        const dateKey = isMonthly
          ? moment(item.date).format('YYYY-MM')
          : moment(item.date).format('YYYY-MM-DD');
        const current = rentalsWithAbGrouped.get(dateKey) || 0;
        rentalsWithAbGrouped.set(dateKey, current + Number(item.rentalsWithAB));
      }

      const dateKeys = [...abGrouped.keys()].sort();

      const revenueAbByPeriod = {
        categories: dateKeys.map((key) =>
          isMonthly
            ? moment(key, 'YYYY-MM').format('MM/YYYY')
            : moment(key).format('DD/MM/YYYY'),
        ),
        series: dateKeys.map((key) =>
          Number((abGrouped.get(key) || 0).toFixed(2)),
        ),
      };

      const revenueAbByPeriodPercent = {
        categories: revenueAbByPeriod.categories,
        series: dateKeys.map((key) => {
          const ab = abGrouped.get(key) || 0;
          const total = totalGrouped.get(key) || 0;
          const percent = total > 0 ? (ab / total) * 100 : 0;
          return Number(percent.toFixed(2));
        }),
      };

      const ticketAverageByPeriod = {
        categories: revenueAbByPeriod.categories,
        series: dateKeys.map((key) => {
          const ab = abGrouped.get(key) || 0;
          const rentals = rentalsWithAbGrouped.get(key) || 0;
          const ticket = rentals > 0 ? ab / rentals : 0;
          return Number(ticket.toFixed(2));
        }),
      };

      // --- BestSellingItems / LeastSellingItems ---
      const bestSellingItems = {
        categories: bestSellingResult.map((item) => item.productName),
        series: bestSellingResult.map((item) => Number(item.totalSales)),
      };

      const leastSellingItems = {
        categories: leastSellingResult.map((item) => item.productName),
        series: leastSellingResult.map((item) => Number(item.totalSales)),
      };

      // --- RevenueByGroupPeriod ---
      const revenueGrouped = new Map<
        string,
        { ALIMENTOS: number; BEBIDAS: number; OUTROS: number }
      >();

      for (const row of revenueGroupByPeriodResult) {
        const dateKey = isMonthly
          ? moment(row.date).format('YYYY-MM')
          : moment(row.date).format('YYYY-MM-DD');

        if (!revenueGrouped.has(dateKey)) {
          revenueGrouped.set(dateKey, { ALIMENTOS: 0, BEBIDAS: 0, OUTROS: 0 });
        }

        const current = revenueGrouped.get(dateKey)!;
        current.ALIMENTOS += Number(row.ALIMENTOS) || 0;
        current.BEBIDAS += Number(row.BEBIDAS) || 0;
        current.OUTROS += Number(row.OUTROS) || 0;
      }

      const revenueKeys = [...revenueGrouped.keys()].sort();
      const alimentosSeries = revenueKeys.map((key) =>
        Number(revenueGrouped.get(key)!.ALIMENTOS.toFixed(2)),
      );
      const bebidasSeries = revenueKeys.map((key) =>
        Number(revenueGrouped.get(key)!.BEBIDAS.toFixed(2)),
      );
      const outrosSeries = revenueKeys.map((key) =>
        Number(revenueGrouped.get(key)!.OUTROS.toFixed(2)),
      );

      const revenueByGroupPeriod = {
        categories: revenueKeys.map((key) =>
          isMonthly
            ? moment(key, 'YYYY-MM').format('MM/YYYY')
            : moment(key).format('DD/MM/YYYY'),
        ),
        series: [
          { name: 'ALIMENTOS', data: alimentosSeries },
          { name: 'BEBIDAS', data: bebidasSeries },
          { name: 'OUTROS', data: outrosSeries },
        ],
      };

      // --- RevenueFoodByPeriod / RevenueDrinksByPeriod ---
      function buildRevenueSeries(rawData: any[], isMonthly: boolean) {
        const dateSet = new Set<string>();
        const categoryMap = new Map<string, Map<string, number>>();

        for (const item of rawData) {
          const dateKey = isMonthly
            ? moment(item.date).format('YYYY-MM')
            : moment(item.date).format('YYYY-MM-DD');
          const category = item.category || 'OUTROS';
          dateSet.add(dateKey);

          if (!categoryMap.has(category)) {
            categoryMap.set(category, new Map());
          }

          const categoryData = categoryMap.get(category)!;
          const current = categoryData.get(dateKey) || 0;
          categoryData.set(dateKey, current + Number(item.totalValue));
        }

        const sortedDates = [...dateSet].sort();
        const categories = sortedDates.map((key) =>
          isMonthly
            ? moment(key, 'YYYY-MM').format('MM/YYYY')
            : moment(key).format('DD/MM/YYYY'),
        );

        const series = [...categoryMap.entries()].map(([category, dateMap]) => {
          const data = sortedDates.map((date) =>
            Number((dateMap.get(date) || 0).toFixed(2)),
          );
          return { name: category, data };
        });

        return { categories, series };
      }

      const revenueAByPeriod = (() => {
        const { categories, series } = buildRevenueSeries(
          rawAPeriodResult,
          isMonthly,
        );
        return { categoriesFood: categories, seriesFood: series };
      })();

      const revenueBByPeriod = (() => {
        const { categories, series } = buildRevenueSeries(
          rawBPeriodResult,
          isMonthly,
        );
        return { categoriesDrink: categories, seriesDrink: series };
      })();

      // --- ReportByFood / Drinks / Others ---
      function buildReport(
        data: any[],
        totalRevenue: number,
        totalQuantity: number,
      ) {
        return [
          ...data.map((row) => ({
            name: row.category,
            revenue: Number(row.revenue),
            revenuePercent: totalRevenue
              ? Number(((row.revenue / totalRevenue) * 100).toFixed(2))
              : 0,
            quantity: Number(row.quantity),
            quantityPercent: totalQuantity
              ? Number(((row.quantity / totalQuantity) * 100).toFixed(2))
              : 0,
          })),
          {
            name: 'TOTAL',
            revenue: Number(totalRevenue.toFixed(2)),
            revenuePercent: 100,
            quantity: totalQuantity,
            quantityPercent: 100,
          },
        ];
      }

      const totalRevenueFood = resultByFood.reduce(
        (acc, row) => acc + Number(row.revenue),
        0,
      );
      const totalQuantityFood = resultByFood.reduce(
        (acc, row) => acc + Number(row.quantity),
        0,
      );
      const reportByFood = buildReport(
        resultByFood,
        totalRevenueFood,
        totalQuantityFood,
      );

      const totalRevenueDrink = resultByDrink.reduce(
        (acc, row) => acc + Number(row.revenue),
        0,
      );
      const totalQuantityDrink = resultByDrink.reduce(
        (acc, row) => acc + Number(row.quantity),
        0,
      );
      const reportByDrink = buildReport(
        resultByDrink,
        totalRevenueDrink,
        totalQuantityDrink,
      );

      const totalRevenueOthers = resultByOthers.reduce(
        (acc, row) => acc + Number(row.revenue),
        0,
      );
      const totalQuantityOthers = resultByOthers.reduce(
        (acc, row) => acc + Number(row.quantity),
        0,
      );
      const reportByOthers = buildReport(
        resultByOthers,
        totalRevenueOthers,
        totalQuantityOthers,
      );

      // --- Return final ---
      return {
        Company: 'Lush Ipiranga',
        BigNumbers: [
          {
            currentDate: {
              totalAllValue: Number(totalABNetRevenue),
              totalAllSales: totalAllSales,
              totalAllTicketAverage: Number(totalAllTicketAverage.toFixed(2)),
              totalAllTicketAverageByTotalRentals: Number(
                totalAllTicketAverageByTotalRentals.toFixed(2),
              ),
            },
          },
        ],
        RevenueAbByPeriod: revenueAbByPeriod,
        RevenueAbByPeriodPercent: revenueAbByPeriodPercent,
        TicketAverageByPeriod: ticketAverageByPeriod,
        BestSellingItems: bestSellingItems,
        LeastSellingItems: leastSellingItems,
        RevenueByGroupPeriod: revenueByGroupPeriod,
        RevenueFoodByPeriod: revenueAByPeriod,
        RevenueDrinksByPeriod: revenueBByPeriod,
        ReportByDrinks: reportByDrink,
        ReportByOthers: reportByOthers,
        ReportByFood: reportByFood,
      };
    } catch (error) {
      console.error('Erro ao executar queries dos KPIs do restaurante:', error);
      throw new BadRequestException(
        `Falha ao calcular os KPIs do restaurante: ${error.message}`,
      );
    }
  }
}

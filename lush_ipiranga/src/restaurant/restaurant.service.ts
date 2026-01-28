import { Prisma } from '@client-local';
import { BadRequestException, Injectable } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { CachePeriodEnum } from '../cache/cache.interfaces';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueryUtilsService } from '@lhg/utils';

@Injectable()
export class RestaurantService {
  constructor(
    private prisma: PrismaService,
    private kpiCacheService: KpiCacheService,
    private queryUtils: QueryUtilsService,
  ) {}

  async calculateKpisByDateRange(startDate: Date, endDate: Date) {
    // Calcula o período anterior automaticamente
    const startMoment = moment(startDate);
    const endMoment = moment(endDate);
    const daysDiff = endMoment.diff(startMoment, 'days') + 1; // +1 porque inclui ambos os dias

    // Período anterior: mesmo número de dias, terminando no dia anterior ao startDate
    const previousEndDate = startMoment.clone().subtract(1, 'day').toDate();
    const previousStartDate = moment(previousEndDate)
      .subtract(daysDiff - 1, 'days')
      .toDate();

    // Busca período atual com cache
    const currentResult = await this.kpiCacheService.getOrCalculate(
      'restaurant',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpisByDateRangeInternal(startDate, endDate),
      { start: startDate, end: endDate },
    );

    // Busca período anterior com cache
    const previousResult = await this.kpiCacheService.getOrCalculate(
      'restaurant',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpisByDateRangeInternal(previousStartDate, previousEndDate),
      { start: previousStartDate, end: previousEndDate },
    );

    const currentData = currentResult.data;
    const previousData = previousResult.data;

    // Extrair BigNumbers dos períodos
    const currentBigNumbers = currentData.BigNumbers[0];
    const previousBigNumbers = previousData.BigNumbers[0];

    // Calcular previsão mensal (monthlyForecast)
    const nowForForecast = moment.tz('America/Sao_Paulo');
    const currentMonthStart = nowForForecast.clone().startOf('month');
    const currentMonthEnd = nowForForecast.clone().endOf('month');
    const todayForForecast = nowForForecast.clone().startOf('day');
    const yesterday = todayForForecast.clone().subtract(1, 'day');

    // Dias do mês
    const totalDaysInMonth = currentMonthEnd.date();
    const daysElapsed = yesterday.date();
    const remainingDays = totalDaysInMonth - daysElapsed;

    // Buscar dados do mês atual para forecast (do dia 1 até ontem)
    const monthStartDate = currentMonthStart
      .clone()
      .set({ hour: 6, minute: 0, second: 0 })
      .toDate();
    const monthEndDate = yesterday
      .clone()
      .set({ hour: 5, minute: 59, second: 59 })
      .add(1, 'day')
      .toDate();

    // Busca dados do mês com cache
    const monthlyResult = await this.kpiCacheService.getOrCalculate(
      'restaurant',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpisByDateRangeInternal(monthStartDate, monthEndDate),
      { start: monthStartDate, end: monthEndDate },
    );

    const monthlyData = monthlyResult.data;
    const monthlyBigNumbers = monthlyData.BigNumbers[0];

    // Calcular forecast
    let monthlyForecast: any = undefined;

    if (daysElapsed > 0) {
      const monthlyTotalValue = monthlyBigNumbers.currentDate.totalAllValue;
      const monthlyTotalSalesRevenue = monthlyBigNumbers.currentDate.totalAllSalesRevenue;
      const monthlyTotalSales = monthlyBigNumbers.currentDate.totalAllSales;

      // Média diária
      const dailyAverageValue = monthlyTotalValue / daysElapsed;
      const dailyAverageSalesRevenue = monthlyTotalSalesRevenue / daysElapsed;
      const dailyAverageSales = monthlyTotalSales / daysElapsed;

      // Projeções
      const forecastValue = monthlyTotalValue + dailyAverageValue * remainingDays;
      const forecastSalesRevenue = monthlyTotalSalesRevenue + dailyAverageSalesRevenue * remainingDays;
      const forecastSales = monthlyTotalSales + dailyAverageSales * remainingDays;

      // Métricas recalculadas
      const forecastTicketAverage =
        forecastSales > 0 ? Number((forecastValue / forecastSales).toFixed(2)) : 0;

      monthlyForecast = {
        totalAllValueForecast: Number(forecastValue.toFixed(2)),
        totalAllSalesRevenueForecast: Number(forecastSalesRevenue.toFixed(2)),
        totalAllSalesForecast: Math.round(forecastSales),
        totalAllTicketAverageForecast: forecastTicketAverage,
        totalAllTicketAverageByTotalRentalsForecast:
          monthlyBigNumbers.currentDate.totalAllTicketAverageByTotalRentals,
        abRepresentativityForecast: monthlyBigNumbers.currentDate.abRepresentativity,
        salesRepresentativityForecast: monthlyBigNumbers.currentDate.salesRepresentativity,
      };
    }

    // Montar BigNumbers com previousDate e monthlyForecast
    const combinedBigNumbers = {
      currentDate: currentBigNumbers.currentDate,
      previousDate: {
        totalAllValuePreviousData: previousBigNumbers.currentDate.totalAllValue,
        totalAllSalesRevenuePreviousData: previousBigNumbers.currentDate.totalAllSalesRevenue,
        totalAllSalesPreviousData: previousBigNumbers.currentDate.totalAllSales,
        totalAllTicketAveragePreviousData: previousBigNumbers.currentDate.totalAllTicketAverage,
        totalAllTicketAverageByTotalRentalsPreviousData:
          previousBigNumbers.currentDate.totalAllTicketAverageByTotalRentals,
        abRepresentativityPreviousData: previousBigNumbers.currentDate.abRepresentativity,
        salesRepresentativityPreviousData: previousBigNumbers.currentDate.salesRepresentativity,
      },
      monthlyForecast,
    };

    // Retornar dados do período atual com BigNumbers combinado
    return {
      ...currentData,
      BigNumbers: [combinedBigNumbers],
    };
  }

  /**
   * Método interno que faz o cálculo real dos KPIs de Restaurante
   * Chamado pelo cache service quando há cache miss
   */
  private async _calculateKpisByDateRangeInternal(startDate: Date, endDate: Date) {
    const abProductTypes = [78, 64, 77, 57, 56, 79, 54, 55, 80, 53, 62, 59, 61, 58, 63];

    const aProductTypes = [78, 64, 77, 57, 62, 59, 61, 58, 63];

    const bProductTypes = [56, 79, 54, 55, 80, 53];

    // Alimentos para ranking (aProductTypes sem 78, 77, 63)
    const aProductTypesForRanking = [64, 57, 62, 59, 61, 58];

    // Bebidas para ranking (bProductTypes - nenhum removido)
    const bProductTypesForRanking = [56, 79, 54, 55, 80, 53];

    // Alimentos para ranking de menos vendidos (aProductTypes sem 78, 77, 63, 57)
    const aProductTypesForLeastRanking = [64, 62, 59, 61, 58];

    // Bebidas para ranking de menos vendidos (bProductTypes - nenhum removido)
    const bProductTypesForLeastRanking = [56, 79, 54, 55, 80, 53];

    const othersList = [71, 72, 69, 68, 70];

    // Formatação segura de datas usando QueryUtilsService
    const startForDate = moment.utc(startDate).set({ hour: 6, minute: 0, second: 0 }).toDate();
    const endForDate = moment.utc(endDate).add(1, 'day').set({ hour: 5, minute: 59, second: 59 }).toDate();

    const formattedStart = this.queryUtils.formatDateToSQL(startForDate);
    const formattedEnd = this.queryUtils.formatDateToSQL(endForDate);

    // Sanitização segura de listas de IDs usando QueryUtilsService
    const abProductTypesSqlList = this.queryUtils.sanitizeIdList(abProductTypes);
    const aProductTypesSqlList = this.queryUtils.sanitizeIdList(aProductTypes);
    const bProductTypesSqlList = this.queryUtils.sanitizeIdList(bProductTypes);
    const othersProductTypesSqlList = this.queryUtils.sanitizeIdList(othersList);

    // Safe parameterized query - convert concatenated arrays to Prisma.join
    const abProductTypesParam = Prisma.join(abProductTypes);
    const aProductTypesForRankingParam = Prisma.join(aProductTypesForRanking);
    const bProductTypesForRankingParam = Prisma.join(bProductTypesForRanking);
    const aProductTypesForLeastRankingParam = Prisma.join(aProductTypesForLeastRanking);
    const bProductTypesForLeastRankingParam = Prisma.join(bProductTypesForLeastRanking);

    const kpisRawSql = Prisma.sql`
  SELECT
    ra."id_apartamentostate",
    so.id AS "id_saidaestoque",
    TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
    COALESCE(SUM(soi."precovenda" * soi."quantidade"), 0) AS "totalGross",
    COALESCE(s."desconto", 0) AS "desconto",
    COALESCE(SUM(
      CASE
        WHEN tp.id IN (${abProductTypesParam})
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
  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'
  GROUP BY ra."id_apartamentostate", so.id, s."desconto", ra."datainicialdaocupacao"
`;

    const revenueAbPeriodSql = Prisma.sql`
  SELECT
    TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
    COALESCE(SUM(
      CASE
        WHEN tp.id IN (${abProductTypesParam}) THEN
          (soi."precovenda" * soi."quantidade") * 
          (
            1 - COALESCE(s."desconto", 0) / NULLIF(so_total."total_bruto", 0)
          )
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
  LEFT JOIN "venda" s ON s."id_saidaestoque" = so.id
  LEFT JOIN (
    SELECT 
      soi."id_saidaestoque", 
      SUM(soi."precovenda" * soi."quantidade") AS total_bruto
    FROM "saidaestoqueitem" soi
    WHERE soi."cancelado" IS NULL
    GROUP BY soi."id_saidaestoque"
  ) AS so_total ON so_total."id_saidaestoque" = so.id
  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'
  GROUP BY "date"
  ORDER BY "date" DESC
`;

    const totalRevenueByPeriodSql = Prisma.sql`
  SELECT
    "date",
    SUM("valor") AS "totalRevenue"
  FROM (
    -- Receita de locações (valortotal já inclui consumo)
    SELECT
      TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",
      ra."valortotal" AS "valor"
    FROM "locacaoapartamento" ra
    WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
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
    WHERE so."datasaida" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    GROUP BY TO_CHAR(so."datasaida" - INTERVAL '6 hours', 'YYYY-MM-DD'), v."desconto"
  ) AS all_revenues
  GROUP BY "date"
  ORDER BY "date" DESC;
`;

    const abTicketCountByPeriodSql = Prisma.sql`
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
  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${abProductTypesParam})
  GROUP BY "date"
  ORDER BY "date" DESC
`;

    // Consultas separadas para ALIMENTOS
    const bestSellingFoodSql = Prisma.sql`
  SELECT
    p."descricao" AS "productName",
    SUM(soi."precovenda" * soi."quantidade") AS "totalRevenue",
    SUM(soi."quantidade") AS "totalSales"
  FROM "saidaestoque" so
  JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  JOIN "produtoestoque" pe ON pe.id = soi."id_produtoestoque"
  JOIN "produto" p ON p.id = pe."id_produto"
  JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE tp.id IN (${aProductTypesForRankingParam})
    AND so."datasaida" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
  GROUP BY p."descricao"
  ORDER BY "totalRevenue" DESC
  LIMIT 10;
`;

    const leastSellingFoodSql = Prisma.sql`
  SELECT
    p."descricao" AS "productName",
    SUM(soi."precovenda" * soi."quantidade") AS "totalRevenue",
    SUM(soi."quantidade") AS "totalSales"
  FROM "saidaestoque" so
  JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  JOIN "produtoestoque" pe ON pe.id = soi."id_produtoestoque"
  JOIN "produto" p ON p.id = pe."id_produto"
  JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE tp.id IN (${aProductTypesForLeastRankingParam})
    AND so."datasaida" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
  GROUP BY p."descricao"
  HAVING SUM(soi."precovenda" * soi."quantidade") > 0
  ORDER BY "totalRevenue" ASC
  LIMIT 10;
`;

    // Consultas separadas para BEBIDAS
    const bestSellingDrinksSql = Prisma.sql`
  SELECT
    p."descricao" AS "productName",
    SUM(soi."precovenda" * soi."quantidade") AS "totalRevenue",
    SUM(soi."quantidade") AS "totalSales"
  FROM "saidaestoque" so
  JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  JOIN "produtoestoque" pe ON pe.id = soi."id_produtoestoque"
  JOIN "produto" p ON p.id = pe."id_produto"
  JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE tp.id IN (${bProductTypesForRankingParam})
    AND so."datasaida" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
  GROUP BY p."descricao"
  ORDER BY "totalRevenue" DESC
  LIMIT 10;
`;

    const leastSellingDrinksSql = Prisma.sql`
  SELECT
    p."descricao" AS "productName",
    SUM(soi."precovenda" * soi."quantidade") AS "totalRevenue",
    SUM(soi."quantidade") AS "totalSales"
  FROM "saidaestoque" so
  JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  JOIN "produtoestoque" pe ON pe.id = soi."id_produtoestoque"
  JOIN "produto" p ON p.id = pe."id_produto"
  JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
  WHERE tp.id IN (${bProductTypesForLeastRankingParam})
    AND so."datasaida" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
  GROUP BY p."descricao"
  HAVING SUM(soi."precovenda" * soi."quantidade") > 0
  ORDER BY "totalRevenue" ASC
  LIMIT 10;
`;

    const aProductTypesParam = Prisma.join(aProductTypes);
    const bProductTypesParam = Prisma.join(bProductTypes);

    const revenueGroupByPeriodSql = Prisma.sql`
  SELECT
    TO_CHAR(ra."datainicialdaocupacao" - INTERVAL '6 hours', 'YYYY-MM-DD') AS "date",

    COALESCE(SUM(
      CASE
        WHEN tp.id IN (${aProductTypesParam})
        THEN soi."precovenda" * soi."quantidade"
        ELSE 0
      END
    ), 0) AS "ALIMENTOS",

    COALESCE(SUM(
      CASE
        WHEN tp.id IN (${bProductTypesParam})
        THEN soi."precovenda" * soi."quantidade"
        ELSE 0
      END
    ), 0) AS "BEBIDAS",

    COALESCE(SUM(
      CASE
        WHEN tp.id NOT IN (${abProductTypesParam})
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

  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'

  GROUP BY "date"
  ORDER BY "date" DESC;
`;

    const revenueAPeriodSql = Prisma.sql`
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
  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${aProductTypesParam})
  GROUP BY "date", tp."descricao"
  ORDER BY "date" DESC;
`;

    const revenueBPeriodSql = Prisma.sql`
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
  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${bProductTypesParam})
  GROUP BY "date", tp."descricao"
  ORDER BY "date" DESC;
`;

    const reportByFoodSql = Prisma.sql`
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
  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${aProductTypesParam})
  GROUP BY tp."descricao"
  ORDER BY revenue DESC
`;

    const reportByDrinkSql = Prisma.sql`
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
  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${bProductTypesParam})
  GROUP BY tp."descricao"
  ORDER BY revenue DESC
`;

    const othersProductTypesParam = Prisma.join(othersList);

    // Query para faturamento total da empresa (locações + vendas diretas)
    const companyTotalRevenueSql = Prisma.sql`
  SELECT
    COALESCE(SUM("valor"), 0) AS "totalCompanyRevenue"
  FROM (
    -- Receita de locações (valortotal já inclui consumo)
    SELECT ra."valortotal" AS "valor"
    FROM "locacaoapartamento" ra
    WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
      AND ra."fimocupacaotipo" = 'FINALIZADA'

    UNION ALL

    -- Receita de vendas diretas (soma dos itens - desconto)
    SELECT COALESCE(SUM(soi."precovenda" * soi."quantidade"), 0) - COALESCE(v."desconto", 0) AS "valor"
    FROM "vendadireta" vd
    INNER JOIN "saidaestoque" so ON so.id = vd."id_saidaestoque"
    LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
    LEFT JOIN "venda" v ON v."id_saidaestoque" = so.id
    WHERE so."datasaida" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    GROUP BY v."desconto"
  ) AS all_revenues
`;

    // Query para receita total de vendas/consumo (todos os produtos, não só A&B)
    const totalSalesRevenueSql = Prisma.sql`
  SELECT
    COALESCE(SUM(
      (soi."precovenda" * soi."quantidade") *
      (1 - COALESCE(s."desconto", 0) / NULLIF(so_total."total_bruto", 0))
    ), 0) AS "totalSalesRevenue"
  FROM "locacaoapartamento" ra
  LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
  LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
  LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
  LEFT JOIN "venda" s ON s."id_saidaestoque" = so.id
  LEFT JOIN (
    SELECT
      soi."id_saidaestoque",
      SUM(soi."precovenda" * soi."quantidade") AS total_bruto
    FROM "saidaestoqueitem" soi
    WHERE soi."cancelado" IS NULL
    GROUP BY soi."id_saidaestoque"
  ) AS so_total ON so_total."id_saidaestoque" = so.id
  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'
`;

    const reportByOthersSql = Prisma.sql`
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
  WHERE ra."datainicialdaocupacao" BETWEEN ${formattedStart}::timestamp AND ${formattedEnd}::timestamp
    AND ra."fimocupacaotipo" = 'FINALIZADA'
    AND tp.id IN (${othersProductTypesParam})
  GROUP BY tp."descricao"
  ORDER BY revenue DESC
`;

    try {
      const [
        rawResult,
        rawPeriodResult,
        rawTotalRevenueResult,
        rawAbTicketCountResult,
        bestSellingFoodResult,
        leastSellingFoodResult,
        bestSellingDrinksResult,
        leastSellingDrinksResult,
        revenueGroupByPeriodResult,
        rawAPeriodResult,
        rawBPeriodResult,
        resultByFood,
        resultByDrink,
        resultByOthers,
        companyTotalRevenueResult,
        totalSalesRevenueResult,
      ] = await Promise.all([
        this.prisma.prismaLocal.$queryRaw<any[]>(kpisRawSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(revenueAbPeriodSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(totalRevenueByPeriodSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(abTicketCountByPeriodSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(bestSellingFoodSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(leastSellingFoodSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(bestSellingDrinksSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(leastSellingDrinksSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(revenueGroupByPeriodSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(revenueAPeriodSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(revenueBPeriodSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(reportByFoodSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(reportByDrinkSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(reportByOthersSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(companyTotalRevenueSql),
        this.prisma.prismaLocal.$queryRaw<any[]>(totalSalesRevenueSql),
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
        const discountProportion = gross.gt(0)
          ? discount.mul(abTotal).div(gross)
          : new Prisma.Decimal(0);
        const netAB = abTotal.minus(discountProportion);

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
        rentalsWithABCount > 0 ? totalABNetRevenue.div(rentalsWithABCount) : new Prisma.Decimal(0);
      const totalAllTicketAverageByTotalRentals =
        totalRentals > 0 ? totalABNetRevenue.div(totalRentals) : new Prisma.Decimal(0);

      // Faturamento total da empresa e receita total de vendas
      const companyTotalRevenue = Number(companyTotalRevenueResult[0]?.totalCompanyRevenue || 0);
      const totalSalesRevenue = Number(totalSalesRevenueResult[0]?.totalSalesRevenue || 0);

      // Representatividades (em percentual)
      const abRepresentativity =
        companyTotalRevenue > 0
          ? Number(((Number(totalABNetRevenue) / companyTotalRevenue) * 100).toFixed(2))
          : 0;
      const salesRepresentativity =
        companyTotalRevenue > 0
          ? Number(((totalSalesRevenue / companyTotalRevenue) * 100).toFixed(2))
          : 0;

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
          isMonthly ? moment(key, 'YYYY-MM').format('MM/YYYY') : moment(key).format('DD/MM/YYYY'),
        ),
        series: dateKeys.map((key) => Number((abGrouped.get(key) || 0).toFixed(2))),
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

      // --- Rankings de Alimentos e Bebidas ---
      // Representatividade calculada com base na receita total de A&B
      const totalABRevenueNumber = Number(totalABNetRevenue);

      const bestSellingFood = bestSellingFoodResult.map((item: any) => ({
        name: item.productName,
        totalRevenue: Number(Number(item.totalRevenue).toFixed(2)),
        totalSales: Number(item.totalSales),
        totalRepresentation:
          totalABRevenueNumber > 0
            ? Number(((Number(item.totalRevenue) / totalABRevenueNumber) * 100).toFixed(2))
            : 0,
      }));

      const leastSellingFood = leastSellingFoodResult.map((item: any) => ({
        name: item.productName,
        totalRevenue: Number(Number(item.totalRevenue).toFixed(2)),
        totalSales: Number(item.totalSales),
        totalRepresentation:
          totalABRevenueNumber > 0
            ? Number(((Number(item.totalRevenue) / totalABRevenueNumber) * 100).toFixed(2))
            : 0,
      }));

      const bestSellingDrinks = bestSellingDrinksResult.map((item: any) => ({
        name: item.productName,
        totalRevenue: Number(Number(item.totalRevenue).toFixed(2)),
        totalSales: Number(item.totalSales),
        totalRepresentation:
          totalABRevenueNumber > 0
            ? Number(((Number(item.totalRevenue) / totalABRevenueNumber) * 100).toFixed(2))
            : 0,
      }));

      const leastSellingDrinks = leastSellingDrinksResult.map((item: any) => ({
        name: item.productName,
        totalRevenue: Number(Number(item.totalRevenue).toFixed(2)),
        totalSales: Number(item.totalSales),
        totalRepresentation:
          totalABRevenueNumber > 0
            ? Number(((Number(item.totalRevenue) / totalABRevenueNumber) * 100).toFixed(2))
            : 0,
      }));

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
          isMonthly ? moment(key, 'YYYY-MM').format('MM/YYYY') : moment(key).format('DD/MM/YYYY'),
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
          isMonthly ? moment(key, 'YYYY-MM').format('MM/YYYY') : moment(key).format('DD/MM/YYYY'),
        );

        const series = [...categoryMap.entries()].map(([category, dateMap]) => {
          const data = sortedDates.map((date) => Number((dateMap.get(date) || 0).toFixed(2)));
          return { name: category, data };
        });

        return { categories, series };
      }

      const revenueAByPeriod = (() => {
        const { categories, series } = buildRevenueSeries(rawAPeriodResult, isMonthly);
        return { categoriesFood: categories, seriesFood: series };
      })();

      const revenueBByPeriod = (() => {
        const { categories, series } = buildRevenueSeries(rawBPeriodResult, isMonthly);
        return { categoriesDrink: categories, seriesDrink: series };
      })();

      // --- ReportByFood / Drinks / Others ---
      function buildReport(data: any[], totalRevenue: number, totalQuantity: number) {
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

      const totalRevenueFood = resultByFood.reduce((acc, row) => acc + Number(row.revenue), 0);
      const totalQuantityFood = resultByFood.reduce((acc, row) => acc + Number(row.quantity), 0);
      const reportByFood = buildReport(resultByFood, totalRevenueFood, totalQuantityFood);

      const totalRevenueDrink = resultByDrink.reduce((acc, row) => acc + Number(row.revenue), 0);
      const totalQuantityDrink = resultByDrink.reduce((acc, row) => acc + Number(row.quantity), 0);
      const reportByDrink = buildReport(resultByDrink, totalRevenueDrink, totalQuantityDrink);

      const totalRevenueOthers = resultByOthers.reduce((acc, row) => acc + Number(row.revenue), 0);
      const totalQuantityOthers = resultByOthers.reduce(
        (acc, row) => acc + Number(row.quantity),
        0,
      );
      const reportByOthers = buildReport(resultByOthers, totalRevenueOthers, totalQuantityOthers);

      // --- Return final ---
      return {
        Company: 'Lush Ipiranga',
        BigNumbers: [
          {
            currentDate: {
              totalAllValue: Number(totalABNetRevenue.toFixed(2)),
              totalAllSalesRevenue: Number(totalSalesRevenue.toFixed(2)),
              totalAllSales: totalAllSales,
              totalAllTicketAverage: Number(totalAllTicketAverage.toFixed(2)),
              totalAllTicketAverageByTotalRentals: Number(
                totalAllTicketAverageByTotalRentals.toFixed(2),
              ),
              abRepresentativity: abRepresentativity,
              salesRepresentativity: salesRepresentativity,
            },
          },
        ],
        RevenueAbByPeriod: revenueAbByPeriod,
        RevenueAbByPeriodPercent: revenueAbByPeriodPercent,
        TicketAverageByPeriod: ticketAverageByPeriod,
        BestSellingFood: bestSellingFood,
        LeastSellingFood: leastSellingFood,
        BestSellingDrinks: bestSellingDrinks,
        LeastSellingDrinks: leastSellingDrinks,
        RevenueByGroupPeriod: revenueByGroupPeriod,
        RevenueFoodByPeriod: revenueAByPeriod,
        RevenueDrinksByPeriod: revenueBByPeriod,
        ReportByDrinks: reportByDrink,
        ReportByOthers: reportByOthers,
        ReportByFood: reportByFood,
      };
    } catch (error) {
      console.error('Erro ao executar queries dos KPIs do restaurante:', error);

      if (error instanceof Error) {
        throw new BadRequestException(`Falha ao calcular os KPIs do restaurante: ${error.message}`);
      }

      // fallback genérico se não for Error
      throw new BadRequestException('Falha ao calcular os KPIs do restaurante: erro desconhecido');
    }
  }
}

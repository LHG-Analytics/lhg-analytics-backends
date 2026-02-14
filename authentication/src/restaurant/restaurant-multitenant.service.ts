/**
 * Service para KPIs unificados de Restaurant - Versão Multi-Tenant
 * Conecta diretamente aos bancos de dados das unidades via SQL
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { CachePeriodEnum } from '../cache/cache.interfaces';
import { UnitKey, UNIT_CONFIGS } from '../database/database.interfaces';
import { DateUtilsService } from '../utils/date-utils.service';
import { CurrencyConversionService } from '../utils/currency-conversion.service';
import { ConcurrencyUtilsService } from '@lhg/utils';
import {
  UnifiedRestaurantKpiResponse,
  RestaurantBigNumbersData,
  ApexChartsData,
  ApexChartsMultiSeriesData,
  UnitRestaurantBigNumbers,
  UnitRestaurantKpiData,
} from './restaurant.interfaces';
import {
  getRestaurantBigNumbersSQL,
  getRevenueAbByDateSQL,
  getTotalRevenueByDateSQL,
  getSalesWithAbByDateSQL,
  getTotalSalesAndRevenueSQL,
} from './sql/restaurant.queries';

@Injectable()
export class RestaurantMultitenantService {
  private readonly logger = new Logger(RestaurantMultitenantService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly kpiCacheService: KpiCacheService,
    private readonly dateUtilsService: DateUtilsService,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly concurrencyUtils: ConcurrencyUtilsService,
  ) {}

  /**
   * Busca KPIs de todas as unidades e consolida
   */
  async getUnifiedKpis(
    startDate: string,
    endDate: string,
  ): Promise<UnifiedRestaurantKpiResponse> {
    const customDates = {
      start: this.dateUtilsService.parseDate(startDate),
      end: this.dateUtilsService.parseDate(endDate),
    };

    // Usa o cache service com TTL dinâmico
    const result = await this.kpiCacheService.getOrCalculate(
      'restaurant',
      CachePeriodEnum.CUSTOM,
      () => this.fetchAndConsolidateKpis(startDate, endDate),
      customDates,
    );

    return result.data;
  }

  /**
   * Executa queries em paralelo para todas as unidades e consolida
   */
  private async fetchAndConsolidateKpis(
    startDate: string,
    endDate: string,
  ): Promise<UnifiedRestaurantKpiResponse> {
    const startTime = Date.now();
    const connectedUnits = this.databaseService.getConnectedUnits();

    if (connectedUnits.length === 0) {
      throw new Error(
        'Nenhuma unidade conectada. Verifique as variáveis de ambiente.',
      );
    }

    this.logger.log(
      `Buscando KPIs de Restaurant de ${connectedUnits.length} unidades...`,
    );

    // Calcula período anterior (mesma duração, imediatamente antes)
    const { previousStart, previousEnd } =
      this.dateUtilsService.calculatePreviousPeriod(startDate, endDate);

    // Calcula período do mês atual para forecast (dia 1 às 06:00 até ontem às 05:59:59)
    const {
      monthStart,
      monthEnd,
      daysElapsed,
      remainingDays,
      totalDaysInMonth,
    } = this.dateUtilsService.calculateCurrentMonthPeriod();

    // Executa queries em paralelo para cada unidade (período atual + anterior + mês atual para forecast)
    // Limita a 2 unidades simultâneas para evitar sobrecarga do banco de dados
    const unitDataTasks = connectedUnits.map(
      (unit) => () =>
        this.fetchUnitKpis(
          unit,
          startDate,
          endDate,
          previousStart,
          previousEnd,
          monthStart,
          monthEnd,
        ),
    );

    const unitResults = await this.concurrencyUtils.executeWithLimit(
      unitDataTasks,
      2,
    );
    const validResults = unitResults.filter(
      (r) => r !== null,
    ) as UnitRestaurantKpiData[];

    if (validResults.length === 0) {
      throw new Error('Nenhuma unidade retornou dados válidos');
    }

    // Consolida os dados
    const consolidated = this.consolidateData(
      validResults,
      startDate,
      endDate,
      daysElapsed,
      remainingDays,
      totalDaysInMonth,
    );

    this.logger.log(
      `KPIs de Restaurant consolidados de ${validResults.length} unidades em ${Date.now() - startTime}ms`,
    );

    return consolidated;
  }

  /**
   * Busca KPIs de Restaurant de uma unidade específica (período atual + anterior + mês atual)
   */
  private async fetchUnitKpis(
    unit: UnitKey,
    startDate: string,
    endDate: string,
    previousStart: string,
    previousEnd: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<UnitRestaurantKpiData | null> {
    try {
      // Executa todas as queries em paralelo para a unidade (atual + anterior + mês atual)
      // Limita a 5 queries simultâneas por unidade para evitar sobrecarga
      const queryTasks = [
        () =>
          this.databaseService.query(
            unit,
            getRestaurantBigNumbersSQL(unit, startDate, endDate),
          ),
        () =>
          this.databaseService.query(
            unit,
            getRestaurantBigNumbersSQL(unit, previousStart, previousEnd),
          ),
        () =>
          this.databaseService.query(
            unit,
            getRestaurantBigNumbersSQL(unit, monthStart, monthEnd),
          ),
        () =>
          this.databaseService.query(
            unit,
            getTotalSalesAndRevenueSQL(unit, startDate, endDate),
          ),
        () =>
          this.databaseService.query(
            unit,
            getTotalSalesAndRevenueSQL(unit, previousStart, previousEnd),
          ),
        () =>
          this.databaseService.query(
            unit,
            getTotalSalesAndRevenueSQL(unit, monthStart, monthEnd),
          ),
        () =>
          this.databaseService.query(
            unit,
            getRevenueAbByDateSQL(unit, startDate, endDate),
          ),
        () =>
          this.databaseService.query(
            unit,
            getTotalRevenueByDateSQL(unit, startDate, endDate),
          ),
        () =>
          this.databaseService.query(
            unit,
            getSalesWithAbByDateSQL(unit, startDate, endDate),
          ),
      ];

      const [
        bigNumbersResult,
        bigNumbersPrevResult,
        bigNumbersMonthlyResult,
        salesRevenueResult,
        salesRevenuePrevResult,
        salesRevenueMonthlyResult,
        revenueAbResult,
        totalRevenueResult,
        salesWithAbResult,
      ] = await this.concurrencyUtils.executeWithLimit(queryTasks, 5);

      // Processa BigNumbers atual
      const bn = bigNumbersResult.rows[0] || {};
      const sr = salesRevenueResult.rows[0] || {};

      let totalValue = parseFloat(bn.total_ab_value) || 0;
      let totalSalesRevenue = parseFloat(sr.total_sales_revenue) || 0;
      let totalRevenue = parseFloat(sr.total_revenue) || 0;

      // Converte valores monetários de USD para BRL se for LIV
      if (unit === 'liv') {
        const endDateObj = this.dateUtilsService.parseDate(endDate);
        totalValue = await this.currencyConversionService.convertUsdToBrl(
          totalValue,
          unit,
          endDateObj,
        );
        totalSalesRevenue =
          await this.currencyConversionService.convertUsdToBrl(
            totalSalesRevenue,
            unit,
            endDateObj,
          );
        totalRevenue = await this.currencyConversionService.convertUsdToBrl(
          totalRevenue,
          unit,
          endDateObj,
        );
      }

      const bigNumbers: UnitRestaurantBigNumbers = {
        totalValue,
        totalSalesRevenue,
        totalSalesWithAb: parseInt(bn.total_sales_with_ab) || 0,
        totalAllSales: parseInt(bn.total_all_sales) || 0,
        totalRentals: parseInt(bn.total_rentals) || 0,
        totalRevenue,
      };

      // Processa BigNumbers anterior
      const bnPrev = bigNumbersPrevResult.rows[0] || {};
      const srPrev = salesRevenuePrevResult.rows[0] || {};

      let totalValuePrev = parseFloat(bnPrev.total_ab_value) || 0;
      let totalSalesRevenuePrev = parseFloat(srPrev.total_sales_revenue) || 0;
      let totalRevenuePrev = parseFloat(srPrev.total_revenue) || 0;

      // Converte valores monetários de USD para BRL se for LIV
      if (unit === 'liv') {
        const previousEndObj = this.dateUtilsService.parseDate(previousEnd);
        totalValuePrev = await this.currencyConversionService.convertUsdToBrl(
          totalValuePrev,
          unit,
          previousEndObj,
        );
        totalSalesRevenuePrev =
          await this.currencyConversionService.convertUsdToBrl(
            totalSalesRevenuePrev,
            unit,
            previousEndObj,
          );
        totalRevenuePrev = await this.currencyConversionService.convertUsdToBrl(
          totalRevenuePrev,
          unit,
          previousEndObj,
        );
      }

      const bigNumbersPrevious: UnitRestaurantBigNumbers = {
        totalValue: totalValuePrev,
        totalSalesRevenue: totalSalesRevenuePrev,
        totalSalesWithAb: parseInt(bnPrev.total_sales_with_ab) || 0,
        totalAllSales: parseInt(bnPrev.total_all_sales) || 0,
        totalRentals: parseInt(bnPrev.total_rentals) || 0,
        totalRevenue: totalRevenuePrev,
      };

      // Processa BigNumbers do mês atual (para forecast)
      const bnMonthly = bigNumbersMonthlyResult.rows[0] || {};
      const srMonthly = salesRevenueMonthlyResult.rows[0] || {};

      let totalValueMonthly = parseFloat(bnMonthly.total_ab_value) || 0;
      let totalSalesRevenueMonthly =
        parseFloat(srMonthly.total_sales_revenue) || 0;
      let totalRevenueMonthly = parseFloat(srMonthly.total_revenue) || 0;

      // Converte valores monetários de USD para BRL se for LIV
      if (unit === 'liv') {
        const monthEndObj = this.dateUtilsService.parseDate(monthEnd);
        totalValueMonthly =
          await this.currencyConversionService.convertUsdToBrl(
            totalValueMonthly,
            unit,
            monthEndObj,
          );
        totalSalesRevenueMonthly =
          await this.currencyConversionService.convertUsdToBrl(
            totalSalesRevenueMonthly,
            unit,
            monthEndObj,
          );
        totalRevenueMonthly =
          await this.currencyConversionService.convertUsdToBrl(
            totalRevenueMonthly,
            unit,
            monthEndObj,
          );
      }

      const bigNumbersMonthly: UnitRestaurantBigNumbers = {
        totalValue: totalValueMonthly,
        totalSalesRevenue: totalSalesRevenueMonthly,
        totalSalesWithAb: parseInt(bnMonthly.total_sales_with_ab) || 0,
        totalAllSales: parseInt(bnMonthly.total_all_sales) || 0,
        totalRentals: parseInt(bnMonthly.total_rentals) || 0,
        totalRevenue: totalRevenueMonthly,
      };

      // Processa séries por data
      const revenueAbByDate = new Map<string, number>();
      for (const row of revenueAbResult.rows) {
        let value = parseFloat(row.total_ab_value) || 0;
        if (unit === 'liv') {
          const rowDate = new Date(row.date);
          value = await this.currencyConversionService.convertUsdToBrl(
            value,
            unit,
            rowDate,
          );
        }
        revenueAbByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          value,
        );
      }

      const totalRevenueByDate = new Map<string, number>();
      for (const row of totalRevenueResult.rows) {
        let value = parseFloat(row.total_revenue) || 0;
        if (unit === 'liv') {
          const rowDate = new Date(row.date);
          value = await this.currencyConversionService.convertUsdToBrl(
            value,
            unit,
            rowDate,
          );
        }
        totalRevenueByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          value,
        );
      }

      const salesByDate = new Map<string, number>();
      for (const row of salesWithAbResult.rows) {
        salesByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          parseInt(row.rentals_with_ab) || 0,
        );
      }

      // Contagem de locações com A&B por data (para ticket médio)
      const rentalsWithAbByDate = new Map<string, number>();
      for (const row of salesWithAbResult.rows) {
        rentalsWithAbByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          parseInt(row.rentals_with_ab) || 0,
        );
      }

      this.logger.log(
        `KPIs de Restaurant de ${UNIT_CONFIGS[unit].name} obtidos com sucesso`,
      );

      return {
        unit,
        unitName: UNIT_CONFIGS[unit].name,
        bigNumbers,
        bigNumbersPrevious,
        bigNumbersMonthly,
        revenueAbByDate,
        salesByDate,
        totalRevenueByDate,
        rentalsWithAbByDate,
      };
    } catch (error) {
      this.logger.error(
        `Erro ao buscar KPIs de Restaurant de ${UNIT_CONFIGS[unit].name}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Consolida os dados de todas as unidades
   */
  private consolidateData(
    results: UnitRestaurantKpiData[],
    startDate: string,
    endDate: string,
    daysElapsed: number,
    remainingDays: number,
    totalDaysInMonth: number,
  ): UnifiedRestaurantKpiResponse {
    // Calcula a diferença de dias para determinar se agrupa por mês ou por dia
    const start = this.dateUtilsService.parseDate(startDate);
    const end = this.dateUtilsService.parseDate(endDate);
    const rangeDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    const groupByMonth = rangeDays > 40;

    // Gera todas as datas/meses do período e prepara as categorias
    const allPeriods = this.generatePeriodRange(
      startDate,
      endDate,
      groupByMonth,
    );
    const categories = allPeriods;

    // Consolida BigNumbers (com previousDate e monthlyForecast)
    const bigNumbers = this.consolidateBigNumbers(
      results,
      daysElapsed,
      remainingDays,
      totalDaysInMonth,
    );

    // RevenueByCompany - receita A&B total consolidada de cada unidade
    const revenueByCompany =
      this.calculateRevenueByCompanyConsolidated(results);

    // SalesByCompany - quantidade de vendas total consolidada de cada unidade
    const salesByCompany = this.calculateSalesByCompanyConsolidated(results);

    // RevenueAbByPeriod - receita A&B por unidade por data/mês
    const revenueAbByPeriod = this.calculateRevenueAbByPeriodGrouped(
      results,
      categories,
      groupByMonth,
    );

    // RevenueAbByPeriodPercent - percentual A&B por unidade por data/mês
    const revenueAbByPeriodPercent =
      this.calculateRevenueAbByPeriodPercentGrouped(
        results,
        categories,
        groupByMonth,
      );

    // TicketAverageByPeriod - ticket médio por unidade por data/mês
    const ticketAverageByPeriod = this.calculateTicketAverageByPeriodGrouped(
      results,
      categories,
      groupByMonth,
    );

    return {
      Company: 'LHG',
      BigNumbers: [bigNumbers],
      RevenueByCompany: revenueByCompany,
      SalesByCompany: salesByCompany,
      RevenueAbByPeriod: revenueAbByPeriod,
      RevenueAbByPeriodPercent: revenueAbByPeriodPercent,
      TicketAverageByPeriod: ticketAverageByPeriod,
    };
  }

  /**
   * Consolida BigNumbers de todas as unidades (com previousDate e monthlyForecast)
   * monthlyForecast: busca dados do mês atual (dia 1 até ontem) e projeta para o mês inteiro
   */
  private consolidateBigNumbers(
    results: UnitRestaurantKpiData[],
    daysElapsed: number,
    remainingDays: number,
    totalDaysInMonth: number,
  ): RestaurantBigNumbersData {
    // --- Dados atuais (período selecionado) ---
    let totalValue = 0;
    let totalSalesRevenue = 0;
    let totalSalesWithAb = 0; // Para cálculo do ticket médio (locações com A&B)
    let totalAllSales = 0; // Para BigNumbers (locações com qualquer consumo)
    let totalRentals = 0;
    let totalRevenue = 0;

    // --- Dados anteriores ---
    let totalValuePrev = 0;
    let totalSalesRevenuePrev = 0;
    let totalSalesWithAbPrev = 0;
    let totalAllSalesPrev = 0;
    let totalRentalsPrev = 0;
    let totalRevenuePrev = 0;

    // --- Dados do mês atual (para forecast) ---
    let monthlyTotalValue = 0;
    let monthlyTotalSalesRevenue = 0;
    let monthlyTotalSalesWithAb = 0;
    let monthlyTotalAllSales = 0;
    let monthlyTotalRentals = 0;
    let monthlyTotalRevenue = 0;

    for (const r of results) {
      // Atuais (período selecionado)
      totalValue += r.bigNumbers.totalValue;
      totalSalesRevenue += r.bigNumbers.totalSalesRevenue;
      totalSalesWithAb += r.bigNumbers.totalSalesWithAb;
      totalAllSales += r.bigNumbers.totalAllSales;
      totalRentals += r.bigNumbers.totalRentals;
      totalRevenue += r.bigNumbers.totalRevenue;

      // Anteriores
      if (r.bigNumbersPrevious) {
        totalValuePrev += r.bigNumbersPrevious.totalValue;
        totalSalesRevenuePrev += r.bigNumbersPrevious.totalSalesRevenue;
        totalSalesWithAbPrev += r.bigNumbersPrevious.totalSalesWithAb;
        totalAllSalesPrev += r.bigNumbersPrevious.totalAllSales;
        totalRentalsPrev += r.bigNumbersPrevious.totalRentals;
        totalRevenuePrev += r.bigNumbersPrevious.totalRevenue;
      }

      // Mês atual (para forecast)
      if (r.bigNumbersMonthly) {
        monthlyTotalValue += r.bigNumbersMonthly.totalValue;
        monthlyTotalSalesRevenue += r.bigNumbersMonthly.totalSalesRevenue;
        monthlyTotalSalesWithAb += r.bigNumbersMonthly.totalSalesWithAb;
        monthlyTotalAllSales += r.bigNumbersMonthly.totalAllSales;
        monthlyTotalRentals += r.bigNumbersMonthly.totalRentals;
        monthlyTotalRevenue += r.bigNumbersMonthly.totalRevenue;
      }
    }

    // --- Cálculos período atual ---
    // Ticket médio usa locações com A&B (totalSalesWithAb), igual ao individual
    const avgTicket = totalSalesWithAb > 0 ? totalValue / totalSalesWithAb : 0;
    const avgTicketByRentals = totalRentals > 0 ? totalValue / totalRentals : 0;
    const abRepresentativity =
      totalRevenue > 0 ? (totalValue / totalRevenue) * 100 : 0;
    const salesRepresentativity =
      totalRevenue > 0 ? (totalSalesRevenue / totalRevenue) * 100 : 0;

    // --- Cálculos período anterior ---
    const avgTicketPrev =
      totalSalesWithAbPrev > 0 ? totalValuePrev / totalSalesWithAbPrev : 0;
    const avgTicketByRentalsPrev =
      totalRentalsPrev > 0 ? totalValuePrev / totalRentalsPrev : 0;
    const abRepresentativityPrev =
      totalRevenuePrev > 0 ? (totalValuePrev / totalRevenuePrev) * 100 : 0;
    const salesRepresentativityPrev =
      totalRevenuePrev > 0
        ? (totalSalesRevenuePrev / totalRevenuePrev) * 100
        : 0;

    // --- Cálculos forecast mensal ---
    // Fórmula: forecastValue = monthlyTotalValue + (dailyAverageValue * remainingDays)
    let forecastValue = 0;
    let forecastSalesRevenue = 0;
    let forecastSales = 0;
    let forecastRentals = 0;
    let forecastRevenue = 0;

    if (daysElapsed > 0) {
      // Média diária baseada nos dados do mês atual
      const dailyAvgValue = monthlyTotalValue / daysElapsed;
      const dailyAvgSalesRevenue = monthlyTotalSalesRevenue / daysElapsed;
      const dailyAvgSales = monthlyTotalAllSales / daysElapsed;
      const dailyAvgRentals = monthlyTotalRentals / daysElapsed;
      const dailyAvgRevenue = monthlyTotalRevenue / daysElapsed;

      // Projeção: valor atual do mês + (média diária * dias restantes)
      forecastValue = monthlyTotalValue + dailyAvgValue * remainingDays;
      forecastSalesRevenue =
        monthlyTotalSalesRevenue + dailyAvgSalesRevenue * remainingDays;
      forecastSales = Math.round(
        monthlyTotalAllSales + dailyAvgSales * remainingDays,
      );
      forecastRentals = Math.round(
        monthlyTotalRentals + dailyAvgRentals * remainingDays,
      );
      forecastRevenue = monthlyTotalRevenue + dailyAvgRevenue * remainingDays;
    }

    const forecastTicket =
      forecastSales > 0 ? forecastValue / forecastSales : 0;
    const forecastTicketByRentals =
      forecastRentals > 0 ? forecastValue / forecastRentals : 0;
    const forecastAbRepresentativity =
      forecastRevenue > 0 ? (forecastValue / forecastRevenue) * 100 : 0;
    const forecastSalesRepresentativity =
      forecastRevenue > 0 ? (forecastSalesRevenue / forecastRevenue) * 100 : 0;

    return {
      currentDate: {
        totalAllValue: Number(totalValue.toFixed(2)),
        totalAllSalesRevenue: Number(totalSalesRevenue.toFixed(2)),
        totalAllSales: totalAllSales,
        totalAllTicketAverage: Number(avgTicket.toFixed(2)),
        totalAllTicketAverageByTotalRentals: Number(
          avgTicketByRentals.toFixed(2),
        ),
        abRepresentativity: Number(abRepresentativity.toFixed(2)),
        salesRepresentativity: Number(salesRepresentativity.toFixed(2)),
      },
      previousDate: {
        totalAllValuePreviousData: Number(totalValuePrev.toFixed(2)),
        totalAllSalesRevenuePreviousData: Number(
          totalSalesRevenuePrev.toFixed(2),
        ),
        totalAllSalesPreviousData: totalAllSalesPrev,
        totalAllTicketAveragePreviousData: Number(avgTicketPrev.toFixed(2)),
        totalAllTicketAverageByTotalRentalsPreviousData: Number(
          avgTicketByRentalsPrev.toFixed(2),
        ),
        abRepresentativityPreviousData: Number(
          abRepresentativityPrev.toFixed(2),
        ),
        salesRepresentativityPreviousData: Number(
          salesRepresentativityPrev.toFixed(2),
        ),
      },
      monthlyForecast: {
        totalAllValueForecast: Number(forecastValue.toFixed(2)),
        totalAllSalesRevenueForecast: Number(forecastSalesRevenue.toFixed(2)),
        totalAllSalesForecast: forecastSales,
        totalAllTicketAverageForecast: Number(forecastTicket.toFixed(2)),
        totalAllTicketAverageByTotalRentalsForecast: Number(
          forecastTicketByRentals.toFixed(2),
        ),
        abRepresentativityForecast: Number(
          forecastAbRepresentativity.toFixed(2),
        ),
        salesRepresentativityForecast: Number(
          forecastSalesRepresentativity.toFixed(2),
        ),
      },
    };
  }

  /**
   * Calcula RevenueByCompany - receita A&B total consolidada de cada unidade
   * Retorna: categories = nomes das unidades, series = valores totais
   */
  private calculateRevenueByCompanyConsolidated(
    results: UnitRestaurantKpiData[],
  ): ApexChartsData {
    const categories: string[] = [];
    const series: number[] = [];

    for (const r of results) {
      categories.push(r.unitName);
      series.push(Number(r.bigNumbers.totalValue.toFixed(2)));
    }

    return { categories, series };
  }

  /**
   * Calcula SalesByCompany - quantidade de vendas total consolidada de cada unidade
   * Retorna: categories = nomes das unidades, series = valores totais
   */
  private calculateSalesByCompanyConsolidated(
    results: UnitRestaurantKpiData[],
  ): ApexChartsData {
    const categories: string[] = [];
    const series: number[] = [];

    for (const r of results) {
      categories.push(r.unitName);
      series.push(r.bigNumbers.totalAllSales);
    }

    return { categories, series };
  }

  /**
   * Calcula RevenueAbByPeriod com agrupamento por mês
   */
  private calculateRevenueAbByPeriodGrouped(
    results: UnitRestaurantKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const periodDataMap = this.aggregateDataByPeriod(
        r.revenueAbByDate,
        groupByMonth,
      );
      const data = categories.map((period) =>
        Number((periodDataMap.get(period) || 0).toFixed(2)),
      );
      series.push({ name: r.unitName, data });
    }

    return { categories, series };
  }

  /**
   * Calcula RevenueAbByPeriodPercent com agrupamento por mês
   */
  private calculateRevenueAbByPeriodPercentGrouped(
    results: UnitRestaurantKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const revenueAbMap = this.aggregateDataByPeriod(
        r.revenueAbByDate,
        groupByMonth,
      );
      const totalRevenueMap = this.aggregateDataByPeriod(
        r.totalRevenueByDate,
        groupByMonth,
      );

      const data = categories.map((period) => {
        const revenueAb = revenueAbMap.get(period) || 0;
        const totalRevenue = totalRevenueMap.get(period) || 0;
        const percent = totalRevenue > 0 ? (revenueAb / totalRevenue) * 100 : 0;
        return Number(percent.toFixed(2));
      });
      series.push({ name: r.unitName, data });
    }

    return { categories, series };
  }

  /**
   * Calcula TicketAverageByPeriod com agrupamento por mês
   */
  private calculateTicketAverageByPeriodGrouped(
    results: UnitRestaurantKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const revenueAbMap = this.aggregateDataByPeriod(
        r.revenueAbByDate,
        groupByMonth,
      );
      const rentalsMap = this.aggregateDataByPeriod(
        r.rentalsWithAbByDate,
        groupByMonth,
      );

      const data = categories.map((period) => {
        const revenueAb = revenueAbMap.get(period) || 0;
        const rentalsWithAb = rentalsMap.get(period) || 0;
        const ticketAvg = rentalsWithAb > 0 ? revenueAb / rentalsWithAb : 0;
        return Number(ticketAvg.toFixed(2));
      });
      series.push({ name: r.unitName, data });
    }

    return { categories, series };
  }

  /**
   * Agrega dados por período (dia ou mês)
   */
  private aggregateDataByPeriod(
    dataMap: Map<string, number>,
    groupByMonth: boolean,
  ): Map<string, number> {
    const aggregated = new Map<string, number>();

    for (const [dateKey, value] of dataMap.entries()) {
      const periodKey = groupByMonth
        ? this.dateUtilsService.formatDateToMonth(dateKey)
        : this.dateUtilsService.formatDateDisplay(dateKey);

      const current = aggregated.get(periodKey) || 0;
      aggregated.set(periodKey, current + value);
    }

    return aggregated;
  }

  /**
   * Gera array de períodos (datas ou meses) entre startDate e endDate
   * @param groupByMonth Se true, agrupa por mês (MM/YYYY), senão por dia (DD/MM/YYYY)
   */
  private generatePeriodRange(
    startDate: string,
    endDate: string,
    groupByMonth: boolean,
  ): string[] {
    const periods: string[] = [];
    const start = this.dateUtilsService.parseDate(startDate);
    const end = this.dateUtilsService.parseDate(endDate);

    if (groupByMonth) {
      // Agrupar por mês: gera array de meses no formato MM/YYYY
      const current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const month = (current.getMonth() + 1).toString().padStart(2, '0');
        const year = current.getFullYear();
        periods.push(`${month}/${year}`);
        current.setMonth(current.getMonth() + 1);
      }
    } else {
      // Agrupar por dia: gera array de datas no formato DD/MM/YYYY
      const current = new Date(start);
      while (current <= end) {
        periods.push(this.dateUtilsService.formatDateBR(current));
        current.setDate(current.getDate() + 1);
      }
    }

    return periods;
  }

  /**
   * Gera array de datas entre startDate e endDate
   */
  private generateDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const start = this.dateUtilsService.parseDate(startDate);
    const end = this.dateUtilsService.parseDate(endDate);

    const current = new Date(start);
    while (current <= end) {
      dates.push(this.dateUtilsService.formatDateKey(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }
}

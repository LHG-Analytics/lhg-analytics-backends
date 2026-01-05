/**
 * Service para KPIs unificados de Restaurant - Versão Multi-Tenant
 * Conecta diretamente aos bancos de dados das unidades via SQL
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { CachePeriodEnum } from '../cache/cache.interfaces';
import { UnitKey, UNIT_CONFIGS } from '../database/database.interfaces';
import {
  UnifiedRestaurantKpiResponse,
  RestaurantBigNumbersData,
  ApexChartsMultiSeriesData,
  UnitRestaurantBigNumbers,
  UnitRestaurantKpiData,
} from './restaurant.interfaces';
import {
  getRestaurantBigNumbersSQL,
  getRevenueAbByDateSQL,
  getTotalRevenueByDateSQL,
  getSalesWithAbByDateSQL,
} from './sql/restaurant.queries';

@Injectable()
export class RestaurantMultitenantService {
  private readonly logger = new Logger(RestaurantMultitenantService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly kpiCacheService: KpiCacheService,
  ) {}

  /**
   * Busca KPIs de todas as unidades e consolida
   */
  async getUnifiedKpis(
    startDate: string,
    endDate: string,
  ): Promise<UnifiedRestaurantKpiResponse> {
    const customDates = {
      start: this.parseDate(startDate),
      end: this.parseDate(endDate),
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
      throw new Error('Nenhuma unidade conectada. Verifique as variáveis de ambiente.');
    }

    this.logger.log(`Buscando KPIs de Restaurant de ${connectedUnits.length} unidades...`);

    // Calcula período anterior (mesma duração, imediatamente antes)
    const { previousStart, previousEnd } = this.calculatePreviousPeriod(startDate, endDate);

    // Calcula período do mês atual para forecast (dia 1 às 06:00 até ontem às 05:59:59)
    const { monthStart, monthEnd, daysElapsed, remainingDays, totalDaysInMonth } = this.calculateCurrentMonthPeriod();

    // Executa queries em paralelo para cada unidade (período atual + anterior + mês atual para forecast)
    const unitDataPromises = connectedUnits.map((unit) =>
      this.fetchUnitKpis(unit, startDate, endDate, previousStart, previousEnd, monthStart, monthEnd),
    );

    const unitResults = await Promise.all(unitDataPromises);
    const validResults = unitResults.filter((r) => r !== null) as UnitRestaurantKpiData[];

    if (validResults.length === 0) {
      throw new Error('Nenhuma unidade retornou dados válidos');
    }

    // Consolida os dados
    const consolidated = this.consolidateData(validResults, startDate, endDate, daysElapsed, remainingDays, totalDaysInMonth);

    this.logger.log(
      `KPIs de Restaurant consolidados de ${validResults.length} unidades em ${Date.now() - startTime}ms`,
    );

    return consolidated;
  }

  /**
   * Calcula o período do mês atual para forecast
   * Retorna: dia 1 às 06:00:00 até ontem às 05:59:59 (D+1)
   */
  private calculateCurrentMonthPeriod(): {
    monthStart: string;
    monthEnd: string;
    daysElapsed: number;
    remainingDays: number;
    totalDaysInMonth: number;
  } {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const totalDaysInMonth = currentMonthEnd.getDate();

    // Ontem (para calcular dias decorridos)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const daysElapsed = yesterday.getDate();
    const remainingDays = totalDaysInMonth - daysElapsed;

    // Formata para DD/MM/YYYY
    const monthStart = this.formatDateBR(currentMonthStart);
    // O fim é ontem + 1 dia às 05:59:59, mas para a query usamos o dia seguinte a ontem
    const dayAfterYesterday = new Date(yesterday);
    dayAfterYesterday.setDate(dayAfterYesterday.getDate() + 1);
    const monthEnd = this.formatDateBR(dayAfterYesterday);

    return {
      monthStart,
      monthEnd,
      daysElapsed,
      remainingDays,
      totalDaysInMonth,
    };
  }

  /**
   * Calcula o período anterior (mesma duração, imediatamente antes)
   */
  private calculatePreviousPeriod(startDate: string, endDate: string): { previousStart: string; previousEnd: string } {
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);

    // Duração em dias
    const durationMs = end.getTime() - start.getTime();
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

    // Período anterior termina um dia antes do início atual
    const previousEnd = new Date(start);
    previousEnd.setDate(previousEnd.getDate() - 1);

    // Período anterior começa (duração) dias antes do fim anterior
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - durationDays);

    return {
      previousStart: this.formatDateBR(previousStart),
      previousEnd: this.formatDateBR(previousEnd),
    };
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
      const [
        bigNumbersResult,
        bigNumbersPrevResult,
        bigNumbersMonthlyResult,
        revenueAbResult,
        totalRevenueResult,
        salesWithAbResult,
      ] = await Promise.all([
        this.databaseService.query(unit, getRestaurantBigNumbersSQL(unit, startDate, endDate)),
        this.databaseService.query(unit, getRestaurantBigNumbersSQL(unit, previousStart, previousEnd)),
        this.databaseService.query(unit, getRestaurantBigNumbersSQL(unit, monthStart, monthEnd)),
        this.databaseService.query(unit, getRevenueAbByDateSQL(unit, startDate, endDate)),
        this.databaseService.query(unit, getTotalRevenueByDateSQL(unit, startDate, endDate)),
        this.databaseService.query(unit, getSalesWithAbByDateSQL(unit, startDate, endDate)),
      ]);

      // Processa BigNumbers atual
      const bn = bigNumbersResult.rows[0] || {};
      const bigNumbers: UnitRestaurantBigNumbers = {
        totalValue: parseFloat(bn.total_ab_value) || 0,
        totalSales: parseInt(bn.total_sales_with_ab) || 0,
        totalRentals: parseInt(bn.total_rentals) || 0,
      };

      // Processa BigNumbers anterior
      const bnPrev = bigNumbersPrevResult.rows[0] || {};
      const bigNumbersPrevious: UnitRestaurantBigNumbers = {
        totalValue: parseFloat(bnPrev.total_ab_value) || 0,
        totalSales: parseInt(bnPrev.total_sales_with_ab) || 0,
        totalRentals: parseInt(bnPrev.total_rentals) || 0,
      };

      // Processa BigNumbers do mês atual (para forecast)
      const bnMonthly = bigNumbersMonthlyResult.rows[0] || {};
      const bigNumbersMonthly: UnitRestaurantBigNumbers = {
        totalValue: parseFloat(bnMonthly.total_ab_value) || 0,
        totalSales: parseInt(bnMonthly.total_sales_with_ab) || 0,
        totalRentals: parseInt(bnMonthly.total_rentals) || 0,
      };

      // Processa séries por data
      const revenueAbByDate = new Map<string, number>();
      for (const row of revenueAbResult.rows) {
        revenueAbByDate.set(this.formatDateKey(row.date), parseFloat(row.total_ab_value) || 0);
      }

      const totalRevenueByDate = new Map<string, number>();
      for (const row of totalRevenueResult.rows) {
        totalRevenueByDate.set(this.formatDateKey(row.date), parseFloat(row.total_revenue) || 0);
      }

      const salesByDate = new Map<string, number>();
      for (const row of salesWithAbResult.rows) {
        salesByDate.set(this.formatDateKey(row.date), parseInt(row.rentals_with_ab) || 0);
      }

      // Contagem de locações com A&B por data (para ticket médio)
      const rentalsWithAbByDate = new Map<string, number>();
      for (const row of salesWithAbResult.rows) {
        rentalsWithAbByDate.set(this.formatDateKey(row.date), parseInt(row.rentals_with_ab) || 0);
      }

      this.logger.log(`KPIs de Restaurant de ${UNIT_CONFIGS[unit].name} obtidos com sucesso`);

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
      this.logger.error(`Erro ao buscar KPIs de Restaurant de ${UNIT_CONFIGS[unit].name}: ${error.message}`);
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
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);
    const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const groupByMonth = rangeDays > 40;

    // Gera todas as datas/meses do período e prepara as categorias
    const allPeriods = this.generatePeriodRange(startDate, endDate, groupByMonth);
    const categories = allPeriods;

    // Consolida BigNumbers (com previousDate e monthlyForecast)
    const bigNumbers = this.consolidateBigNumbers(results, daysElapsed, remainingDays, totalDaysInMonth);

    // RevenueByCompany - receita A&B de cada unidade por data/mês
    const revenueByCompany = this.calculateRevenueByCompanyGrouped(results, categories, groupByMonth);

    // SalesByCompany - quantidade de vendas com A&B de cada unidade por data/mês
    const salesByCompany = this.calculateSalesByCompanyGrouped(results, categories, groupByMonth);

    // RevenueAbByPeriod - receita A&B por unidade por data/mês
    const revenueAbByPeriod = this.calculateRevenueAbByPeriodGrouped(results, categories, groupByMonth);

    // RevenueAbByPeriodPercent - percentual A&B por unidade por data/mês
    const revenueAbByPeriodPercent = this.calculateRevenueAbByPeriodPercentGrouped(results, categories, groupByMonth);

    // TicketAverageByPeriod - ticket médio por unidade por data/mês
    const ticketAverageByPeriod = this.calculateTicketAverageByPeriodGrouped(results, categories, groupByMonth);

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
    let totalSales = 0;
    let totalRentals = 0;

    // --- Dados anteriores ---
    let totalValuePrev = 0;
    let totalSalesPrev = 0;
    let totalRentalsPrev = 0;

    // --- Dados do mês atual (para forecast) ---
    let monthlyTotalValue = 0;
    let monthlyTotalSales = 0;
    let monthlyTotalRentals = 0;

    for (const r of results) {
      // Atuais (período selecionado)
      totalValue += r.bigNumbers.totalValue;
      totalSales += r.bigNumbers.totalSales;
      totalRentals += r.bigNumbers.totalRentals;

      // Anteriores
      if (r.bigNumbersPrevious) {
        totalValuePrev += r.bigNumbersPrevious.totalValue;
        totalSalesPrev += r.bigNumbersPrevious.totalSales;
        totalRentalsPrev += r.bigNumbersPrevious.totalRentals;
      }

      // Mês atual (para forecast)
      if (r.bigNumbersMonthly) {
        monthlyTotalValue += r.bigNumbersMonthly.totalValue;
        monthlyTotalSales += r.bigNumbersMonthly.totalSales;
        monthlyTotalRentals += r.bigNumbersMonthly.totalRentals;
      }
    }

    // --- Cálculos período atual ---
    const avgTicket = totalSales > 0 ? totalValue / totalSales : 0;
    const avgTicketByRentals = totalRentals > 0 ? totalValue / totalRentals : 0;

    // --- Cálculos período anterior ---
    const avgTicketPrev = totalSalesPrev > 0 ? totalValuePrev / totalSalesPrev : 0;
    const avgTicketByRentalsPrev = totalRentalsPrev > 0 ? totalValuePrev / totalRentalsPrev : 0;

    // --- Cálculos forecast mensal ---
    // Fórmula: forecastValue = monthlyTotalValue + (dailyAverageValue * remainingDays)
    let forecastValue = 0;
    let forecastSales = 0;
    let forecastRentals = 0;

    if (daysElapsed > 0) {
      // Média diária baseada nos dados do mês atual
      const dailyAvgValue = monthlyTotalValue / daysElapsed;
      const dailyAvgSales = monthlyTotalSales / daysElapsed;
      const dailyAvgRentals = monthlyTotalRentals / daysElapsed;

      // Projeção: valor atual do mês + (média diária * dias restantes)
      forecastValue = monthlyTotalValue + dailyAvgValue * remainingDays;
      forecastSales = Math.round(monthlyTotalSales + dailyAvgSales * remainingDays);
      forecastRentals = Math.round(monthlyTotalRentals + dailyAvgRentals * remainingDays);
    }

    const forecastTicket = forecastSales > 0 ? forecastValue / forecastSales : 0;
    const forecastTicketByRentals = forecastRentals > 0 ? forecastValue / forecastRentals : 0;

    return {
      currentDate: {
        totalAllValue: Number(totalValue.toFixed(2)),
        totalAllSales: totalSales,
        totalAllTicketAverage: Number(avgTicket.toFixed(2)),
        totalAllTicketAverageByTotalRentals: Number(avgTicketByRentals.toFixed(2)),
      },
      previousDate: {
        totalAllValuePreviousData: Number(totalValuePrev.toFixed(2)),
        totalAllSalesPreviousData: totalSalesPrev,
        totalAllTicketAveragePreviousData: Number(avgTicketPrev.toFixed(2)),
        totalAllTicketAverageByTotalRentalsPreviousData: Number(avgTicketByRentalsPrev.toFixed(2)),
      },
      monthlyForecast: {
        totalAllValueForecast: Number(forecastValue.toFixed(2)),
        totalAllSalesForecast: forecastSales,
        totalAllTicketAverageForecast: Number(forecastTicket.toFixed(2)),
        totalAllTicketAverageByTotalRentalsForecast: Number(forecastTicketByRentals.toFixed(2)),
      },
    };
  }

  /**
   * Calcula RevenueByCompany com agrupamento por mês
   */
  private calculateRevenueByCompanyGrouped(
    results: UnitRestaurantKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const periodDataMap = this.aggregateDataByPeriod(r.revenueAbByDate, groupByMonth);
      const data = categories.map((period) => Number((periodDataMap.get(period) || 0).toFixed(2)));
      series.push({ name: r.unitName, data });
    }

    return { categories, series };
  }

  /**
   * Calcula SalesByCompany com agrupamento por mês
   */
  private calculateSalesByCompanyGrouped(
    results: UnitRestaurantKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const periodDataMap = this.aggregateDataByPeriod(r.salesByDate, groupByMonth);
      const data = categories.map((period) => periodDataMap.get(period) || 0);
      series.push({ name: r.unitName, data });
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
      const periodDataMap = this.aggregateDataByPeriod(r.revenueAbByDate, groupByMonth);
      const data = categories.map((period) => Number((periodDataMap.get(period) || 0).toFixed(2)));
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
      const revenueAbMap = this.aggregateDataByPeriod(r.revenueAbByDate, groupByMonth);
      const totalRevenueMap = this.aggregateDataByPeriod(r.totalRevenueByDate, groupByMonth);

      const data = categories.map((period) => {
        const revenueAb = revenueAbMap.get(period) || 0;
        const totalRevenue = totalRevenueMap.get(period) || 0;
        const percent = totalRevenue > 0 ? revenueAb / totalRevenue : 0;
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
      const revenueAbMap = this.aggregateDataByPeriod(r.revenueAbByDate, groupByMonth);
      const rentalsMap = this.aggregateDataByPeriod(r.rentalsWithAbByDate, groupByMonth);

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
        ? this.formatDateToMonth(dateKey)
        : this.formatDateDisplay(dateKey);

      const current = aggregated.get(periodKey) || 0;
      aggregated.set(periodKey, current + value);
    }

    return aggregated;
  }

  /**
   * Gera array de períodos (datas ou meses) entre startDate e endDate
   * @param groupByMonth Se true, agrupa por mês (MM/YYYY), senão por dia (DD/MM/YYYY)
   */
  private generatePeriodRange(startDate: string, endDate: string, groupByMonth: boolean): string[] {
    const periods: string[] = [];
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);

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
        periods.push(this.formatDateBR(current));
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
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);

    const current = new Date(start);
    while (current <= end) {
      dates.push(this.formatDateKey(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Formata data para chave de mapa (YYYY-MM-DD)
   */
  private formatDateKey(date: Date | string): string {
    if (typeof date === 'string') {
      // Se já for string no formato correto
      if (date.includes('-')) {
        return date.split('T')[0];
      }
      // Se for DD/MM/YYYY
      const [day, month, year] = date.split('/');
      return `${year}-${month}-${day}`;
    }
    return date.toISOString().split('T')[0];
  }

  /**
   * Formata data para exibição (DD/MM/YYYY)
   */
  private formatDateDisplay(dateKey: string): string {
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}/${year}`;
  }

  /**
   * Formata data (YYYY-MM-DD) para mês (MM/YYYY)
   */
  private formatDateToMonth(dateKey: string): string {
    const [year, month] = dateKey.split('-');
    return `${month}/${year}`;
  }

  /**
   * Formata Date para string DD/MM/YYYY
   */
  private formatDateBR(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Converte string de data DD/MM/YYYY para Date
   */
  private parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
}

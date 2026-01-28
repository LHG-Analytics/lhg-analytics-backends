/**
 * Service para KPIs unificados de Bookings - Versão Multi-Tenant
 * Conecta diretamente aos bancos de dados das unidades via SQL
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { CachePeriodEnum } from '../cache/cache.interfaces';
import { UnitKey, UNIT_CONFIGS } from '../database/database.interfaces';
import { DateUtilsService } from '../utils/date-utils.service';
import { ConcurrencyUtilsService } from '@lhg/utils';
import {
  UnifiedBookingsKpiResponse,
  BookingsBigNumbersData,
  BookingsEcommerceBigNumbersData,
  ApexChartsData,
  ApexChartsMultiSeriesData,
  UnitBookingsBigNumbers,
  UnitBookingsEcommerce,
  UnitBookingsKpiData,
} from './bookings.interfaces';
import {
  getBookingsBigNumbersSQL,
  getBillingByDateSQL,
  getEcommerceBigNumbersSQL,
  getEcommerceByDateSQL,
} from './sql/bookings.queries';

@Injectable()
export class BookingsMultitenantService {
  private readonly logger = new Logger(BookingsMultitenantService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly kpiCacheService: KpiCacheService,
    private readonly dateUtilsService: DateUtilsService,
    private readonly concurrencyUtils: ConcurrencyUtilsService,
  ) {}

  /**
   * Busca KPIs de todas as unidades e consolida
   */
  async getUnifiedKpis(
    startDate: string,
    endDate: string,
  ): Promise<UnifiedBookingsKpiResponse> {
    const customDates = {
      start: this.dateUtilsService.parseDate(startDate),
      end: this.dateUtilsService.parseDate(endDate),
    };

    // Usa o cache service com TTL dinâmico
    const result = await this.kpiCacheService.getOrCalculate(
      'bookings',
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
  ): Promise<UnifiedBookingsKpiResponse> {
    const startTime = Date.now();
    const connectedUnits = this.databaseService.getConnectedUnits();

    if (connectedUnits.length === 0) {
      throw new Error('Nenhuma unidade conectada. Verifique as variáveis de ambiente.');
    }

    this.logger.log(`Buscando KPIs de Bookings de ${connectedUnits.length} unidades...`);

    // Calcula período anterior (mesma duração, imediatamente antes)
    const { previousStart, previousEnd } = this.dateUtilsService.calculatePreviousPeriod(startDate, endDate);

    // Calcula período do mês atual para forecast (dia 1 às 06:00 até ontem às 05:59:59)
    const { monthStart, monthEnd, daysElapsed, remainingDays, totalDaysInMonth } = this.dateUtilsService.calculateCurrentMonthPeriod();

    // Executa queries em paralelo para cada unidade (período atual + anterior + mês atual para forecast)
    // Limita a 2 unidades simultâneas para evitar sobrecarga do banco de dados
    const unitDataTasks = connectedUnits.map((unit) =>
      () => this.fetchUnitKpis(unit, startDate, endDate, previousStart, previousEnd, monthStart, monthEnd),
    );

    const unitResults = await this.concurrencyUtils.executeWithLimit(unitDataTasks, 2);
    const validResults = unitResults.filter((r) => r !== null) as UnitBookingsKpiData[];

    if (validResults.length === 0) {
      throw new Error('Nenhuma unidade retornou dados válidos');
    }

    // Consolida os dados
    const consolidated = this.consolidateData(validResults, startDate, endDate, daysElapsed, remainingDays, totalDaysInMonth);

    this.logger.log(
      `KPIs de Bookings consolidados de ${validResults.length} unidades em ${Date.now() - startTime}ms`,
    );

    return consolidated;
  }

  /**
   * Busca KPIs de Bookings de uma unidade específica (período atual + anterior + mês atual)
   */
  private async fetchUnitKpis(
    unit: UnitKey,
    startDate: string,
    endDate: string,
    previousStart: string,
    previousEnd: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<UnitBookingsKpiData | null> {
    try {
      // Executa todas as queries em paralelo para a unidade (atual + anterior + mês atual)
      // Limita a 5 queries simultâneas por unidade para evitar sobrecarga
      const queryTasks = [
        () => this.databaseService.query(unit, getBookingsBigNumbersSQL(unit, startDate, endDate)),
        () => this.databaseService.query(unit, getBookingsBigNumbersSQL(unit, previousStart, previousEnd)),
        () => this.databaseService.query(unit, getBookingsBigNumbersSQL(unit, monthStart, monthEnd)),
        () => this.databaseService.query(unit, getBillingByDateSQL(unit, startDate, endDate)),
        () => this.databaseService.query(unit, getEcommerceBigNumbersSQL(unit, startDate, endDate)),
        () => this.databaseService.query(unit, getEcommerceBigNumbersSQL(unit, previousStart, previousEnd)),
        () => this.databaseService.query(unit, getEcommerceBigNumbersSQL(unit, monthStart, monthEnd)),
        () => this.databaseService.query(unit, getEcommerceByDateSQL(unit, startDate, endDate)),
      ];

      const [
        bigNumbersResult,
        bigNumbersPrevResult,
        bigNumbersMonthlyResult,
        billingByDateResult,
        ecommerceBigNumbersResult,
        ecommerceBigNumbersPrevResult,
        ecommerceBigNumbersMonthlyResult,
        ecommerceByDateResult,
      ] = await this.concurrencyUtils.executeWithLimit(queryTasks, 5);

      // Processa BigNumbers atual
      const bn = bigNumbersResult.rows[0] || {};
      const bigNumbers: UnitBookingsBigNumbers = {
        totalValue: parseFloat(bn.total_booking_value) || 0,
        totalBookings: parseInt(bn.total_bookings) || 0,
        totalRevenue: parseFloat(bn.total_revenue) || 0,
      };

      // Processa BigNumbers anterior
      const bnPrev = bigNumbersPrevResult.rows[0] || {};
      const bigNumbersPrevious: UnitBookingsBigNumbers = {
        totalValue: parseFloat(bnPrev.total_booking_value) || 0,
        totalBookings: parseInt(bnPrev.total_bookings) || 0,
        totalRevenue: parseFloat(bnPrev.total_revenue) || 0,
      };

      // Processa BigNumbers do mês atual (para forecast)
      const bnMonthly = bigNumbersMonthlyResult.rows[0] || {};
      const bigNumbersMonthly: UnitBookingsBigNumbers = {
        totalValue: parseFloat(bnMonthly.total_booking_value) || 0,
        totalBookings: parseInt(bnMonthly.total_bookings) || 0,
        totalRevenue: parseFloat(bnMonthly.total_revenue) || 0,
      };

      // Processa Ecommerce atual
      const ecom = ecommerceBigNumbersResult.rows[0] || {};
      const ecommerce: UnitBookingsEcommerce = {
        totalValue: parseFloat(ecom.total_ecommerce_value) || 0,
        totalBookings: parseInt(ecom.total_ecommerce_bookings) || 0,
      };

      // Processa Ecommerce anterior
      const ecomPrev = ecommerceBigNumbersPrevResult.rows[0] || {};
      const ecommercePrevious: UnitBookingsEcommerce = {
        totalValue: parseFloat(ecomPrev.total_ecommerce_value) || 0,
        totalBookings: parseInt(ecomPrev.total_ecommerce_bookings) || 0,
      };

      // Processa Ecommerce do mês atual (para forecast)
      const ecomMonthly = ecommerceBigNumbersMonthlyResult.rows[0] || {};
      const ecommerceMonthly: UnitBookingsEcommerce = {
        totalValue: parseFloat(ecomMonthly.total_ecommerce_value) || 0,
        totalBookings: parseInt(ecomMonthly.total_ecommerce_bookings) || 0,
      };

      // Processa séries por data
      const billingByDate = new Map<string, number>();
      const bookingsByDate = new Map<string, number>();
      for (const row of billingByDateResult.rows) {
        const dateKey = this.dateUtilsService.formatDateKey(row.date);
        billingByDate.set(dateKey, parseFloat(row.total_value) || 0);
        bookingsByDate.set(dateKey, parseInt(row.total_bookings) || 0);
      }

      const ecommerceBillingByDate = new Map<string, number>();
      const ecommerceBookingsByDate = new Map<string, number>();
      for (const row of ecommerceByDateResult.rows) {
        const dateKey = this.dateUtilsService.formatDateKey(row.date);
        ecommerceBillingByDate.set(dateKey, parseFloat(row.total_value) || 0);
        ecommerceBookingsByDate.set(dateKey, parseInt(row.total_bookings) || 0);
      }

      this.logger.log(`KPIs de Bookings de ${UNIT_CONFIGS[unit].name} obtidos com sucesso`);

      return {
        unit,
        unitName: UNIT_CONFIGS[unit].name,
        bigNumbers,
        bigNumbersPrevious,
        bigNumbersMonthly,
        ecommerce,
        ecommercePrevious,
        ecommerceMonthly,
        billingByDate,
        bookingsByDate,
        ecommerceBillingByDate,
        ecommerceBookingsByDate,
      };
    } catch (error) {
      this.logger.error(`Erro ao buscar KPIs de Bookings de ${UNIT_CONFIGS[unit].name}: ${error.message}`);
      return null;
    }
  }

  /**
   * Consolida os dados de todas as unidades
   */
  private consolidateData(
    results: UnitBookingsKpiData[],
    startDate: string,
    endDate: string,
    daysElapsed: number,
    remainingDays: number,
    totalDaysInMonth: number,
  ): UnifiedBookingsKpiResponse {
    // Calcula a diferença de dias para determinar se agrupa por mês ou por dia
    const start = this.dateUtilsService.parseDate(startDate);
    const end = this.dateUtilsService.parseDate(endDate);
    const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const groupByMonth = rangeDays > 40;

    // Gera todas as datas/meses do período e prepara as categorias
    const allPeriods = this.dateUtilsService.generatePeriodRange(startDate, endDate, groupByMonth);
    const categories = allPeriods;

    // Consolida BigNumbers (com previousDate e monthlyForecast)
    const bigNumbers = this.consolidateBigNumbers(results, daysElapsed, remainingDays, totalDaysInMonth);

    // Consolida BigNumbersEcommerce (com previousDate e monthlyForecast)
    const bigNumbersEcommerce = this.consolidateEcommerceBigNumbers(results, daysElapsed, remainingDays);

    // RevenueByCompany - faturamento total de reservas de cada unidade (consolidado)
    const revenueByCompany = this.calculateRevenueByCompanyConsolidated(results);

    // BookingsByCompany - quantidade total de reservas de cada unidade (consolidado)
    const bookingsByCompany = this.calculateBookingsByCompanyConsolidated(results);

    // BillingOfReservationsByPeriod - faturamento por unidade por data/mês
    const billingOfReservationsByPeriod = this.calculateBillingByPeriodGrouped(results, categories, groupByMonth);

    // RepresentativenessOfReservesByPeriod - representatividade por unidade por data/mês
    const representativenessOfReservesByPeriod = this.calculateRepresentativenessByPeriodGrouped(results, categories, groupByMonth);

    // NumberOfReservationsPerPeriod - número de reservas por unidade por data/mês
    const numberOfReservationsPerPeriod = this.calculateNumberOfReservationsByPeriodGrouped(results, categories, groupByMonth);

    // ReservationsOfEcommerceByPeriod - reservas ecommerce por unidade por data/mês
    const reservationsOfEcommerceByPeriod = this.calculateEcommerceReservationsByPeriodGrouped(results, categories, groupByMonth);

    // BillingOfEcommerceByPeriod - faturamento ecommerce por unidade por data/mês
    const billingOfEcommerceByPeriod = this.calculateEcommerceBillingByPeriodGrouped(results, categories, groupByMonth);

    return {
      Company: 'LHG',
      BigNumbers: [bigNumbers],
      RevenueByCompany: revenueByCompany,
      BookingsByCompany: bookingsByCompany,
      BillingOfReservationsByPeriod: billingOfReservationsByPeriod,
      RepresentativenessOfReservesByPeriod: representativenessOfReservesByPeriod,
      NumberOfReservationsPerPeriod: numberOfReservationsPerPeriod,
      BigNumbersEcommerce: [bigNumbersEcommerce],
      ReservationsOfEcommerceByPeriod: reservationsOfEcommerceByPeriod,
      BillingOfEcommerceByPeriod: billingOfEcommerceByPeriod,
    };
  }

  /**
   * Consolida BigNumbers de todas as unidades (com previousDate e monthlyForecast)
   * monthlyForecast: busca dados do mês atual (dia 1 até ontem) e projeta para o mês inteiro
   */
  private consolidateBigNumbers(
    results: UnitBookingsKpiData[],
    daysElapsed: number,
    remainingDays: number,
    totalDaysInMonth: number,
  ): BookingsBigNumbersData {
    // --- Dados atuais (período selecionado) ---
    let totalValue = 0;
    let totalBookings = 0;
    let totalRevenue = 0;

    // --- Dados anteriores ---
    let totalValuePrev = 0;
    let totalBookingsPrev = 0;
    let totalRevenuePrev = 0;

    // --- Dados do mês atual (para forecast) ---
    let monthlyTotalValue = 0;
    let monthlyTotalBookings = 0;

    for (const r of results) {
      // Atuais (período selecionado)
      totalValue += r.bigNumbers.totalValue;
      totalBookings += r.bigNumbers.totalBookings;
      totalRevenue += r.bigNumbers.totalRevenue;

      // Anteriores
      if (r.bigNumbersPrevious) {
        totalValuePrev += r.bigNumbersPrevious.totalValue;
        totalBookingsPrev += r.bigNumbersPrevious.totalBookings;
        totalRevenuePrev += r.bigNumbersPrevious.totalRevenue;
      }

      // Mês atual (para forecast)
      if (r.bigNumbersMonthly) {
        monthlyTotalValue += r.bigNumbersMonthly.totalValue;
        monthlyTotalBookings += r.bigNumbersMonthly.totalBookings;
      }
    }

    // --- Cálculos período atual ---
    const avgTicket = totalBookings > 0 ? totalValue / totalBookings : 0;
    // Representatividade multiplicada por 100 para mostrar como percentual (frontend só adiciona "%")
    const representativeness = totalRevenue > 0 ? (totalValue / totalRevenue) * 100 : 0;

    // --- Cálculos período anterior ---
    const avgTicketPrev = totalBookingsPrev > 0 ? totalValuePrev / totalBookingsPrev : 0;
    const representativenessPrev = totalRevenuePrev > 0 ? (totalValuePrev / totalRevenuePrev) * 100 : 0;

    // --- Cálculos forecast mensal ---
    // Fórmula: forecastValue = monthlyTotalValue + (dailyAverageValue * remainingDays)
    let forecastValue = 0;
    let forecastBookings = 0;

    if (daysElapsed > 0) {
      // Média diária baseada nos dados do mês atual
      const dailyAvgValue = monthlyTotalValue / daysElapsed;
      const dailyAvgBookings = monthlyTotalBookings / daysElapsed;

      // Projeção: valor atual do mês + (média diária * dias restantes)
      forecastValue = monthlyTotalValue + dailyAvgValue * remainingDays;
      forecastBookings = Math.round(monthlyTotalBookings + dailyAvgBookings * remainingDays);
    }

    const forecastTicket = forecastBookings > 0 ? forecastValue / forecastBookings : 0;
    // Representatividade no forecast mantém o valor atual (não temos forecast de receita total)
    const forecastRepresentativeness = representativeness;

    return {
      currentDate: {
        totalAllValue: Number(totalValue.toFixed(2)),
        totalAllBookings: totalBookings,
        totalAllTicketAverage: Number(avgTicket.toFixed(2)),
        totalAllRepresentativeness: Number(representativeness.toFixed(2)),
      },
      previousDate: {
        totalAllValuePreviousData: Number(totalValuePrev.toFixed(2)),
        totalAllBookingsPreviousData: totalBookingsPrev,
        totalAllTicketAveragePreviousData: Number(avgTicketPrev.toFixed(2)),
        totalAllRepresentativenessPreviousData: Number(representativenessPrev.toFixed(2)),
      },
      monthlyForecast: {
        totalAllValueForecast: Number(forecastValue.toFixed(2)),
        totalAllBookingsForecast: forecastBookings,
        totalAllTicketAverageForecast: Number(forecastTicket.toFixed(2)),
        totalAllRepresentativenessForecast: Number(forecastRepresentativeness.toFixed(2)),
      },
    };
  }

  /**
   * Consolida BigNumbersEcommerce de todas as unidades (com previousDate e monthlyForecast)
   */
  private consolidateEcommerceBigNumbers(
    results: UnitBookingsKpiData[],
    daysElapsed: number,
    remainingDays: number,
  ): BookingsEcommerceBigNumbersData {
    // --- Dados atuais ---
    let totalValue = 0;
    let totalBookings = 0;
    let totalRevenue = 0;

    // --- Dados anteriores ---
    let totalValuePrev = 0;
    let totalBookingsPrev = 0;
    let totalRevenuePrev = 0;

    // --- Dados do mês atual (para forecast) ---
    let monthlyTotalValue = 0;
    let monthlyTotalBookings = 0;

    for (const r of results) {
      // Atuais
      totalValue += r.ecommerce.totalValue;
      totalBookings += r.ecommerce.totalBookings;
      totalRevenue += r.bigNumbers.totalRevenue;

      // Anteriores
      if (r.ecommercePrevious) {
        totalValuePrev += r.ecommercePrevious.totalValue;
        totalBookingsPrev += r.ecommercePrevious.totalBookings;
      }
      if (r.bigNumbersPrevious) {
        totalRevenuePrev += r.bigNumbersPrevious.totalRevenue;
      }

      // Mês atual (para forecast)
      if (r.ecommerceMonthly) {
        monthlyTotalValue += r.ecommerceMonthly.totalValue;
        monthlyTotalBookings += r.ecommerceMonthly.totalBookings;
      }
    }

    // --- Cálculos período atual ---
    const avgTicket = totalBookings > 0 ? totalValue / totalBookings : 0;
    // Representatividade multiplicada por 100 para mostrar como percentual (frontend só adiciona "%")
    const representativeness = totalRevenue > 0 ? (totalValue / totalRevenue) * 100 : 0;

    // --- Cálculos período anterior ---
    const avgTicketPrev = totalBookingsPrev > 0 ? totalValuePrev / totalBookingsPrev : 0;
    const representativenessPrev = totalRevenuePrev > 0 ? (totalValuePrev / totalRevenuePrev) * 100 : 0;

    // --- Cálculos forecast mensal ---
    let forecastValue = 0;
    let forecastBookings = 0;

    if (daysElapsed > 0) {
      const dailyAvgValue = monthlyTotalValue / daysElapsed;
      const dailyAvgBookings = monthlyTotalBookings / daysElapsed;

      forecastValue = monthlyTotalValue + dailyAvgValue * remainingDays;
      forecastBookings = Math.round(monthlyTotalBookings + dailyAvgBookings * remainingDays);
    }

    const forecastTicket = forecastBookings > 0 ? forecastValue / forecastBookings : 0;
    const forecastRepresentativeness = representativeness; // Mantém o valor atual

    return {
      currentDate: {
        totalAllValue: Number(totalValue.toFixed(2)),
        totalAllBookings: totalBookings,
        totalAllTicketAverage: Number(avgTicket.toFixed(2)),
        totalAllRepresentativeness: Number(representativeness.toFixed(2)),
      },
      previousDate: {
        totalAllValuePreviousData: Number(totalValuePrev.toFixed(2)),
        totalAllBookingsPreviousData: totalBookingsPrev,
        totalAllTicketAveragePreviousData: Number(avgTicketPrev.toFixed(2)),
        totalAllRepresentativenessPreviousData: Number(representativenessPrev.toFixed(2)),
      },
      monthlyForecast: {
        totalAllValueForecast: Number(forecastValue.toFixed(2)),
        totalAllBookingsForecast: forecastBookings,
        totalAllTicketAverageForecast: Number(forecastTicket.toFixed(2)),
        totalAllRepresentativenessForecast: Number(forecastRepresentativeness.toFixed(2)),
      },
    };
  }

  /**
   * Calcula RevenueByCompany - faturamento total de reservas de cada unidade (consolidado)
   * Retorna: categories = nomes das unidades, series = valores totais
   */
  private calculateRevenueByCompanyConsolidated(
    results: UnitBookingsKpiData[],
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
   * Calcula BookingsByCompany - quantidade total de reservas de cada unidade (consolidado)
   * Retorna: categories = nomes das unidades, series = valores totais
   */
  private calculateBookingsByCompanyConsolidated(
    results: UnitBookingsKpiData[],
  ): ApexChartsData {
    const categories: string[] = [];
    const series: number[] = [];

    for (const r of results) {
      categories.push(r.unitName);
      series.push(r.bigNumbers.totalBookings);
    }

    return { categories, series };
  }

  /**
   * Calcula BillingOfReservationsByPeriod - faturamento por unidade por data
   */
  private calculateBillingByPeriod(
    results: UnitBookingsKpiData[],
    categories: string[],
    allDates: string[],
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    // Adiciona série para cada unidade
    for (const r of results) {
      const data: number[] = [];
      for (const dateKey of allDates) {
        data.push(Number((r.billingByDate.get(dateKey) || 0).toFixed(2)));
      }
      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula RepresentativenessOfReservesByPeriod - representatividade por unidade por data
   * Representatividade = faturamento do dia / faturamento total do período
   * Multiplicada por 100 para mostrar como percentual (frontend só adiciona "%")
   */
  private calculateRepresentativenessByPeriod(
    results: UnitBookingsKpiData[],
    categories: string[],
    allDates: string[],
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    // Calcula o total de faturamento do período para cada unidade
    for (const r of results) {
      const totalPeriodBilling = Array.from(r.billingByDate.values()).reduce((sum, val) => sum + val, 0);

      const data: number[] = [];
      for (const dateKey of allDates) {
        const dayBilling = r.billingByDate.get(dateKey) || 0;
        // Multiplica por 100 para mostrar como percentual (ex: 1.6% em vez de 0.016)
        const percent = totalPeriodBilling > 0 ? (dayBilling / totalPeriodBilling) * 100 : 0;
        data.push(Number(percent.toFixed(2)));
      }
      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula NumberOfReservationsPerPeriod - número de reservas por unidade por data
   */
  private calculateNumberOfReservationsByPeriod(
    results: UnitBookingsKpiData[],
    categories: string[],
    allDates: string[],
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    // Adiciona série para cada unidade
    for (const r of results) {
      const data: number[] = [];
      for (const dateKey of allDates) {
        data.push(r.bookingsByDate.get(dateKey) || 0);
      }
      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula ReservationsOfEcommerceByPeriod - reservas ecommerce por unidade por data
   */
  private calculateEcommerceReservationsByPeriod(
    results: UnitBookingsKpiData[],
    categories: string[],
    allDates: string[],
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const data: number[] = [];
      for (const dateKey of allDates) {
        data.push(r.ecommerceBookingsByDate.get(dateKey) || 0);
      }
      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula BillingOfEcommerceByPeriod - faturamento ecommerce por unidade por data
   */
  private calculateEcommerceBillingByPeriod(
    results: UnitBookingsKpiData[],
    categories: string[],
    allDates: string[],
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const data: number[] = [];
      for (const dateKey of allDates) {
        data.push(Number((r.ecommerceBillingByDate.get(dateKey) || 0).toFixed(2)));
      }
      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
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

  /**
   * Agrega dados de um Map por período (dia ou mês)
   */
  private aggregateDataByPeriod(dataMap: Map<string, number>, groupByMonth: boolean): Map<string, number> {
    const aggregated = new Map<string, number>();

    for (const [dateKey, value] of dataMap.entries()) {
      const periodKey = groupByMonth ? this.dateUtilsService.formatDateToMonth(dateKey) : this.dateUtilsService.formatDateDisplay(dateKey);
      const current = aggregated.get(periodKey) || 0;
      aggregated.set(periodKey, current + value);
    }

    return aggregated;
  }

  /**
   * Calcula RevenueByCompany agrupado por período (dia ou mês)
   */
  private calculateRevenueByCompanyGrouped(
    results: UnitBookingsKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const aggregatedData = this.aggregateDataByPeriod(r.billingByDate, groupByMonth);
      const data: number[] = [];

      for (const period of categories) {
        data.push(Number((aggregatedData.get(period) || 0).toFixed(2)));
      }

      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula BookingsByCompany agrupado por período (dia ou mês)
   */
  private calculateBookingsByCompanyGrouped(
    results: UnitBookingsKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const aggregatedData = this.aggregateDataByPeriod(r.bookingsByDate, groupByMonth);
      const data: number[] = [];

      for (const period of categories) {
        data.push(aggregatedData.get(period) || 0);
      }

      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula BillingByPeriod agrupado por período (dia ou mês)
   */
  private calculateBillingByPeriodGrouped(
    results: UnitBookingsKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const aggregatedData = this.aggregateDataByPeriod(r.billingByDate, groupByMonth);
      const data: number[] = [];

      for (const period of categories) {
        data.push(Number((aggregatedData.get(period) || 0).toFixed(2)));
      }

      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula RepresentativenessByPeriod agrupado por período (dia ou mês)
   * Representatividade multiplicada por 100 para mostrar como percentual (frontend só adiciona "%")
   */
  private calculateRepresentativenessByPeriodGrouped(
    results: UnitBookingsKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const aggregatedData = this.aggregateDataByPeriod(r.billingByDate, groupByMonth);
      const totalPeriodBilling = Array.from(aggregatedData.values()).reduce((sum, val) => sum + val, 0);

      const data: number[] = [];

      for (const period of categories) {
        const periodBilling = aggregatedData.get(period) || 0;
        // Multiplica por 100 para mostrar como percentual (ex: 1.6% em vez de 0.016)
        const percent = totalPeriodBilling > 0 ? (periodBilling / totalPeriodBilling) * 100 : 0;
        data.push(Number(percent.toFixed(2)));
      }

      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula NumberOfReservationsByPeriod agrupado por período (dia ou mês)
   */
  private calculateNumberOfReservationsByPeriodGrouped(
    results: UnitBookingsKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const aggregatedData = this.aggregateDataByPeriod(r.bookingsByDate, groupByMonth);
      const data: number[] = [];

      for (const period of categories) {
        data.push(aggregatedData.get(period) || 0);
      }

      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula EcommerceReservationsByPeriod agrupado por período (dia ou mês)
   */
  private calculateEcommerceReservationsByPeriodGrouped(
    results: UnitBookingsKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const aggregatedData = this.aggregateDataByPeriod(r.ecommerceBookingsByDate, groupByMonth);
      const data: number[] = [];

      for (const period of categories) {
        data.push(aggregatedData.get(period) || 0);
      }

      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }

  /**
   * Calcula EcommerceBillingByPeriod agrupado por período (dia ou mês)
   */
  private calculateEcommerceBillingByPeriodGrouped(
    results: UnitBookingsKpiData[],
    categories: string[],
    groupByMonth: boolean,
  ): ApexChartsMultiSeriesData {
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      const aggregatedData = this.aggregateDataByPeriod(r.ecommerceBillingByDate, groupByMonth);
      const data: number[] = [];

      for (const period of categories) {
        data.push(Number((aggregatedData.get(period) || 0).toFixed(2)));
      }

      series.push({
        name: r.unitName,
        data,
      });
    }

    return { categories, series };
  }
}

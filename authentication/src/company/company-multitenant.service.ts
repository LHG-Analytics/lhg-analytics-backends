/**
 * Service para KPIs unificados de Company - Versão Multi-Tenant
 * Conecta diretamente aos bancos de dados das unidades via SQL
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { CachePeriodEnum } from '../cache/cache.interfaces';
import { UnitKey, UNIT_CONFIGS } from '../database/database.interfaces';
import {
  UnifiedCompanyKpiResponse,
  BigNumbersDataSQL,
  ApexChartsData,
} from './company.interfaces';
import {
  getBigNumbersSQL,
  getRevenueByDateSQL,
  getRentalsByDateSQL,
  getTrevparByDateSQL,
  getOccupancyRateByDateSQL,
  getGiroByDateSQL,
} from './sql/company.queries';

interface UnitBigNumbers {
  totalRentals: number;
  totalValue: number;
  totalOccupiedTime: number;
  totalTips: number;
}

interface UnitKpiData {
  unit: UnitKey;
  unitName: string;
  bigNumbers: UnitBigNumbers;
  bigNumbersPrevious?: UnitBigNumbers;
  revenueByDate: Map<string, number>;
  rentalsByDate: Map<string, number>;
  trevparByDate: Map<string, number>;
  occupancyRateByDate: Map<string, number>;
  giroByDate: Map<string, number>;
}

@Injectable()
export class CompanyMultitenantService {
  private readonly logger = new Logger(CompanyMultitenantService.name);

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
  ): Promise<UnifiedCompanyKpiResponse> {
    const customDates = {
      start: this.parseDate(startDate),
      end: this.parseDate(endDate),
    };

    // Usa o cache service com TTL dinâmico
    const result = await this.kpiCacheService.getOrCalculate(
      'company',
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
  ): Promise<UnifiedCompanyKpiResponse> {
    const startTime = Date.now();
    const connectedUnits = this.databaseService.getConnectedUnits();

    if (connectedUnits.length === 0) {
      throw new Error('Nenhuma unidade conectada. Verifique as variáveis de ambiente.');
    }

    this.logger.log(`Buscando KPIs de ${connectedUnits.length} unidades...`);

    // Calcula período anterior (mesma duração, imediatamente antes)
    const { previousStart, previousEnd } = this.calculatePreviousPeriod(startDate, endDate);

    // Executa queries em paralelo para cada unidade (período atual + anterior)
    const unitDataPromises = connectedUnits.map((unit) =>
      this.fetchUnitKpis(unit, startDate, endDate, previousStart, previousEnd),
    );

    const unitResults = await Promise.all(unitDataPromises);
    const validResults = unitResults.filter((r) => r !== null) as UnitKpiData[];

    if (validResults.length === 0) {
      throw new Error('Nenhuma unidade retornou dados válidos');
    }

    // Consolida os dados
    const consolidated = this.consolidateData(validResults, startDate, endDate);

    this.logger.log(
      `KPIs consolidados de ${validResults.length} unidades em ${Date.now() - startTime}ms`,
    );

    return consolidated;
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
   * Busca KPIs de uma unidade específica (período atual + anterior)
   */
  private async fetchUnitKpis(
    unit: UnitKey,
    startDate: string,
    endDate: string,
    previousStart: string,
    previousEnd: string,
  ): Promise<UnitKpiData | null> {
    try {
      // Executa todas as queries em paralelo para a unidade (atual + anterior)
      const [
        bigNumbersResult,
        bigNumbersPrevResult,
        revenueResult,
        rentalsResult,
        trevparResult,
        occupancyResult,
        giroResult,
      ] = await Promise.all([
        this.databaseService.query(unit, getBigNumbersSQL(unit, startDate, endDate)),
        this.databaseService.query(unit, getBigNumbersSQL(unit, previousStart, previousEnd)),
        this.databaseService.query(unit, getRevenueByDateSQL(unit, startDate, endDate)),
        this.databaseService.query(unit, getRentalsByDateSQL(unit, startDate, endDate)),
        this.databaseService.query(unit, getTrevparByDateSQL(unit, startDate, endDate)),
        this.databaseService.query(unit, getOccupancyRateByDateSQL(unit, startDate, endDate)),
        this.databaseService.query(unit, getGiroByDateSQL(unit, startDate, endDate)),
      ]);

      // Processa BigNumbers atual
      const bn = bigNumbersResult.rows[0] || {};
      const bigNumbers: UnitBigNumbers = {
        totalRentals: parseInt(bn.total_rentals) || 0,
        totalValue: parseFloat(bn.total_all_value) || 0,
        totalOccupiedTime: parseFloat(bn.total_occupied_time) || 0,
        totalTips: parseFloat(bn.total_tips) || 0,
      };

      // Processa BigNumbers anterior
      const bnPrev = bigNumbersPrevResult.rows[0] || {};
      const bigNumbersPrevious: UnitBigNumbers = {
        totalRentals: parseInt(bnPrev.total_rentals) || 0,
        totalValue: parseFloat(bnPrev.total_all_value) || 0,
        totalOccupiedTime: parseFloat(bnPrev.total_occupied_time) || 0,
        totalTips: parseFloat(bnPrev.total_tips) || 0,
      };

      // Processa séries por data
      const revenueByDate = new Map<string, number>();
      for (const row of revenueResult.rows) {
        revenueByDate.set(this.formatDateKey(row.date), parseFloat(row.daily_revenue) || 0);
      }

      const rentalsByDate = new Map<string, number>();
      for (const row of rentalsResult.rows) {
        rentalsByDate.set(this.formatDateKey(row.date), parseInt(row.total_rentals) || 0);
      }

      const trevparByDate = new Map<string, number>();
      for (const row of trevparResult.rows) {
        trevparByDate.set(this.formatDateKey(row.date), parseFloat(row.trevpar) || 0);
      }

      const occupancyRateByDate = new Map<string, number>();
      for (const row of occupancyResult.rows) {
        occupancyRateByDate.set(this.formatDateKey(row.date), parseFloat(row.occupancy_rate) || 0);
      }

      const giroByDate = new Map<string, number>();
      for (const row of giroResult.rows) {
        giroByDate.set(this.formatDateKey(row.date), parseFloat(row.giro) || 0);
      }

      this.logger.log(`KPIs de ${UNIT_CONFIGS[unit].name} obtidos com sucesso`);

      return {
        unit,
        unitName: UNIT_CONFIGS[unit].name,
        bigNumbers,
        bigNumbersPrevious,
        revenueByDate,
        rentalsByDate,
        trevparByDate,
        occupancyRateByDate,
        giroByDate,
      };
    } catch (error) {
      this.logger.error(`Erro ao buscar KPIs de ${UNIT_CONFIGS[unit].name}: ${error.message}`);
      return null;
    }
  }

  /**
   * Consolida os dados de todas as unidades
   */
  private consolidateData(
    results: UnitKpiData[],
    startDate: string,
    endDate: string,
  ): UnifiedCompanyKpiResponse {
    // Gera todas as datas do período
    const allDates = this.generateDateRange(startDate, endDate);
    const categories = allDates.map((d) => this.formatDateDisplay(d));

    // Consolida BigNumbers (com previousDate e monthlyForecast)
    const bigNumbers = this.consolidateBigNumbers(results, startDate, endDate);

    // RevenueByCompany - faturamento total de cada unidade
    const revenueByCompany = this.calculateRevenueByCompany(results);

    // Consolida séries por data
    const revenueByDate = this.consolidateSeries(results, 'revenueByDate', allDates, 'sum');
    const rentalsByDate = this.consolidateSeries(results, 'rentalsByDate', allDates, 'sum');
    const trevparByDate = this.consolidateSeries(results, 'trevparByDate', allDates, 'avg');
    const occupancyRateByDate = this.consolidateSeries(results, 'occupancyRateByDate', allDates, 'avg');

    // Ticket médio consolidado = faturamento total / locações totais (por data)
    const ticketAverageByDate = this.calculateConsolidatedTicketAverage(
      revenueByDate,
      rentalsByDate,
    );

    return {
      Company: 'LHG',
      BigNumbers: [bigNumbers],
      RevenueByCompany: revenueByCompany,
      RevenueByDate: { categories, series: revenueByDate.series },
      RentalsByDate: { categories, series: rentalsByDate.series },
      TicketAverageByDate: { categories, series: ticketAverageByDate.series },
      TrevparByDate: { categories, series: trevparByDate.series },
      OccupancyRateByDate: { categories, series: occupancyRateByDate.series },
    };
  }

  /**
   * Consolida BigNumbers de todas as unidades (com previousDate e monthlyForecast)
   */
  private consolidateBigNumbers(
    results: UnitKpiData[],
    startDate: string,
    endDate: string,
  ): BigNumbersDataSQL {
    // --- Dados atuais ---
    let totalValue = 0;
    let totalRentals = 0;
    let totalOccupiedSeconds = 0;
    let totalTips = 0;

    // --- Dados anteriores ---
    let totalValuePrev = 0;
    let totalRentalsPrev = 0;
    let totalOccupiedSecondsPrev = 0;
    let totalTipsPrev = 0;

    for (const r of results) {
      // Atuais
      totalValue += r.bigNumbers.totalValue;
      totalRentals += r.bigNumbers.totalRentals;
      totalOccupiedSeconds += r.bigNumbers.totalOccupiedTime;
      totalTips += r.bigNumbers.totalTips;

      // Anteriores
      if (r.bigNumbersPrevious) {
        totalValuePrev += r.bigNumbersPrevious.totalValue;
        totalRentalsPrev += r.bigNumbersPrevious.totalRentals;
        totalOccupiedSecondsPrev += r.bigNumbersPrevious.totalOccupiedTime;
        totalTipsPrev += r.bigNumbersPrevious.totalTips;
      }
    }

    const totalSuites = results.reduce(
      (sum, r) => sum + UNIT_CONFIGS[r.unit].suiteConfig.totalSuites,
      0,
    );

    // Calcula número de dias no período
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);
    const daysInPeriod = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // --- Cálculos período atual ---
    const avgTicket = totalRentals > 0 ? totalValue / totalRentals : 0;
    const avgTrevpar = totalSuites > 0 && daysInPeriod > 0
      ? (totalValue + totalTips) / totalSuites / daysInPeriod
      : 0;
    const avgGiro = totalSuites > 0 && daysInPeriod > 0
      ? totalRentals / totalSuites / daysInPeriod
      : 0;
    const avgOccupiedSeconds = totalRentals > 0 ? totalOccupiedSeconds / totalRentals : 0;

    // --- Cálculos período anterior ---
    const avgTicketPrev = totalRentalsPrev > 0 ? totalValuePrev / totalRentalsPrev : 0;
    const avgTrevparPrev = totalSuites > 0 && daysInPeriod > 0
      ? (totalValuePrev + totalTipsPrev) / totalSuites / daysInPeriod
      : 0;
    const avgGiroPrev = totalSuites > 0 && daysInPeriod > 0
      ? totalRentalsPrev / totalSuites / daysInPeriod
      : 0;
    const avgOccupiedSecondsPrev = totalRentalsPrev > 0 ? totalOccupiedSecondsPrev / totalRentalsPrev : 0;

    // --- Cálculos forecast mensal ---
    // Calcula quantos dias do mês já passaram e quantos faltam
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const totalDaysInMonth = endOfMonth.getDate();

    // Se o período atual está dentro do mês atual, projeta para o mês inteiro
    const isCurrentMonth = start.getMonth() === today.getMonth() && start.getFullYear() === today.getFullYear();

    let forecastValue = 0;
    let forecastRentals = 0;
    let forecastTrevpar = 0;
    let forecastGiro = 0;
    let forecastOccupiedSeconds = 0;

    if (isCurrentMonth && daysInPeriod > 0) {
      // Projeção: (valor atual / dias no período) * dias no mês
      const dailyAvgValue = totalValue / daysInPeriod;
      const dailyAvgRentals = totalRentals / daysInPeriod;

      forecastValue = dailyAvgValue * totalDaysInMonth;
      forecastRentals = Math.round(dailyAvgRentals * totalDaysInMonth);
      forecastTrevpar = totalSuites > 0 ? forecastValue / totalSuites / totalDaysInMonth : 0;
      forecastGiro = totalSuites > 0 ? forecastRentals / totalSuites / totalDaysInMonth : 0;
      forecastOccupiedSeconds = avgOccupiedSeconds; // TMO mantém a média
    } else {
      // Se não está no mês atual, usa os valores atuais como forecast
      forecastValue = totalValue;
      forecastRentals = totalRentals;
      forecastTrevpar = avgTrevpar;
      forecastGiro = avgGiro;
      forecastOccupiedSeconds = avgOccupiedSeconds;
    }

    const forecastTicket = forecastRentals > 0 ? forecastValue / forecastRentals : 0;

    return {
      currentDate: {
        totalAllValue: Number(totalValue.toFixed(2)),
        totalAllRentalsApartments: totalRentals,
        totalAllTicketAverage: Number(avgTicket.toFixed(2)),
        totalAllTrevpar: Number(avgTrevpar.toFixed(2)),
        totalAllGiro: Number(avgGiro.toFixed(2)),
        totalAverageOccupationTime: this.secondsToTime(avgOccupiedSeconds),
      },
      previousDate: {
        totalAllValuePreviousData: Number(totalValuePrev.toFixed(2)),
        totalAllRentalsApartmentsPreviousData: totalRentalsPrev,
        totalAllTicketAveragePreviousData: Number(avgTicketPrev.toFixed(2)),
        totalAllTrevparPreviousData: Number(avgTrevparPrev.toFixed(2)),
        totalAllGiroPreviousData: Number(avgGiroPrev.toFixed(2)),
        totalAverageOccupationTimePreviousData: this.secondsToTime(avgOccupiedSecondsPrev),
      },
      monthlyForecast: {
        totalAllValueForecast: Number(forecastValue.toFixed(2)),
        totalAllRentalsApartmentsForecast: forecastRentals,
        totalAllTicketAverageForecast: Number(forecastTicket.toFixed(2)),
        totalAllTrevparForecast: Number(forecastTrevpar.toFixed(2)),
        totalAllGiroForecast: Number(forecastGiro.toFixed(2)),
        totalAverageOccupationTimeForecast: this.secondsToTime(forecastOccupiedSeconds),
      },
    };
  }

  /**
   * Calcula RevenueByCompany - faturamento total de cada unidade
   */
  private calculateRevenueByCompany(results: UnitKpiData[]): ApexChartsData {
    const categories: string[] = [];
    const series: number[] = [];

    for (const r of results) {
      categories.push(r.unitName);
      series.push(Number(r.bigNumbers.totalValue.toFixed(2)));
    }

    return { categories, series };
  }

  /**
   * Consolida séries de dados somando ou fazendo média por data
   */
  private consolidateSeries(
    results: UnitKpiData[],
    field: keyof Pick<UnitKpiData, 'revenueByDate' | 'rentalsByDate' | 'trevparByDate' | 'occupancyRateByDate' | 'giroByDate'>,
    dates: string[],
    mode: 'sum' | 'avg',
  ): ApexChartsData {
    const series: number[] = [];

    for (const dateKey of dates) {
      let total = 0;
      let count = 0;

      for (const r of results) {
        const value = r[field].get(dateKey) || 0;
        total += value;
        if (value > 0) count++;
      }

      if (mode === 'avg' && count > 0) {
        series.push(Number((total / count).toFixed(2)));
      } else {
        series.push(Number(total.toFixed(2)));
      }
    }

    return { categories: dates.map((d) => this.formatDateDisplay(d)), series };
  }

  /**
   * Calcula ticket médio consolidado = faturamento total / locações totais
   */
  private calculateConsolidatedTicketAverage(
    revenue: ApexChartsData,
    rentals: ApexChartsData,
  ): ApexChartsData {
    const series: number[] = [];

    for (let i = 0; i < revenue.series.length; i++) {
      const totalRevenue = revenue.series[i] || 0;
      const totalRentals = rentals.series[i] || 0;
      const ticketAvg = totalRentals > 0 ? totalRevenue / totalRentals : 0;
      series.push(Number(ticketAvg.toFixed(2)));
    }

    return { categories: revenue.categories, series };
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

  /**
   * Converte segundos para string de tempo (HH:MM:SS)
   */
  private secondsToTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

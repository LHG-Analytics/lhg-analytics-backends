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
  ApexChartsSeriesData,
  NamedSeries,
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
  bigNumbersMonthly?: UnitBigNumbers; // Dados do mês atual para forecast
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
      throw new Error(
        'Nenhuma unidade conectada. Verifique as variáveis de ambiente.',
      );
    }

    this.logger.log(`Buscando KPIs de ${connectedUnits.length} unidades...`);

    // Calcula período anterior (mesma duração, imediatamente antes)
    const { previousStart, previousEnd } = this.calculatePreviousPeriod(
      startDate,
      endDate,
    );

    // Calcula período do mês atual para forecast (dia 1 às 06:00 até ontem às 05:59:59)
    const {
      monthStart,
      monthEnd,
      daysElapsed,
      remainingDays,
      totalDaysInMonth,
    } = this.calculateCurrentMonthPeriod();

    // Executa queries em paralelo para cada unidade (período atual + anterior + mês atual para forecast)
    const unitDataPromises = connectedUnits.map((unit) =>
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

    const unitResults = await Promise.all(unitDataPromises);
    const validResults = unitResults.filter((r) => r !== null) as UnitKpiData[];

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
      `KPIs consolidados de ${validResults.length} unidades em ${Date.now() - startTime}ms`,
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
  private calculatePreviousPeriod(
    startDate: string,
    endDate: string,
  ): { previousStart: string; previousEnd: string } {
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
   * Busca KPIs de uma unidade específica (período atual + anterior + mês atual)
   */
  private async fetchUnitKpis(
    unit: UnitKey,
    startDate: string,
    endDate: string,
    previousStart: string,
    previousEnd: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<UnitKpiData | null> {
    try {
      // Executa todas as queries em paralelo para a unidade (atual + anterior + mês atual)
      const [
        bigNumbersResult,
        bigNumbersPrevResult,
        bigNumbersMonthlyResult,
        revenueResult,
        rentalsResult,
        trevparResult,
        occupancyResult,
        giroResult,
      ] = await Promise.all([
        this.databaseService.query(
          unit,
          getBigNumbersSQL(unit, startDate, endDate),
        ),
        this.databaseService.query(
          unit,
          getBigNumbersSQL(unit, previousStart, previousEnd),
        ),
        this.databaseService.query(
          unit,
          getBigNumbersSQL(unit, monthStart, monthEnd),
        ),
        this.databaseService.query(
          unit,
          getRevenueByDateSQL(unit, startDate, endDate),
        ),
        this.databaseService.query(
          unit,
          getRentalsByDateSQL(unit, startDate, endDate),
        ),
        this.databaseService.query(
          unit,
          getTrevparByDateSQL(unit, startDate, endDate),
        ),
        this.databaseService.query(
          unit,
          getOccupancyRateByDateSQL(unit, startDate, endDate),
        ),
        this.databaseService.query(
          unit,
          getGiroByDateSQL(unit, startDate, endDate),
        ),
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

      // Processa BigNumbers do mês atual (para forecast)
      const bnMonthly = bigNumbersMonthlyResult.rows[0] || {};
      const bigNumbersMonthly: UnitBigNumbers = {
        totalRentals: parseInt(bnMonthly.total_rentals) || 0,
        totalValue: parseFloat(bnMonthly.total_all_value) || 0,
        totalOccupiedTime: parseFloat(bnMonthly.total_occupied_time) || 0,
        totalTips: parseFloat(bnMonthly.total_tips) || 0,
      };

      // Processa séries por data
      const revenueByDate = new Map<string, number>();
      for (const row of revenueResult.rows) {
        revenueByDate.set(
          this.formatDateKey(row.date),
          parseFloat(row.daily_revenue) || 0,
        );
      }

      const rentalsByDate = new Map<string, number>();
      for (const row of rentalsResult.rows) {
        rentalsByDate.set(
          this.formatDateKey(row.date),
          parseInt(row.total_rentals) || 0,
        );
      }

      const trevparByDate = new Map<string, number>();
      for (const row of trevparResult.rows) {
        trevparByDate.set(
          this.formatDateKey(row.date),
          parseFloat(row.trevpar) || 0,
        );
      }

      const occupancyRateByDate = new Map<string, number>();
      for (const row of occupancyResult.rows) {
        occupancyRateByDate.set(
          this.formatDateKey(row.date),
          parseFloat(row.occupancy_rate) || 0,
        );
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
        bigNumbersMonthly,
        revenueByDate,
        rentalsByDate,
        trevparByDate,
        occupancyRateByDate,
        giroByDate,
      };
    } catch (error) {
      this.logger.error(
        `Erro ao buscar KPIs de ${UNIT_CONFIGS[unit].name}: ${error.message}`,
      );
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
    daysElapsed: number,
    remainingDays: number,
    totalDaysInMonth: number,
  ): UnifiedCompanyKpiResponse {
    // Calcula a diferença de dias para determinar se agrupa por mês ou por dia
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);
    const rangeDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    const groupByMonth = rangeDays > 40;

    // Gera todas as datas/meses do período
    const allPeriods = this.generatePeriodRange(
      startDate,
      endDate,
      groupByMonth,
    );
    const categories = allPeriods;

    // Consolida BigNumbers (com previousDate e monthlyForecast)
    // rangeDays + 1 porque inclui o dia inicial e final
    const daysInSelectedPeriod = rangeDays + 1;
    const bigNumbers = this.consolidateBigNumbers(
      results,
      daysElapsed,
      remainingDays,
      totalDaysInMonth,
      daysInSelectedPeriod,
    );

    // RevenueByCompany - faturamento total de cada unidade
    const revenueByCompany = this.calculateRevenueByCompany(results);

    // Consolida séries por unidade por data/mês
    const revenueByDate = this.consolidateSeriesByUnit(
      results,
      'revenueByDate',
      allPeriods,
      groupByMonth,
    );
    const rentalsByDate = this.consolidateSeriesByUnit(
      results,
      'rentalsByDate',
      allPeriods,
      groupByMonth,
    );
    const trevparByDate = this.consolidateSeriesByUnit(
      results,
      'trevparByDate',
      allPeriods,
      groupByMonth,
    );
    const occupancyRateByDate = this.consolidateSeriesByUnit(
      results,
      'occupancyRateByDate',
      allPeriods,
      groupByMonth,
    );

    // Ticket médio por unidade = faturamento / locações de cada unidade (por data/mês)
    const ticketAverageByDate = this.calculateTicketAverageByUnit(
      revenueByDate,
      rentalsByDate,
    );

    return {
      Company: 'LHG',
      BigNumbers: [bigNumbers],
      RevenueByCompany: revenueByCompany,
      RevenueByDate: revenueByDate,
      RentalsByDate: rentalsByDate,
      TicketAverageByDate: ticketAverageByDate,
      TrevparByDate: trevparByDate,
      OccupancyRateByDate: occupancyRateByDate,
    };
  }

  /**
   * Consolida BigNumbers de todas as unidades (com previousDate e monthlyForecast)
   * monthlyForecast: busca dados do mês atual (dia 1 até ontem) e projeta para o mês inteiro
   */
  private consolidateBigNumbers(
    results: UnitKpiData[],
    daysElapsed: number,
    remainingDays: number,
    totalDaysInMonth: number,
    daysInSelectedPeriod: number,
  ): BigNumbersDataSQL {
    // --- Dados atuais (período selecionado) ---
    let totalValue = 0;
    let totalRentals = 0;
    let totalOccupiedSeconds = 0;
    let totalTips = 0;

    // --- Dados anteriores ---
    let totalValuePrev = 0;
    let totalRentalsPrev = 0;
    let totalOccupiedSecondsPrev = 0;
    let totalTipsPrev = 0;

    // --- Dados do mês atual (para forecast) ---
    let monthlyTotalValue = 0;
    let monthlyTotalRentals = 0;
    let monthlyTotalOccupiedSeconds = 0;
    let monthlyTotalTips = 0;

    for (const r of results) {
      // Atuais (período selecionado)
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

      // Mês atual (para forecast)
      if (r.bigNumbersMonthly) {
        monthlyTotalValue += r.bigNumbersMonthly.totalValue;
        monthlyTotalRentals += r.bigNumbersMonthly.totalRentals;
        monthlyTotalOccupiedSeconds += r.bigNumbersMonthly.totalOccupiedTime;
        monthlyTotalTips += r.bigNumbersMonthly.totalTips;
      }
    }

    const totalSuites = results.reduce(
      (sum, r) => sum + UNIT_CONFIGS[r.unit].suiteConfig.totalSuites,
      0,
    );

    // --- Cálculos período atual ---
    // Usa daysInSelectedPeriod para calcular Trevpar e Giro do período selecionado
    const avgTicket = totalRentals > 0 ? totalValue / totalRentals : 0;
    const avgTrevpar =
      totalSuites > 0 && daysInSelectedPeriod > 0
        ? (totalValue + totalTips) / totalSuites / daysInSelectedPeriod
        : 0;
    const avgGiro =
      totalSuites > 0 && daysInSelectedPeriod > 0
        ? totalRentals / totalSuites / daysInSelectedPeriod
        : 0;
    const avgOccupiedSeconds =
      totalRentals > 0 ? totalOccupiedSeconds / totalRentals : 0;

    // --- Cálculos período anterior ---
    // O período anterior tem a mesma duração do período selecionado
    const avgTicketPrev =
      totalRentalsPrev > 0 ? totalValuePrev / totalRentalsPrev : 0;
    const avgTrevparPrev =
      totalSuites > 0 && daysInSelectedPeriod > 0
        ? (totalValuePrev + totalTipsPrev) / totalSuites / daysInSelectedPeriod
        : 0;
    const avgGiroPrev =
      totalSuites > 0 && daysInSelectedPeriod > 0
        ? totalRentalsPrev / totalSuites / daysInSelectedPeriod
        : 0;
    const avgOccupiedSecondsPrev =
      totalRentalsPrev > 0 ? totalOccupiedSecondsPrev / totalRentalsPrev : 0;

    // --- Cálculos forecast mensal ---
    // Fórmula: forecastValue = monthlyTotalValue + (dailyAverageValue * remainingDays)
    let forecastValue = 0;
    let forecastRentals = 0;
    let forecastTrevpar = 0;
    let forecastGiro = 0;
    let forecastOccupiedSeconds = 0;

    if (daysElapsed > 0) {
      // Média diária baseada nos dados do mês atual
      const dailyAvgValue = monthlyTotalValue / daysElapsed;
      const dailyAvgRentals = monthlyTotalRentals / daysElapsed;

      // Projeção: valor atual do mês + (média diária * dias restantes)
      forecastValue = monthlyTotalValue + dailyAvgValue * remainingDays;
      forecastRentals = Math.round(
        monthlyTotalRentals + dailyAvgRentals * remainingDays,
      );
      forecastTrevpar =
        totalSuites > 0 ? forecastValue / totalSuites / totalDaysInMonth : 0;
      forecastGiro =
        totalSuites > 0 ? forecastRentals / totalSuites / totalDaysInMonth : 0;
      forecastOccupiedSeconds =
        monthlyTotalRentals > 0
          ? monthlyTotalOccupiedSeconds / monthlyTotalRentals
          : 0; // TMO mantém a média do mês
    }

    const forecastTicket =
      forecastRentals > 0 ? forecastValue / forecastRentals : 0;

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
        totalAverageOccupationTimePreviousData: this.secondsToTime(
          avgOccupiedSecondsPrev,
        ),
      },
      monthlyForecast: {
        totalAllValueForecast: Number(forecastValue.toFixed(2)),
        totalAllRentalsApartmentsForecast: forecastRentals,
        totalAllTicketAverageForecast: Number(forecastTicket.toFixed(2)),
        totalAllTrevparForecast: Number(forecastTrevpar.toFixed(2)),
        totalAllGiroForecast: Number(forecastGiro.toFixed(2)),
        totalAverageOccupationTimeForecast: this.secondsToTime(
          forecastOccupiedSeconds,
        ),
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
   * Consolida séries de dados por unidade, retornando séries nomeadas
   * Cada unidade tem sua própria série de dados
   */
  private consolidateSeriesByUnit(
    results: UnitKpiData[],
    field: keyof Pick<
      UnitKpiData,
      | 'revenueByDate'
      | 'rentalsByDate'
      | 'trevparByDate'
      | 'occupancyRateByDate'
      | 'giroByDate'
    >,
    periods: string[],
    groupByMonth: boolean,
  ): ApexChartsSeriesData {
    const series: NamedSeries[] = [];

    // Para cada unidade, cria uma série nomeada
    for (const r of results) {
      const unitData: number[] = [];

      // Cria um mapa dos dados da unidade por período
      const unitPeriodMap = new Map<string, number>();
      for (const [dateKey, value] of r[field].entries()) {
        const periodKey = groupByMonth
          ? this.formatDateToMonth(dateKey)
          : this.formatDateDisplay(dateKey);

        // Soma valores do mesmo período (caso tenha múltiplos por mês)
        const current = unitPeriodMap.get(periodKey) || 0;
        unitPeriodMap.set(periodKey, current + value);
      }

      // Preenche os dados para cada período
      for (const periodKey of periods) {
        const value = unitPeriodMap.get(periodKey) || 0;
        unitData.push(Number(value.toFixed(2)));
      }

      series.push({
        name: r.unitName,
        data: unitData,
      });
    }

    return { categories: periods, series };
  }

  /**
   * Calcula ticket médio por unidade = faturamento / locações de cada unidade
   */
  private calculateTicketAverageByUnit(
    revenue: ApexChartsSeriesData,
    rentals: ApexChartsSeriesData,
  ): ApexChartsSeriesData {
    const series: NamedSeries[] = [];

    // Para cada unidade (série), calcula o ticket médio
    for (let u = 0; u < revenue.series.length; u++) {
      const unitRevenue = revenue.series[u];
      const unitRentals = rentals.series[u];
      const unitData: number[] = [];

      for (let i = 0; i < unitRevenue.data.length; i++) {
        const totalRevenue = unitRevenue.data[i] || 0;
        const totalRentals = unitRentals.data[i] || 0;
        const ticketAvg = totalRentals > 0 ? totalRevenue / totalRentals : 0;
        unitData.push(Number(ticketAvg.toFixed(2)));
      }

      series.push({
        name: unitRevenue.name,
        data: unitData,
      });
    }

    return { categories: revenue.categories, series };
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

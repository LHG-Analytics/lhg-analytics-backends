/**
 * Service para KPIs unificados de Governance - Versão Multi-Tenant
 * Conecta diretamente aos bancos de dados das unidades via SQL
 */

import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { CachePeriodEnum } from '../cache/cache.interfaces';
import { UnitKey, UNIT_CONFIGS } from '../database/database.interfaces';
import {
  UnifiedGovernanceKpiResponse,
  GovernanceBigNumbersData,
  ApexChartsMultiSeriesData,
  UnitGovernanceBigNumbers,
  UnitShiftData,
  UnitGovernanceKpiData,
} from './governance.interfaces';
import {
  getGovernanceBigNumbersSQL,
  getShiftCleaningSQL,
} from './sql/governance.queries';

@Injectable()
export class GovernanceMultitenantService {
  private readonly logger = new Logger(GovernanceMultitenantService.name);

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
  ): Promise<UnifiedGovernanceKpiResponse> {
    const customDates = {
      start: this.parseDate(startDate),
      end: this.parseDate(endDate),
    };

    // Usa o cache service com TTL dinâmico
    const result = await this.kpiCacheService.getOrCalculate(
      'governance',
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
  ): Promise<UnifiedGovernanceKpiResponse> {
    const startTime = Date.now();
    const connectedUnits = this.databaseService.getConnectedUnits();

    if (connectedUnits.length === 0) {
      throw new Error('Nenhuma unidade conectada. Verifique as variáveis de ambiente.');
    }

    this.logger.log(`Buscando KPIs de Governance de ${connectedUnits.length} unidades...`);

    // Calcula período anterior (mesma duração, imediatamente antes)
    const { previousStart, previousEnd } = this.calculatePreviousPeriod(startDate, endDate);

    // Calcula período do mês atual para forecast (dia 1 às 06:00 até ontem às 05:59:59)
    const { monthStart, monthEnd, daysElapsed, remainingDays, totalDaysInMonth } = this.calculateCurrentMonthPeriod();

    // Calcula total de dias do período selecionado
    const totalDaysInPeriod = this.calculateTotalDays(startDate, endDate);

    // Executa queries em paralelo para cada unidade (período atual + anterior + mês atual para forecast)
    const unitDataPromises = connectedUnits.map((unit) =>
      this.fetchUnitKpis(unit, startDate, endDate, previousStart, previousEnd, monthStart, monthEnd, totalDaysInPeriod),
    );

    const unitResults = await Promise.all(unitDataPromises);
    const validResults = unitResults.filter((r) => r !== null) as UnitGovernanceKpiData[];

    if (validResults.length === 0) {
      throw new Error('Nenhuma unidade retornou dados válidos');
    }

    // Consolida os dados
    const consolidated = this.consolidateData(validResults, daysElapsed, remainingDays, totalDaysInMonth);

    this.logger.log(
      `KPIs de Governance consolidados de ${validResults.length} unidades em ${Date.now() - startTime}ms`,
    );

    return consolidated;
  }

  /**
   * Calcula total de dias do período
   */
  private calculateTotalDays(startDate: string, endDate: string): number {
    const start = this.parseDate(startDate);
    const end = this.parseDate(endDate);
    const diffTime = end.getTime() - start.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
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
    const monthEnd = this.formatDateBR(yesterday);

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
   * Busca KPIs de Governance de uma unidade específica (período atual + anterior + mês atual)
   */
  private async fetchUnitKpis(
    unit: UnitKey,
    startDate: string,
    endDate: string,
    previousStart: string,
    previousEnd: string,
    monthStart: string,
    monthEnd: string,
    totalDaysInPeriod: number,
  ): Promise<UnitGovernanceKpiData | null> {
    try {
      // Executa todas as queries em paralelo para a unidade (atual + anterior + mês atual)
      const [
        bigNumbersResult,
        bigNumbersPrevResult,
        bigNumbersMonthlyResult,
        shiftCleaningResult,
      ] = await Promise.all([
        this.databaseService.query(unit, getGovernanceBigNumbersSQL(unit, startDate, endDate)),
        this.databaseService.query(unit, getGovernanceBigNumbersSQL(unit, previousStart, previousEnd)),
        this.databaseService.query(unit, getGovernanceBigNumbersSQL(unit, monthStart, monthEnd)),
        this.databaseService.query(unit, getShiftCleaningSQL(unit, startDate, endDate)),
      ]);

      // Processa BigNumbers atual
      const bn = bigNumbersResult.rows[0] || {};
      const bigNumbers: UnitGovernanceBigNumbers = {
        totalCleanings: parseInt(bn.total_cleanings) || 0,
        totalInspections: parseInt(bn.total_inspections) || 0,
        totalDays: totalDaysInPeriod,
      };

      // Processa BigNumbers anterior
      const bnPrev = bigNumbersPrevResult.rows[0] || {};
      const previousDays = this.calculateTotalDays(previousStart, previousEnd);
      const bigNumbersPrevious: UnitGovernanceBigNumbers = {
        totalCleanings: parseInt(bnPrev.total_cleanings) || 0,
        totalInspections: parseInt(bnPrev.total_inspections) || 0,
        totalDays: previousDays,
      };

      // Processa BigNumbers do mês atual (para forecast)
      const bnMonthly = bigNumbersMonthlyResult.rows[0] || {};
      const monthlyDays = this.calculateTotalDays(monthStart, monthEnd);
      const bigNumbersMonthly: UnitGovernanceBigNumbers = {
        totalCleanings: parseInt(bnMonthly.total_cleanings) || 0,
        totalInspections: parseInt(bnMonthly.total_inspections) || 0,
        totalDays: monthlyDays,
      };

      // Processa dados de turno
      const shiftData: UnitShiftData = {
        manha: 0,
        tarde: 0,
        noite: 0,
        terceirizado: 0,
      };

      for (const row of shiftCleaningResult.rows) {
        const shiftName = (row.name || '').toLowerCase();
        const value = parseInt(row.value) || 0;
        if (shiftName === 'manhã') shiftData.manha = value;
        else if (shiftName === 'tarde') shiftData.tarde = value;
        else if (shiftName === 'noite') shiftData.noite = value;
        else if (shiftName === 'terceirizado') shiftData.terceirizado = value;
      }

      this.logger.log(`KPIs de Governance de ${UNIT_CONFIGS[unit].name} obtidos com sucesso`);

      return {
        unit,
        unitName: UNIT_CONFIGS[unit].name,
        bigNumbers,
        bigNumbersPrevious,
        bigNumbersMonthly,
        shiftData,
      };
    } catch (error) {
      this.logger.error(`Erro ao buscar KPIs de Governance de ${UNIT_CONFIGS[unit].name}: ${error.message}`);
      return null;
    }
  }

  /**
   * Consolida os dados de todas as unidades
   */
  private consolidateData(
    results: UnitGovernanceKpiData[],
    daysElapsed: number,
    remainingDays: number,
    totalDaysInMonth: number,
  ): UnifiedGovernanceKpiResponse {
    // Consolida BigNumbers (com previousDate e monthlyForecast)
    const bigNumbers = this.consolidateBigNumbers(results, daysElapsed, remainingDays, totalDaysInMonth);

    // CleaningsByCompany - total de limpezas por unidade
    const cleaningsByCompany = this.calculateCleaningsByCompany(results);

    // AverageCleaningByCompany - média de limpeza por unidade
    const averageCleaningByCompany = this.calculateAverageCleaningByCompany(results);

    // InspectionsByCompany - total de vistorias por unidade
    const inspectionsByCompany = this.calculateInspectionsByCompany(results);

    // ShiftCleaning - limpezas por turno com série nomeada por unidade
    const shiftCleaning = this.calculateShiftCleaning(results);

    return {
      Company: 'LHG',
      BigNumbers: [bigNumbers],
      CleaningsByCompany: cleaningsByCompany,
      AverageCleaningByCompany: averageCleaningByCompany,
      InspectionsByCompany: inspectionsByCompany,
      ShiftCleaning: shiftCleaning,
    };
  }

  /**
   * Consolida BigNumbers de todas as unidades (com previousDate e monthlyForecast)
   */
  private consolidateBigNumbers(
    results: UnitGovernanceKpiData[],
    daysElapsed: number,
    remainingDays: number,
    totalDaysInMonth: number,
  ): GovernanceBigNumbersData {
    // --- Dados atuais (período selecionado) ---
    let totalCleanings = 0;
    let totalInspections = 0;
    let totalDays = 0;

    // --- Dados anteriores ---
    let totalCleaningsPrev = 0;
    let totalInspectionsPrev = 0;
    let totalDaysPrev = 0;

    // --- Dados do mês atual (para forecast) ---
    let monthlyTotalCleanings = 0;
    let monthlyTotalInspections = 0;

    for (const r of results) {
      // Atuais (período selecionado)
      totalCleanings += r.bigNumbers.totalCleanings;
      totalInspections += r.bigNumbers.totalInspections;
      totalDays = r.bigNumbers.totalDays; // Mesmo para todas as unidades

      // Anteriores
      if (r.bigNumbersPrevious) {
        totalCleaningsPrev += r.bigNumbersPrevious.totalCleanings;
        totalInspectionsPrev += r.bigNumbersPrevious.totalInspections;
        totalDaysPrev = r.bigNumbersPrevious.totalDays;
      }

      // Mês atual (para forecast)
      if (r.bigNumbersMonthly) {
        monthlyTotalCleanings += r.bigNumbersMonthly.totalCleanings;
        monthlyTotalInspections += r.bigNumbersMonthly.totalInspections;
      }
    }

    // --- Cálculos período atual ---
    const avgDailyCleaning = totalDays > 0 ? totalCleanings / totalDays : 0;

    // --- Cálculos período anterior ---
    const avgDailyCleaningPrev = totalDaysPrev > 0 ? totalCleaningsPrev / totalDaysPrev : 0;

    // --- Cálculos forecast mensal ---
    let forecastCleanings = 0;
    let forecastInspections = 0;
    let forecastAvgDailyCleaning = 0;

    if (daysElapsed > 0) {
      // Média diária baseada nos dados do mês atual
      const dailyAvgCleanings = monthlyTotalCleanings / daysElapsed;
      const dailyAvgInspections = monthlyTotalInspections / daysElapsed;

      // Projeção: valor atual do mês + (média diária * dias restantes)
      forecastCleanings = Math.round(monthlyTotalCleanings + dailyAvgCleanings * remainingDays);
      forecastInspections = Math.round(monthlyTotalInspections + dailyAvgInspections * remainingDays);
      forecastAvgDailyCleaning = forecastCleanings / totalDaysInMonth;
    }

    return {
      currentDate: {
        totalAllSuitesCleanings: totalCleanings,
        totalAllAverageDailyCleaning: Number(avgDailyCleaning.toFixed(2)),
        totalAllInspections: totalInspections,
      },
      previousDate: {
        totalAllSuitesCleaningsPreviousData: totalCleaningsPrev,
        totalAllAverageDailyCleaningPreviousData: Number(avgDailyCleaningPrev.toFixed(2)),
        totalAllInspectionsPreviousData: totalInspectionsPrev,
      },
      monthlyForecast: {
        totalAllSuitesCleaningsForecast: forecastCleanings,
        totalAllAverageDailyCleaningForecast: Number(forecastAvgDailyCleaning.toFixed(2)),
        totalAllInspectionsForecast: forecastInspections,
      },
    };
  }

  /**
   * Calcula CleaningsByCompany - total de limpezas por unidade
   */
  private calculateCleaningsByCompany(
    results: UnitGovernanceKpiData[],
  ): ApexChartsMultiSeriesData {
    const categories = results.map((r) => r.unitName);
    const series: Array<{ name: string; data: number[] }> = [];

    // Uma única série com os valores de cada unidade
    const data = results.map((r) => r.bigNumbers.totalCleanings);
    series.push({
      name: 'Total de Limpezas',
      data,
    });

    return { categories, series };
  }

  /**
   * Calcula AverageCleaningByCompany - média de limpeza por unidade
   */
  private calculateAverageCleaningByCompany(
    results: UnitGovernanceKpiData[],
  ): ApexChartsMultiSeriesData {
    const categories = results.map((r) => r.unitName);
    const series: Array<{ name: string; data: number[] }> = [];

    const data = results.map((r) => {
      const avg = r.bigNumbers.totalDays > 0
        ? r.bigNumbers.totalCleanings / r.bigNumbers.totalDays
        : 0;
      return Number(avg.toFixed(2));
    });
    series.push({
      name: 'Média Diária de Limpezas',
      data,
    });

    return { categories, series };
  }

  /**
   * Calcula InspectionsByCompany - total de vistorias por unidade
   */
  private calculateInspectionsByCompany(
    results: UnitGovernanceKpiData[],
  ): ApexChartsMultiSeriesData {
    const categories = results.map((r) => r.unitName);
    const series: Array<{ name: string; data: number[] }> = [];

    const data = results.map((r) => r.bigNumbers.totalInspections);
    series.push({
      name: 'Total de Vistorias',
      data,
    });

    return { categories, series };
  }

  /**
   * Calcula ShiftCleaning - limpezas por turno com série nomeada por unidade
   */
  private calculateShiftCleaning(
    results: UnitGovernanceKpiData[],
  ): ApexChartsMultiSeriesData {
    const categories = ['Manhã', 'Tarde', 'Noite'];
    const series: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      series.push({
        name: r.unitName,
        data: [r.shiftData.manha, r.shiftData.tarde, r.shiftData.noite],
      });
    }

    return { categories, series };
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

/**
 * Service para KPIs unificados de Governance - Versão Multi-Tenant
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
  UnifiedGovernanceKpiResponse,
  GovernanceBigNumbersData,
  ApexChartsMultiSeriesData,
  ShiftCleaningByDayData,
  UnitGovernanceBigNumbers,
  UnitShiftData,
  UnitShiftDataByDay,
  UnitGovernanceKpiData,
} from './governance.interfaces';
import {
  getGovernanceBigNumbersSQL,
  getShiftCleaningSQL,
  getShiftCleaningByDaySQL,
} from './sql/governance.queries';

@Injectable()
export class GovernanceMultitenantService {
  private readonly logger = new Logger(GovernanceMultitenantService.name);

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
  ): Promise<UnifiedGovernanceKpiResponse> {
    const customDates = {
      start: this.dateUtilsService.parseDate(startDate),
      end: this.dateUtilsService.parseDate(endDate),
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
      throw new Error(
        'Nenhuma unidade conectada. Verifique as variáveis de ambiente.',
      );
    }

    this.logger.log(
      `Buscando KPIs de Governance de ${connectedUnits.length} unidades...`,
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

    // Calcula total de dias do período selecionado
    const totalDaysInPeriod = this.dateUtilsService.calculateTotalDays(
      startDate,
      endDate,
    );
    const previousDays = this.dateUtilsService.calculateTotalDays(
      previousStart,
      previousEnd,
    );
    const monthlyDays = this.dateUtilsService.calculateTotalDays(
      monthStart,
      monthEnd,
    );

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
          totalDaysInPeriod,
        ),
    );

    const unitResults = await this.concurrencyUtils.executeWithLimit(
      unitDataTasks,
      2,
    );
    const validResults = unitResults.filter(
      (r) => r !== null,
    ) as UnitGovernanceKpiData[];

    if (validResults.length === 0) {
      throw new Error('Nenhuma unidade retornou dados válidos');
    }

    // Consolida os dados (passa também as unidades conectadas para garantir que todas apareçam)
    const consolidated = this.consolidateData(
      validResults,
      connectedUnits,
      totalDaysInPeriod,
      previousDays,
      monthlyDays,
      daysElapsed,
      remainingDays,
      totalDaysInMonth,
    );

    this.logger.log(
      `KPIs de Governance consolidados de ${validResults.length} unidades em ${Date.now() - startTime}ms`,
    );

    return consolidated;
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
      // Executa todas as queries em paralelo para a unidade (atual + anterior + mês atual + por dia)
      // Governance tem menos queries, então pode usar limite maior
      const queryTasks = [
        () =>
          this.databaseService.query(
            unit,
            getGovernanceBigNumbersSQL(unit, startDate, endDate),
          ),
        () =>
          this.databaseService.query(
            unit,
            getGovernanceBigNumbersSQL(unit, previousStart, previousEnd),
          ),
        () =>
          this.databaseService.query(
            unit,
            getGovernanceBigNumbersSQL(unit, monthStart, monthEnd),
          ),
        () =>
          this.databaseService.query(
            unit,
            getShiftCleaningSQL(unit, startDate, endDate),
          ),
        () =>
          this.databaseService.query(
            unit,
            getShiftCleaningByDaySQL(unit, startDate, endDate),
          ),
      ];

      const [
        bigNumbersResult,
        bigNumbersPrevResult,
        bigNumbersMonthlyResult,
        shiftCleaningResult,
        shiftCleaningByDayResult,
      ] = await this.concurrencyUtils.executeWithLimit(queryTasks, 5);

      // Processa BigNumbers atual
      const bn = bigNumbersResult.rows[0] || {};
      const bigNumbers: UnitGovernanceBigNumbers = {
        totalCleanings: parseInt(bn.total_cleanings) || 0,
        totalInspections: parseInt(bn.total_inspections) || 0,
        totalDays: totalDaysInPeriod,
      };

      // Processa BigNumbers anterior
      const bnPrev = bigNumbersPrevResult.rows[0] || {};
      const previousDays = this.dateUtilsService.calculateTotalDays(
        previousStart,
        previousEnd,
      );
      const bigNumbersPrevious: UnitGovernanceBigNumbers = {
        totalCleanings: parseInt(bnPrev.total_cleanings) || 0,
        totalInspections: parseInt(bnPrev.total_inspections) || 0,
        totalDays: previousDays,
      };

      // Processa BigNumbers do mês atual (para forecast)
      const bnMonthly = bigNumbersMonthlyResult.rows[0] || {};
      const monthlyDays = this.dateUtilsService.calculateTotalDays(
        monthStart,
        monthEnd,
      );
      const bigNumbersMonthly: UnitGovernanceBigNumbers = {
        totalCleanings: parseInt(bnMonthly.total_cleanings) || 0,
        totalInspections: parseInt(bnMonthly.total_inspections) || 0,
        totalDays: monthlyDays,
      };

      // Processa dados de turno (totais)
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

      // Processa dados de turno por dia
      const shiftDataByDayMap = new Map<string, UnitShiftDataByDay>();

      for (const row of shiftCleaningByDayResult.rows) {
        const date = row.date || '';
        const shift = (row.shift || '').toLowerCase();
        const value = parseInt(row.value) || 0;

        if (!shiftDataByDayMap.has(date)) {
          shiftDataByDayMap.set(date, {
            date,
            manha: 0,
            tarde: 0,
            noite: 0,
          });
        }

        const dayData = shiftDataByDayMap.get(date)!;
        if (shift === 'manhã') dayData.manha = value;
        else if (shift === 'tarde') dayData.tarde = value;
        else if (shift === 'noite') dayData.noite = value;
      }

      const shiftDataByDay = Array.from(shiftDataByDayMap.values()).sort(
        (a, b) => {
          const [dayA, monthA, yearA] = a.date.split('/').map(Number);
          const [dayB, monthB, yearB] = b.date.split('/').map(Number);
          const dateA = new Date(yearA, monthA - 1, dayA).getTime();
          const dateB = new Date(yearB, monthB - 1, dayB).getTime();
          return dateA - dateB;
        },
      );

      this.logger.log(
        `KPIs de Governance de ${UNIT_CONFIGS[unit].name} obtidos com sucesso`,
      );

      return {
        unit,
        unitName: UNIT_CONFIGS[unit].name,
        bigNumbers,
        bigNumbersPrevious,
        bigNumbersMonthly,
        shiftData,
        shiftDataByDay,
      };
    } catch (error) {
      this.logger.error(
        `Erro ao buscar KPIs de Governance de ${UNIT_CONFIGS[unit].name}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Consolida os dados de todas as unidades
   */
  private consolidateData(
    results: UnitGovernanceKpiData[],
    connectedUnits: UnitKey[],
    totalDaysInPeriod: number,
    previousDays: number,
    monthlyDays: number,
    daysElapsed: number,
    remainingDays: number,
    totalDaysInMonth: number,
  ): UnifiedGovernanceKpiResponse {
    // Cria um mapa dos resultados por unidade para acesso rápido
    const resultsMap = new Map<UnitKey, UnitGovernanceKpiData>();
    for (const r of results) {
      resultsMap.set(r.unit as UnitKey, r);
    }

    // Cria dados zerados para unidades que não retornaram dados
    // Primeiro coleta todas as datas únicas das unidades que tiveram sucesso
    const allDates = new Set<string>();
    for (const r of results) {
      if (r.shiftDataByDay) {
        for (const dayData of r.shiftDataByDay) {
          allDates.add(dayData.date);
        }
      }
    }

    // Ordena as datas
    const sortedDates = Array.from(allDates).sort((a, b) => {
      const [dayA, monthA, yearA] = a.split('/').map(Number);
      const [dayB, monthB, yearB] = b.split('/').map(Number);
      const dateA = new Date(yearA, monthA - 1, dayA).getTime();
      const dateB = new Date(yearB, monthB - 1, dayB).getTime();
      return dateA - dateB;
    });

    const allUnitsData: UnitGovernanceKpiData[] = connectedUnits.map(
      (unit: UnitKey) => {
        if (resultsMap.has(unit)) {
          return resultsMap.get(unit)!;
        }
        // Retorna dados zerados para unidades que falharam
        // Cria shiftDataByDay com zeros para todas as datas
        const shiftDataByDayForFailed: UnitShiftDataByDay[] = sortedDates.map(
          (date) => ({
            date,
            manha: 0,
            tarde: 0,
            noite: 0,
          }),
        );

        return {
          unit,
          unitName: UNIT_CONFIGS[unit].name,
          bigNumbers: {
            totalCleanings: 0,
            totalInspections: 0,
            totalDays: totalDaysInPeriod,
          },
          bigNumbersPrevious: {
            totalCleanings: 0,
            totalInspections: 0,
            totalDays: previousDays,
          },
          bigNumbersMonthly: {
            totalCleanings: 0,
            totalInspections: 0,
            totalDays: monthlyDays,
          },
          shiftData: {
            manha: 0,
            tarde: 0,
            noite: 0,
            terceirizado: 0,
          },
          shiftDataByDay: shiftDataByDayForFailed,
        };
      },
    );

    // Consolida BigNumbers (com previousDate e monthlyForecast)
    const bigNumbers = this.consolidateBigNumbers(
      allUnitsData,
      daysElapsed,
      remainingDays,
      totalDaysInMonth,
    );

    // CleaningsByCompany - total de limpezas por unidade
    const cleaningsByCompany = this.calculateCleaningsByCompany(allUnitsData);

    // AverageCleaningByCompany - média de limpeza por unidade
    const averageCleaningByCompany =
      this.calculateAverageCleaningByCompany(allUnitsData);

    // InspectionsByCompany - total de vistorias por unidade
    const inspectionsByCompany =
      this.calculateInspectionsByCompany(allUnitsData);

    // ShiftCleaning - limpezas por turno com série nomeada por unidade
    const shiftCleaning = this.calculateShiftCleaning(allUnitsData);

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
    const avgDailyCleaningRounded = Math.round(avgDailyCleaning);

    // --- Cálculos período anterior ---
    const avgDailyCleaningPrev =
      totalDaysPrev > 0 ? totalCleaningsPrev / totalDaysPrev : 0;
    const avgDailyCleaningPrevRounded = Math.round(avgDailyCleaningPrev);

    // --- Cálculos forecast mensal ---
    let forecastCleanings = 0;
    let forecastInspections = 0;
    let forecastAvgDailyCleaning = 0;

    if (daysElapsed > 0) {
      // Média diária baseada nos dados do mês atual
      const dailyAvgCleanings = monthlyTotalCleanings / daysElapsed;
      const dailyAvgInspections = monthlyTotalInspections / daysElapsed;

      // Projeção: valor atual do mês + (média diária * dias restantes)
      forecastCleanings = Math.round(
        monthlyTotalCleanings + dailyAvgCleanings * remainingDays,
      );
      forecastInspections = Math.round(
        monthlyTotalInspections + dailyAvgInspections * remainingDays,
      );
      forecastAvgDailyCleaning = forecastCleanings / totalDaysInMonth;
    }

    const forecastAvgDailyCleaningRounded = Math.round(
      forecastAvgDailyCleaning,
    );

    return {
      currentDate: {
        totalAllSuitesCleanings: totalCleanings,
        totalAllAverageDailyCleaning: avgDailyCleaningRounded,
        totalAllInspections: totalInspections,
      },
      previousDate: {
        totalAllSuitesCleaningsPreviousData: totalCleaningsPrev,
        totalAllAverageDailyCleaningPreviousData: avgDailyCleaningPrevRounded,
        totalAllInspectionsPreviousData: totalInspectionsPrev,
      },
      monthlyForecast: {
        totalAllSuitesCleaningsForecast: forecastCleanings,
        totalAllAverageDailyCleaningForecast: forecastAvgDailyCleaningRounded,
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
      const avg =
        r.bigNumbers.totalDays > 0
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
   * Calcula ShiftCleaning - limpezas por turno por dia, com séries agrupadas por turno
   */
  private calculateShiftCleaning(
    results: UnitGovernanceKpiData[],
  ): ShiftCleaningByDayData {
    // Coleta todas as datas únicas de todas as unidades
    const allDatesSet = new Set<string>();
    for (const r of results) {
      if (r.shiftDataByDay) {
        for (const dayData of r.shiftDataByDay) {
          allDatesSet.add(dayData.date);
        }
      }
    }

    // Ordena as datas
    const categories = Array.from(allDatesSet).sort((a, b) => {
      const [dayA, monthA, yearA] = a.split('/').map(Number);
      const [dayB, monthB, yearB] = b.split('/').map(Number);
      const dateA = new Date(yearA, monthA - 1, dayA).getTime();
      const dateB = new Date(yearB, monthB - 1, dayB).getTime();
      return dateA - dateB;
    });

    // Cria o objeto de séries agrupado por turno (Manhã, Tarde, Noite)
    const Manha: Array<{ name: string; data: number[] }> = [];
    const Tarde: Array<{ name: string; data: number[] }> = [];
    const Noite: Array<{ name: string; data: number[] }> = [];

    for (const r of results) {
      // Cria um mapa de data -> dados para esta unidade
      const dateMap = new Map<string, UnitShiftDataByDay>();
      if (r.shiftDataByDay) {
        for (const dayData of r.shiftDataByDay) {
          dateMap.set(dayData.date, dayData);
        }
      }

      // Prepara arrays para cada turno
      const manhaData: number[] = [];
      const tardeData: number[] = [];
      const noiteData: number[] = [];

      for (const date of categories) {
        const dayData = dateMap.get(date);
        if (dayData) {
          manhaData.push(dayData.manha);
          tardeData.push(dayData.tarde);
          noiteData.push(dayData.noite);
        } else {
          manhaData.push(0);
          tardeData.push(0);
          noiteData.push(0);
        }
      }

      Manha.push({ name: r.unitName, data: manhaData });
      Tarde.push({ name: r.unitName, data: tardeData });
      Noite.push({ name: r.unitName, data: noiteData });
    }

    return { categories, Manhã: Manha, Tarde, Noite };
  }
}

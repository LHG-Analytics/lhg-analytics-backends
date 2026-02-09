/**
 * Service para KPIs unificados de Company - Versão Multi-Tenant
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
  getRevparByDateSQL,
  getTrevparByDateSQL,
  getOccupancyRateByDateSQL,
  getGiroByDateSQL,
  getSaleDirectSQL,
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
  revparByDate: Map<string, number>;
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
    private readonly dateUtilsService: DateUtilsService,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly concurrencyUtils: ConcurrencyUtilsService,
  ) {}

  /**
   * Busca KPIs de todas as unidades e consolida
   * Se o usuário for de uma unidade específica, usa cache específico da unidade
   * Se for ADMIN/LHG, usa cache consolidado
   */
  async getUnifiedKpis(
    startDate: string,
    endDate: string,
    user?: any,
  ): Promise<UnifiedCompanyKpiResponse> {
    const customDates = {
      start: this.dateUtilsService.parseDate(startDate),
      end: this.dateUtilsService.parseDate(endDate),
    };

    // Determina se deve usar cache por unidade ou consolidado
    // ADMIN ou LHG = cache consolidado (todas as unidades)
    // Unidade específica = cache só daquela unidade
    let unitKey: string | undefined;
    if (user && user.unit !== 'LHG' && user.role !== 'ADMIN') {
      // Mapeia UserUnit para UnitKey (LUSH_IPIRANGA -> lush_ipiranga)
      unitKey = user.unit.toLowerCase().replace('LUSH_', 'lush_').replace(' ', '_');
    }

    this.logger.log(`Cache strategy: ${unitKey ? `unit-specific (${unitKey})` : 'consolidated (all units)'}`);

    // Usa o cache service com TTL dinâmico e opcionalmente unitKey
    const result = await this.kpiCacheService.getOrCalculate(
      'company',
      CachePeriodEnum.CUSTOM,
      () => this.fetchAndConsolidateKpis(startDate, endDate, unitKey),
      customDates,
      unitKey,
    );

    return result.data;
  }

  /**
   * Executa queries em paralelo para todas as unidades e consolida
   * Se unitKey for fornecido, busca apenas dados daquela unidade
   */
  private async fetchAndConsolidateKpis(
    startDate: string,
    endDate: string,
    unitKey?: string,
  ): Promise<UnifiedCompanyKpiResponse> {
    const startTime = Date.now();
    let connectedUnits = this.databaseService.getConnectedUnits();

    // Se unitKey especificado, filtra apenas aquela unidade
    if (unitKey) {
      connectedUnits = connectedUnits.filter(unit => unit === unitKey);
      this.logger.log(`Filtrando para unidade específica: ${unitKey} (${connectedUnits.length} unidades encontradas)`);
    }

    if (connectedUnits.length === 0) {
      throw new Error(
        unitKey
          ? `Unidade ${unitKey} não encontrada ou não configurada. Verifique as variáveis de ambiente.`
          : 'Nenhuma unidade conectada. Verifique as variáveis de ambiente.',
      );
    }

    this.logger.log(`Buscando KPIs de ${connectedUnits.length} unidades...`);

    // Calcula período anterior (mesma duração, imediatamente antes)
    const { previousStart, previousEnd } = this.dateUtilsService.calculatePreviousPeriod(
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
    } = this.dateUtilsService.calculateCurrentMonthPeriod();

    // Executa queries em paralelo para cada unidade (período atual + anterior + mês atual para forecast)
    // Limita a 2 unidades simultâneas para evitar sobrecarga do banco de dados
    const unitDataTasks = connectedUnits.map((unit) =>
      () => this.fetchUnitKpis(
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
      2, // Máx 2 unidades simultâneas (cada unidade executa ~12 queries internamente)
    );
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
      // Executa todas as queries em paralelo para a unidade (atual + anterior + mês atual + vendas diretas)
      // Limita a 5 queries simultâneas por unidade para evitar sobrecarga
      const queryTasks = [
        () => this.databaseService.query(
          unit,
          getBigNumbersSQL(unit, startDate, endDate),
        ),
        () => this.databaseService.query(
          unit,
          getBigNumbersSQL(unit, previousStart, previousEnd),
        ),
        () => this.databaseService.query(
          unit,
          getBigNumbersSQL(unit, monthStart, monthEnd),
        ),
        // Vendas diretas para cada período (igual ao individual)
        () => this.databaseService.query(
          unit,
          getSaleDirectSQL(unit, startDate, endDate),
        ),
        () => this.databaseService.query(
          unit,
          getSaleDirectSQL(unit, previousStart, previousEnd),
        ),
        () => this.databaseService.query(
          unit,
          getSaleDirectSQL(unit, monthStart, monthEnd),
        ),
        () => this.databaseService.query(
          unit,
          getRevenueByDateSQL(unit, startDate, endDate),
        ),
        () => this.databaseService.query(
          unit,
          getRentalsByDateSQL(unit, startDate, endDate),
        ),
        () => this.databaseService.query(
          unit,
          getRevparByDateSQL(unit, startDate, endDate),
        ),
        () => this.databaseService.query(
          unit,
          getTrevparByDateSQL(unit, startDate, endDate),
        ),
        () => this.databaseService.query(
          unit,
          getOccupancyRateByDateSQL(unit, startDate, endDate),
        ),
        () => this.databaseService.query(
          unit,
          getGiroByDateSQL(unit, startDate, endDate),
        ),
      ];

      const [
        bigNumbersResult,
        bigNumbersPrevResult,
        bigNumbersMonthlyResult,
        saleDirectResult,
        saleDirectPrevResult,
        saleDirectMonthlyResult,
        revenueResult,
        rentalsResult,
        revparResult,
        trevparResult,
        occupancyResult,
        giroResult,
      ] = await this.concurrencyUtils.executeWithLimit(queryTasks, 5);

      // Processa vendas diretas (igual ao individual: totalAllValue = locação + vendas diretas)
      const sd = saleDirectResult.rows[0] || {};
      let totalSaleDirect = parseFloat(sd.total_sale_direct) || 0;

      const sdPrev = saleDirectPrevResult.rows[0] || {};
      let totalSaleDirectPrev = parseFloat(sdPrev.total_sale_direct) || 0;

      const sdMonthly = saleDirectMonthlyResult.rows[0] || {};
      let totalSaleDirectMonthly = parseFloat(sdMonthly.total_sale_direct) || 0;

      // Converte valores de USD para BRL se for LIV
      if (unit === 'liv') {
        const endDateObj = this.dateUtilsService.parseDate(endDate);
        const previousEndObj = this.dateUtilsService.parseDate(previousEnd);
        const monthEndObj = this.dateUtilsService.parseDate(monthEnd);

        totalSaleDirect = await this.currencyConversionService.convertUsdToBrl(totalSaleDirect, unit, endDateObj);
        totalSaleDirectPrev = await this.currencyConversionService.convertUsdToBrl(totalSaleDirectPrev, unit, previousEndObj);
        totalSaleDirectMonthly = await this.currencyConversionService.convertUsdToBrl(totalSaleDirectMonthly, unit, monthEndObj);
      }

      // Processa BigNumbers atual (locação + vendas diretas)
      const bn = bigNumbersResult.rows[0] || {};
      let totalValue = (parseFloat(bn.total_all_value) || 0) + totalSaleDirect;
      let totalTips = parseFloat(bn.total_tips) || 0;

      // Converte valores monetários de USD para BRL se for LIV
      if (unit === 'liv') {
        const endDateObj = this.dateUtilsService.parseDate(endDate);
        totalValue = await this.currencyConversionService.convertUsdToBrl(parseFloat(bn.total_all_value) || 0, unit, endDateObj) + totalSaleDirect;
        totalTips = await this.currencyConversionService.convertUsdToBrl(totalTips, unit, endDateObj);
      }

      const bigNumbers: UnitBigNumbers = {
        totalRentals: parseInt(bn.total_rentals) || 0,
        totalValue,
        totalOccupiedTime: parseFloat(bn.total_occupied_time) || 0,
        totalTips,
      };

      // Processa BigNumbers anterior (locação + vendas diretas)
      const bnPrev = bigNumbersPrevResult.rows[0] || {};
      let totalValuePrev = (parseFloat(bnPrev.total_all_value) || 0) + totalSaleDirectPrev;
      let totalTipsPrev = parseFloat(bnPrev.total_tips) || 0;

      // Converte valores monetários de USD para BRL se for LIV
      if (unit === 'liv') {
        const previousEndObj = this.dateUtilsService.parseDate(previousEnd);
        totalValuePrev = await this.currencyConversionService.convertUsdToBrl(parseFloat(bnPrev.total_all_value) || 0, unit, previousEndObj) + totalSaleDirectPrev;
        totalTipsPrev = await this.currencyConversionService.convertUsdToBrl(totalTipsPrev, unit, previousEndObj);
      }

      const bigNumbersPrevious: UnitBigNumbers = {
        totalRentals: parseInt(bnPrev.total_rentals) || 0,
        totalValue: totalValuePrev,
        totalOccupiedTime: parseFloat(bnPrev.total_occupied_time) || 0,
        totalTips: totalTipsPrev,
      };

      // Processa BigNumbers do mês atual para forecast (locação + vendas diretas)
      const bnMonthly = bigNumbersMonthlyResult.rows[0] || {};
      let totalValueMonthly = (parseFloat(bnMonthly.total_all_value) || 0) + totalSaleDirectMonthly;
      let totalTipsMonthly = parseFloat(bnMonthly.total_tips) || 0;

      // Converte valores monetários de USD para BRL se for LIV
      if (unit === 'liv') {
        const monthEndObj = this.dateUtilsService.parseDate(monthEnd);
        totalValueMonthly = await this.currencyConversionService.convertUsdToBrl(parseFloat(bnMonthly.total_all_value) || 0, unit, monthEndObj) + totalSaleDirectMonthly;
        totalTipsMonthly = await this.currencyConversionService.convertUsdToBrl(totalTipsMonthly, unit, monthEndObj);
      }

      const bigNumbersMonthly: UnitBigNumbers = {
        totalRentals: parseInt(bnMonthly.total_rentals) || 0,
        totalValue: totalValueMonthly,
        totalOccupiedTime: parseFloat(bnMonthly.total_occupied_time) || 0,
        totalTips: totalTipsMonthly,
      };

      // Processa séries por data
      const revenueByDate = new Map<string, number>();
      for (const row of revenueResult.rows) {
        let value = parseFloat(row.daily_revenue) || 0;
        if (unit === 'liv') {
          const rowDate = new Date(row.date);
          value = await this.currencyConversionService.convertUsdToBrl(value, unit, rowDate);
        }
        revenueByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          value,
        );
      }

      const rentalsByDate = new Map<string, number>();
      for (const row of rentalsResult.rows) {
        rentalsByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          parseInt(row.total_rentals) || 0,
        );
      }

      const revparByDate = new Map<string, number>();
      for (const row of revparResult.rows) {
        let value = parseFloat(row.daily_rental_revenue) || 0;
        if (unit === 'liv') {
          const rowDate = new Date(row.date);
          value = await this.currencyConversionService.convertUsdToBrl(value, unit, rowDate);
        }
        revparByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          value,
        );
      }

      const trevparByDate = new Map<string, number>();
      for (const row of trevparResult.rows) {
        let value = parseFloat(row.total_revenue) || 0;
        if (unit === 'liv') {
          const rowDate = new Date(row.date);
          value = await this.currencyConversionService.convertUsdToBrl(value, unit, rowDate);
        }
        trevparByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          value,
        );
      }

      const occupancyRateByDate = new Map<string, number>();
      for (const row of occupancyResult.rows) {
        occupancyRateByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          parseFloat(row.total_occupied_seconds) || 0,
        );
      }

      const giroByDate = new Map<string, number>();
      for (const row of giroResult.rows) {
        giroByDate.set(
          this.dateUtilsService.formatDateKey(row.date),
          parseInt(row.total_rentals) || 0,
        );
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
        revparByDate,
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
    const start = this.dateUtilsService.parseDate(startDate);
    const end = this.dateUtilsService.parseDate(endDate);
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

    // Calcula total de suítes consolidadas para métricas de média
    const totalSuites = results.reduce(
      (sum, r) => sum + UNIT_CONFIGS[r.unit].suiteConfig.totalSuites,
      0,
    );

    // Métricas de MÉDIA (Revpar, Trevpar, Ocupação, Giro) precisam de tratamento especial
    // SOMAR componentes primeiro, depois calcular média
    const revparByDate = this.consolidateAverageMetricsByUnit(
      results,
      'revparByDate',
      allPeriods,
      groupByMonth,
      totalSuites,
    );
    const trevparByDate = this.consolidateAverageMetricsByUnit(
      results,
      'trevparByDate',
      allPeriods,
      groupByMonth,
      totalSuites,
    );
    const occupancyRateByDate = this.consolidateAverageMetricsByUnit(
      results,
      'occupancyRateByDate',
      allPeriods,
      groupByMonth,
      totalSuites,
    );
    const giroByDate = this.consolidateAverageMetricsByUnit(
      results,
      'giroByDate',
      allPeriods,
      groupByMonth,
      totalSuites,
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
      RevparByDate: revparByDate,
      TicketAverageByDate: ticketAverageByDate,
      TrevparByDate: trevparByDate,
      OccupancyRateByDate: occupancyRateByDate,
      GiroByDate: giroByDate,
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
      | 'revparByDate'
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
          ? this.dateUtilsService.formatDateToMonth(dateKey)
          : this.dateUtilsService.formatDateDisplay(dateKey);

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
   * Consolida métricas de MÉDIA por unidade (Revpar, Trevpar, Ocupação, Giro)
   * Diferente de consolidateSeriesByUnit, este método:
   * 1. SOMA os componentes de cada unidade (receita, locações, etc.)
   * 2. Calcula a média consolidada no final
   *
   * IMPORTANTE: Métricas de média NÃO podem ser somadas diretamente!
   * - Errado: soma(Revpar_unidade1 + Revpar_unidade2)
   * - Certo: soma(Receita_unidade1 + Receita_unidade2) / total_suites
   */
  private consolidateAverageMetricsByUnit(
    results: UnitKpiData[],
    field: keyof Pick<
      UnitKpiData,
      | 'revparByDate'
      | 'trevparByDate'
      | 'occupancyRateByDate'
      | 'giroByDate'
    >,
    periods: string[],
    groupByMonth: boolean,
    totalSuites: number,
  ): ApexChartsSeriesData {
    const series: NamedSeries[] = [];

    // Para cada unidade, soma os componentes BRUTOS por período
    for (const r of results) {
      const unitData: number[] = [];

      // Mapa para acumular os componentes por período
      const periodComponentMap = new Map<string, number>();

      // Soma os valores por período (agrupa se necessário)
      for (const [dateKey, value] of r[field].entries()) {
        const periodKey = groupByMonth
          ? this.dateUtilsService.formatDateToMonth(dateKey)
          : this.dateUtilsService.formatDateDisplay(dateKey);

        // IMPORTANTE: Somar os componentes BRUTOS (não a média já calculada)
        // O SQL já retorna o valor bruto (total_revenue, total_rentals, etc.)
        const current = periodComponentMap.get(periodKey) || 0;
        periodComponentMap.set(periodKey, current + value);
      }

      // Agora calcula a média para cada período
      for (const periodKey of periods) {
        const componentSum = periodComponentMap.get(periodKey) || 0;
        let averageValue = 0;

        // Cada métrica tem sua fórmula específica
        if (field === 'trevparByDate' || field === 'revparByDate') {
          // Trevpar e Revpar: soma_receita / total_suites
          averageValue = componentSum / totalSuites;
        } else if (field === 'giroByDate') {
          // Giro: soma_locacoes / total_suites
          averageValue = componentSum / totalSuites;
        } else if (field === 'occupancyRateByDate') {
          // Ocupação: mais complexa, precisa considerar tempo disponível
          // 18 horas úteis por dia = 18 * 3600 = 64800 segundos
          const availableSecondsPerDay = 18 * 3600;
          const totalAvailableSeconds = totalSuites * availableSecondsPerDay;
          averageValue = (componentSum / totalAvailableSeconds) * 100; // taxa em %
        }

        unitData.push(Number(averageValue.toFixed(2)));
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

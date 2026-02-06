/**
 * Service para KPIs unificados de Company
 * Faz chamadas paralelas para todos os backends das unidades e consolida os dados
 */

import { Injectable, Logger } from '@nestjs/common';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { CachePeriodEnum } from '../cache/cache.interfaces';
import {
  UnifiedCompanyKpiResponse,
  UnitKpiResponse,
  BigNumbersDataSQL,
  ApexChartsData,
  ApexChartsSeriesData,
  NamedSeries,
  UnitConfig,
} from './company.interfaces';

// Configuração das unidades
const UNITS: UnitConfig[] = [
  {
    url: process.env.LUSH_IPIRANGA_URL || 'http://localhost:3001',
    prefix: '/ipiranga/api',
    name: 'Lush Ipiranga',
    key: 'lush_ipiranga',
  },
  {
    url: process.env.LUSH_LAPA_URL || 'http://localhost:3002',
    prefix: '/lapa/api',
    name: 'Lush Lapa',
    key: 'lush_lapa',
  },
  {
    url: process.env.TOUT_URL || 'http://localhost:3003',
    prefix: '/tout/api',
    name: 'Tout',
    key: 'tout',
  },
  {
    url: process.env.ANDAR_DE_CIMA_URL || 'http://localhost:3004',
    prefix: '/andar_de_cima/api',
    name: 'Andar de Cima',
    key: 'andar_de_cima',
  },
  {
    url: process.env.LIV_URL || 'http://localhost:3006',
    prefix: '/liv/api',
    name: 'Liv',
    key: 'liv',
  },
];

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(private readonly kpiCacheService: KpiCacheService) {}

  /**
   * Busca KPIs de todas as unidades e consolida
   */
  async getUnifiedKpis(
    startDate: string,
    endDate: string,
    token: string,
  ): Promise<UnifiedCompanyKpiResponse> {
    const customDates = {
      start: this.parseDate(startDate),
      end: this.parseDate(endDate),
    };

    // Usa o cache service com TTL dinâmico
    const result = await this.kpiCacheService.getOrCalculate(
      'company',
      CachePeriodEnum.CUSTOM,
      () => this.fetchAndConsolidateKpis(startDate, endDate, token),
      customDates,
    );

    return result.data;
  }

  /**
   * Faz as chamadas HTTP paralelas e consolida os dados
   */
  private async fetchAndConsolidateKpis(
    startDate: string,
    endDate: string,
    token: string,
  ): Promise<UnifiedCompanyKpiResponse> {
    const startTime = Date.now();

    // Faz chamadas paralelas para todas as unidades
    const unitPromises = UNITS.map(async (config) => {
      try {
        const response = await this.fetchUnitKpis(
          config,
          startDate,
          endDate,
          token,
        );
        this.logger.log(`KPIs de ${config.name} obtidos com sucesso`);
        return { config, data: response, success: true };
      } catch (error) {
        this.logger.error(
          `Erro ao buscar KPIs de ${config.name}: ${error.message}`,
        );
        return { config, data: null, success: false };
      }
    });

    const results = await Promise.all(unitPromises);

    // Filtra resultados válidos
    const validResults = results.filter(
      (r): r is { config: UnitConfig; data: UnitKpiResponse; success: boolean } =>
        r.success && r.data !== null,
    );

    if (validResults.length === 0) {
      throw new Error('Nenhuma unidade respondeu com dados válidos');
    }

    // Consolida os dados
    const consolidated = this.consolidateData(validResults);

    this.logger.log(`KPIs consolidados em ${Date.now() - startTime}ms`);

    return consolidated;
  }

  /**
   * Faz a chamada HTTP para uma unidade específica
   */
  private async fetchUnitKpis(
    config: UnitConfig,
    startDate: string,
    endDate: string,
    token: string,
  ): Promise<UnitKpiResponse> {
    const url = `${config.url}${config.prefix}/Company/kpis/date-range?startDate=${startDate}&endDate=${endDate}`;

    this.logger.debug(`Fetching KPIs from ${config.name}: ${url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Cookie: `access_token=${token}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText} - ${errorText}`,
        );
      }

      return response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Timeout ao conectar em ${config.name}`);
      }
      // Melhora mensagem de erro de conexão
      if (error.cause?.code === 'ECONNREFUSED') {
        throw new Error(
          `Conexão recusada - ${config.name} não está rodando em ${config.url}`,
        );
      }
      throw error;
    }
  }

  /**
   * Consolida os dados de todas as unidades
   */
  private consolidateData(
    results: Array<{
      config: UnitConfig;
      data: UnitKpiResponse;
      success: boolean;
    }>,
  ): UnifiedCompanyKpiResponse {
    // Extrai categories (datas) do primeiro resultado válido
    const categories = results[0].data.RevenueByDate?.categories || [];

    // Consolida BigNumbers
    const bigNumbers = this.consolidateBigNumbers(results);

    // RevenueByCompany - faturamento total de cada unidade
    const revenueByCompany = this.calculateRevenueByCompany(results);

    // Consolida séries por unidade
    const revenueByDate = this.consolidateSeriesByUnit(
      results,
      'RevenueByDate',
      categories,
    );
    const rentalsByDate = this.consolidateSeriesByUnit(
      results,
      'RentalsByDate',
      categories,
    );
    const revparByDate = this.consolidateSeriesByUnit(
      results,
      'RevparByDate',
      categories,
    );
    const trevparByDate = this.consolidateSeriesByUnit(
      results,
      'TrevparByDate',
      categories,
    );
    const occupancyRateByDate = this.consolidateSeriesByUnit(
      results,
      'OccupancyRateByDate',
      categories,
    );
    const giroByDate = this.consolidateSeriesByUnit(
      results,
      'GiroByDate',
      categories,
    );

    // Ticket médio por unidade = faturamento / locações (por unidade)
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
   * Consolida BigNumbers de todas as unidades
   */
  private consolidateBigNumbers(
    results: Array<{
      config: UnitConfig;
      data: UnitKpiResponse;
      success: boolean;
    }>,
  ): BigNumbersDataSQL {
    const validBigNumbers = results
      .map((r) => r.data.BigNumbers?.[0])
      .filter((b) => b !== null && b !== undefined);

    const unitCount = validBigNumbers.length || 1;

    // Soma/média dos valores atuais
    let totalValue = 0;
    let totalRentals = 0;
    let totalTrevpar = 0;
    let totalGiro = 0;
    let totalTmoSeconds = 0;

    // Soma/média dos valores anteriores
    let totalValuePrev = 0;
    let totalRentalsPrev = 0;
    let totalTrevparPrev = 0;
    let totalGiroPrev = 0;
    let totalTmoSecondsPrev = 0;
    let hasPreviousData = false;

    // Soma/média dos valores forecast
    let totalValueForecast = 0;
    let totalRentalsForecast = 0;
    let totalTrevparForecast = 0;
    let totalGiroForecast = 0;
    let totalTmoSecondsForecast = 0;
    let hasForecastData = false;

    validBigNumbers.forEach((bn) => {
      // Dados atuais
      totalValue += bn.currentDate?.totalAllValue || 0;
      totalRentals += bn.currentDate?.totalAllRentalsApartments || 0;
      totalTrevpar += bn.currentDate?.totalAllTrevpar || 0;
      totalGiro += bn.currentDate?.totalAllGiro || 0;
      totalTmoSeconds += this.timeToSeconds(
        bn.currentDate?.totalAverageOccupationTime,
      );

      // Dados anteriores
      if (bn.previousDate) {
        hasPreviousData = true;
        totalValuePrev += bn.previousDate.totalAllValuePreviousData || 0;
        totalRentalsPrev +=
          bn.previousDate.totalAllRentalsApartmentsPreviousData || 0;
        totalTrevparPrev += bn.previousDate.totalAllTrevparPreviousData || 0;
        totalGiroPrev += bn.previousDate.totalAllGiroPreviousData || 0;
        totalTmoSecondsPrev += this.timeToSeconds(
          bn.previousDate.totalAverageOccupationTimePreviousData,
        );
      }

      // Dados forecast
      if (bn.monthlyForecast) {
        hasForecastData = true;
        totalValueForecast += bn.monthlyForecast.totalAllValueForecast || 0;
        totalRentalsForecast +=
          bn.monthlyForecast.totalAllRentalsApartmentsForecast || 0;
        totalTrevparForecast += bn.monthlyForecast.totalAllTrevparForecast || 0;
        totalGiroForecast += bn.monthlyForecast.totalAllGiroForecast || 0;
        totalTmoSecondsForecast += this.timeToSeconds(
          bn.monthlyForecast.totalAverageOccupationTimeForecast,
        );
      }
    });

    // Calcula médias e ticket médio
    const avgTicket = totalRentals > 0 ? totalValue / totalRentals : 0;
    const avgTrevpar = totalTrevpar / unitCount;
    const avgGiro = totalGiro / unitCount;
    const avgTmoSeconds = totalTmoSeconds / unitCount;

    const result: BigNumbersDataSQL = {
      currentDate: {
        totalAllValue: Number(totalValue.toFixed(2)),
        totalAllRentalsApartments: totalRentals,
        totalAllTicketAverage: Number(avgTicket.toFixed(2)),
        totalAllTrevpar: Number(avgTrevpar.toFixed(2)),
        totalAllGiro: Number(avgGiro.toFixed(2)),
        totalAverageOccupationTime: this.secondsToTime(avgTmoSeconds),
      },
    };

    if (hasPreviousData) {
      const avgTicketPrev =
        totalRentalsPrev > 0 ? totalValuePrev / totalRentalsPrev : 0;
      result.previousDate = {
        totalAllValuePreviousData: Number(totalValuePrev.toFixed(2)),
        totalAllRentalsApartmentsPreviousData: totalRentalsPrev,
        totalAllTicketAveragePreviousData: Number(avgTicketPrev.toFixed(2)),
        totalAllTrevparPreviousData: Number(
          (totalTrevparPrev / unitCount).toFixed(2),
        ),
        totalAllGiroPreviousData: Number(
          (totalGiroPrev / unitCount).toFixed(2),
        ),
        totalAverageOccupationTimePreviousData: this.secondsToTime(
          totalTmoSecondsPrev / unitCount,
        ),
      };
    }

    if (hasForecastData) {
      const avgTicketForecast =
        totalRentalsForecast > 0
          ? totalValueForecast / totalRentalsForecast
          : 0;
      result.monthlyForecast = {
        totalAllValueForecast: Number(totalValueForecast.toFixed(2)),
        totalAllRentalsApartmentsForecast: totalRentalsForecast,
        totalAllTicketAverageForecast: Number(avgTicketForecast.toFixed(2)),
        totalAllTrevparForecast: Number(
          (totalTrevparForecast / unitCount).toFixed(2),
        ),
        totalAllGiroForecast: Number(
          (totalGiroForecast / unitCount).toFixed(2),
        ),
        totalAverageOccupationTimeForecast: this.secondsToTime(
          totalTmoSecondsForecast / unitCount,
        ),
      };
    }

    return result;
  }

  /**
   * Calcula RevenueByCompany - faturamento total de cada unidade
   */
  private calculateRevenueByCompany(
    results: Array<{
      config: UnitConfig;
      data: UnitKpiResponse;
      success: boolean;
    }>,
  ): ApexChartsData {
    const categories: string[] = [];
    const series: number[] = [];

    results.forEach((r) => {
      categories.push(r.config.name);
      const totalRevenue =
        r.data.BigNumbers?.[0]?.currentDate?.totalAllValue || 0;
      series.push(Number(totalRevenue.toFixed(2)));
    });

    return { categories, series };
  }

  /**
   * Consolida séries de dados retornando uma série nomeada para cada unidade
   */
  private consolidateSeriesByUnit(
    results: Array<{
      config: UnitConfig;
      data: UnitKpiResponse;
      success: boolean;
    }>,
    field: string,
    categories: string[],
  ): ApexChartsSeriesData {
    const series: NamedSeries[] = [];

    results.forEach((r) => {
      const data = r.data[field];
      const unitData: number[] = new Array(categories.length).fill(0);

      if (data?.series && Array.isArray(data.series)) {
        data.series.forEach((value: number, index: number) => {
          if (index < categories.length) {
            unitData[index] = Number((value || 0).toFixed(2));
          }
        });
      }

      series.push({
        name: r.config.name,
        data: unitData,
      });
    });

    return { categories, series };
  }

  /**
   * Calcula ticket médio por unidade = faturamento / locações (para cada unidade)
   */
  private calculateTicketAverageByUnit(
    revenue: ApexChartsSeriesData,
    rentals: ApexChartsSeriesData,
  ): ApexChartsSeriesData {
    const series: NamedSeries[] = [];

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
   * Converte string de tempo (HH:MM:SS) para segundos
   */
  private timeToSeconds(time: string): number {
    if (!time) return 0;
    const parts = time.split(':');
    if (parts.length !== 3) return 0;
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    return hours * 3600 + minutes * 60 + seconds;
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

  /**
   * Converte string de data DD/MM/YYYY para Date
   */
  private parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
}

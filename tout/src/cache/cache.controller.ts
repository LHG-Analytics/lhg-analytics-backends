/**
 * Controller para gerenciamento de cache
 * Endpoint /warmup usado pelo GitHub Actions para popular cache às 6h
 * Usa ModuleRef para lazy loading e evitar dependência circular
 */

import { Controller, Post, HttpCode, HttpStatus, Logger, Header } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ModuleRef } from '@nestjs/core';
import * as moment from 'moment-timezone';
import { KpiCacheService, CachePeriodEnum } from './';
import { CompanyService } from '../company/company.service';
import { BookingsService } from '../bookings/bookings.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { GovernanceService } from '../governance/governance.service';

interface WarmupResult {
  timestamp: string;
  success: boolean;
  results: {
    service: string;
    period: string;
    dateRange: string;
    fromCache: boolean;
    calculationTime?: number;
    error?: string;
  }[];
  summary: {
    total: number;
    fromCache: number;
    calculated: number;
    errors: number;
    totalTimeMs: number;
  };
}

@ApiTags('Cache')
@Controller('cache')
export class CacheController {
  private readonly logger = new Logger(CacheController.name);

  constructor(
    private readonly cacheService: KpiCacheService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Obtém um serviço de forma lazy usando ModuleRef
   * Evita problemas de dependência circular
   */
  private getService<T>(token: any): T | undefined {
    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      return undefined;
    }
  }

  /**
   * Endpoint para cache warmup - chamado pelo GitHub Actions às 6h
   * Calcula e armazena em cache os KPIs dos períodos principais
   *
   * Períodos calculados (até ONTEM):
   * - Últimos 7 dias
   * - Último mês cheio
   * - Este mês (até ontem)
   * - Acumulado do ano (até ontem)
   */
  @Post('warmup')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Content-Type', 'application/json')
  @ApiOperation({
    summary: 'Cache Warmup',
    description: 'Popula o cache com KPIs dos períodos principais. Chamado pelo GitHub Actions às 6h.',
  })
  @ApiResponse({ status: 200, description: 'Cache warmup concluído' })
  async warmup(): Promise<WarmupResult> {
    const startTime = Date.now();
    this.logger.log('Iniciando cache warmup...');

    const yesterday = moment().subtract(1, 'day');
    const results: WarmupResult['results'] = [];

    // Períodos a serem calculados (até ontem)
    const periods = [
      {
        name: 'LAST_7_D',
        period: CachePeriodEnum.LAST_7_D,
        start: moment(yesterday).startOf('day').subtract(6, 'days').toDate(),
        end: moment(yesterday).endOf('day').toDate(),
      },
      {
        name: 'LAST_MONTH',
        period: CachePeriodEnum.LAST_MONTH,
        start: moment(yesterday).subtract(1, 'month').startOf('month').toDate(),
        end: moment(yesterday).subtract(1, 'month').endOf('month').toDate(),
      },
      {
        name: 'THIS_MONTH',
        period: CachePeriodEnum.CUSTOM, // Usa CUSTOM para este mês
        start: moment().startOf('month').toDate(),
        end: moment(yesterday).endOf('day').toDate(),
      },
      {
        name: 'YEAR_TO_DATE',
        period: CachePeriodEnum.YEAR_TO_DATE,
        start: moment().startOf('year').toDate(),
        end: moment(yesterday).endOf('day').toDate(),
      },
    ];

    // Configuração dos serviços para warmup
    const servicesConfig = [
      { name: 'company', serviceName: 'company' as const, token: CompanyService, method: 'calculateKpisByDateRangeSQL' },
      { name: 'bookings', serviceName: 'bookings' as const, token: BookingsService, method: 'calculateKpibyDateRangeSQL' },
      { name: 'restaurant', serviceName: 'restaurant' as const, token: RestaurantService, method: 'calculateKpisByDateRange' },
      { name: 'governance', serviceName: 'governance' as const, token: GovernanceService, method: 'calculateKpibyDateRangeSQL' },
    ];

    // Executa warmup para cada combinação de serviço x período
    for (const svcConfig of servicesConfig) {
      const service = this.getService(svcConfig.token);
      if (!service) {
        this.logger.warn(`Serviço ${svcConfig.name} não encontrado, pulando...`);
        continue;
      }

      for (const period of periods) {
        const resultKey = `${svcConfig.name}:${period.name}`;
        try {
          // Usa getOrCalculate para forçar o cálculo e salvar em cache
          const result = await this.cacheService.getOrCalculate(
            svcConfig.serviceName,
            period.period,
            () => (service as any)[svcConfig.method](period.start, period.end),
            period.period === CachePeriodEnum.CUSTOM ? { start: period.start, end: period.end } : undefined,
          );

          results.push({
            service: svcConfig.name,
            period: period.name,
            dateRange: `${moment(period.start).format('DD/MM/YYYY')} - ${moment(period.end).format('DD/MM/YYYY')}`,
            fromCache: result.fromCache,
            calculationTime: result.calculationTime,
          });

          this.logger.log(
            `${resultKey}: ${result.fromCache ? 'CACHE HIT' : `CALCULATED (${result.calculationTime}ms)`}`,
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`${resultKey}: ERROR - ${errorMsg}`);
          results.push({
            service: svcConfig.name,
            period: period.name,
            dateRange: `${moment(period.start).format('DD/MM/YYYY')} - ${moment(period.end).format('DD/MM/YYYY')}`,
            fromCache: false,
            error: errorMsg,
          });
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const fromCache = results.filter((r) => r.fromCache && !r.error).length;
    const calculated = results.filter((r) => !r.fromCache && !r.error).length;
    const errors = results.filter((r) => r.error).length;

    const summary: WarmupResult['summary'] = {
      total: results.length,
      fromCache,
      calculated,
      errors,
      totalTimeMs: totalTime,
    };

    this.logger.log(
      `Cache warmup concluído: ${calculated} calculados, ${fromCache} do cache, ${errors} erros (${totalTime}ms)`,
    );

    return {
      timestamp: new Date().toISOString(),
      success: errors === 0,
      results,
      summary,
    };
  }
}

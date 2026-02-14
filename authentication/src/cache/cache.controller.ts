/**
 * Controller para gerenciamento de cache
 * Endpoint /warmup usado pelo GitHub Actions para popular cache às 6h
 * Usa ModuleRef para lazy loading e evitar dependência circular
 */

import { Controller, Post, HttpCode, HttpStatus, Logger, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ModuleRef } from '@nestjs/core';
import * as moment from 'moment-timezone';
import { KpiCacheService } from './kpi-cache.service';
import { CachePeriodEnum } from './cache.interfaces';
import { CompanyMultitenantService } from '../company/company-multitenant.service';
import { BookingsMultitenantService } from '../bookings/bookings-multitenant.service';
import { RestaurantMultitenantService } from '../restaurant/restaurant-multitenant.service';
import { GovernanceMultitenantService } from '../governance/governance-multitenant.service';
import { UnitKey } from '../database/database.interfaces';

interface WarmupResult {
  timestamp: string;
  success: boolean;
  results: {
    service: string;
    period: string;
    unit: string;
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
    this.logger.log('Iniciando cache warmup (Authentication)...');

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
      { name: 'company', serviceName: 'company' as const, token: CompanyMultitenantService, method: 'getUnifiedKpis' },
      { name: 'bookings', serviceName: 'bookings' as const, token: BookingsMultitenantService, method: 'getUnifiedKpis' },
      { name: 'restaurant', serviceName: 'restaurant' as const, token: RestaurantMultitenantService, method: 'getUnifiedKpis' },
      { name: 'governance', serviceName: 'governance' as const, token: GovernanceMultitenantService, method: 'getUnifiedKpis' },
    ];

    // Unidades para popular cache específico (além do consolidado)
    const unitKeys: UnitKey[] = ['lush_ipiranga', 'lush_lapa', 'tout', 'andar_de_cima', 'liv'];

    // Executa warmup para cada combinação de serviço x período x unidade
    for (const svcConfig of servicesConfig) {
      const service = this.getService(svcConfig.token);
      if (!service) {
        this.logger.warn(`Serviço ${svcConfig.name} não encontrado, pulando...`);
        continue;
      }

      for (const period of periods) {
        // Primeiro: cache consolidado (para ADMIN/LHG)
        try {
          const resultKey = `${svcConfig.name}:${period.name}:consolidated`;
          const result = await this.cacheService.getOrCalculate(
            svcConfig.serviceName,
            period.period,
            () => (service as any)[svcConfig.method](
              moment(period.start).format('DD/MM/YYYY'),
              moment(period.end).format('DD/MM/YYYY'),
            ),
            period.period === CachePeriodEnum.CUSTOM ? { start: period.start, end: period.end } : undefined,
            undefined, // Sem unitKey = cache consolidado
          );

          results.push({
            service: svcConfig.name,
            period: period.name,
            unit: 'consolidated',
            dateRange: `${moment(period.start).format('DD/MM/YYYY')} - ${moment(period.end).format('DD/MM/YYYY')}`,
            fromCache: result.fromCache,
            calculationTime: result.calculationTime,
          });

          this.logger.log(
            `${resultKey}: ${result.fromCache ? 'CACHE HIT' : `CALCULATED (${result.calculationTime}ms)`}`,
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`${svcConfig.name}:${period.name}:consolidated - ERROR - ${errorMsg}`);
          results.push({
            service: svcConfig.name,
            period: period.name,
            unit: 'consolidated',
            dateRange: `${moment(period.start).format('DD/MM/YYYY')} - ${moment(period.end).format('DD/MM/YYYY')}`,
            fromCache: false,
            error: errorMsg,
          });
        }

        // Segundo: cache específico de cada unidade (para gerentes)
        for (const unitKey of unitKeys) {
          try {
            const resultKey = `${svcConfig.name}:${period.name}:${unitKey}`;
            const result = await this.cacheService.getOrCalculate(
              svcConfig.serviceName,
              period.period,
              () => (service as any)[svcConfig.method](
                moment(period.start).format('DD/MM/YYYY'),
                moment(period.end).format('DD/MM/YYYY'),
              ),
              period.period === CachePeriodEnum.CUSTOM ? { start: period.start, end: period.end } : undefined,
              unitKey, // Cache específico da unidade
            );

            results.push({
              service: svcConfig.name,
              period: period.name,
              unit: unitKey,
              dateRange: `${moment(period.start).format('DD/MM/YYYY')} - ${moment(period.end).format('DD/MM/YYYY')}`,
              fromCache: result.fromCache,
              calculationTime: result.calculationTime,
            });

            this.logger.log(
              `${resultKey}: ${result.fromCache ? 'CACHE HIT' : `CALCULATED (${result.calculationTime}ms)`}`,
            );
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`${svcConfig.name}:${period.name}:${unitKey} - ERROR - ${errorMsg}`);
            results.push({
              service: svcConfig.name,
              period: period.name,
              unit: unitKey,
              dateRange: `${moment(period.start).format('DD/MM/YYYY')} - ${moment(period.end).format('DD/MM/YYYY')}`,
              fromCache: false,
              error: errorMsg,
            });
          }
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

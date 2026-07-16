/**
 * Warmup/status do cache multi-tenant.
 * UM único warmup aquece TODAS as unidades (loop no tenant registry) —
 * substitui os 6 warmups individuais dos backends por unidade.
 * Endpoints públicos, como nos backends atuais (chamados pelo GitHub Actions).
 */
import { Controller, Get, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModuleRef } from '@nestjs/core';
import * as moment from 'moment-timezone';
import { Public } from '../auth/public.decorator';
import { allTenants } from '../tenant/tenant.registry';
import { TenantConfig } from '../tenant/tenant.interfaces';
import { CachePeriodEnum, ServiceType } from './cache.interfaces';
import { KpiCacheService } from './kpi-cache.service';
import { RestaurantService } from '../restaurant/restaurant.service';
import { GovernanceService } from '../governance/governance.service';
import { BookingsService } from '../bookings/bookings.service';
import { CompanyService } from '../company/company.service';

// TTL longo (>= maior intervalo entre warmups; cron 3,9,15,18 UTC → gap máx 9h)
const WARMUP_TTL_SECONDS = 12 * 60 * 60;
// Concorrência global do warmup (cada unidade tem pool próprio de 5 conexões;
// 3 tarefas simultâneas no total mantém a carga baixa em todos os bancos)
const WARMUP_CONCURRENCY = 3;

interface WarmupTask {
  tenant: TenantConfig;
  service: ServiceType;
  periodName: string;
  period: CachePeriodEnum;
  start: Date;
  end: Date;
}

@ApiTags('Cache')
@Controller('api/cache')
export class CacheController {
  private readonly logger = new Logger(CacheController.name);

  constructor(
    private readonly cacheService: KpiCacheService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Post('warmup')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Aquece o cache de TODAS as unidades (fire-and-forget)' })
  async warmup(): Promise<{ started: boolean; timestamp: string; units: string[] }> {
    const timestamp = new Date().toISOString();
    this.logger.log(`Warmup multi-tenant recebido em ${timestamp}`);

    this.runWarmupInternal()
      .then(() => this.logger.log('Warmup multi-tenant concluído em background.'))
      .catch((error) => this.logger.error('Erro no warmup em background:', error));

    return { started: true, timestamp, units: allTenants().map((t) => t.slug) };
  }

  @Get('status')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Status detalhado do cache (todas as unidades)' })
  getCacheStatus() {
    return this.cacheService.getDetailedStatus();
  }

  private buildPeriods(): { name: string; period: CachePeriodEnum; start: Date; end: Date }[] {
    const yesterday = moment().subtract(1, 'day');
    return [
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
        period: CachePeriodEnum.CUSTOM,
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
  }

  private async runWarmupInternal(): Promise<void> {
    const startTime = Date.now();
    const periods = this.buildPeriods();

    // Todos os 4 domínios portados
    const services: { name: ServiceType; run: (t: TenantConfig, s: Date, e: Date) => Promise<any> }[] = [
      {
        name: 'company',
        run: (t, s, e) =>
          this.moduleRef.get(CompanyService, { strict: false }).calculateKpisByDateRangeSQL(t, s, e),
      },
      {
        name: 'bookings',
        run: (t, s, e) =>
          this.moduleRef.get(BookingsService, { strict: false }).calculateKpibyDateRangeSQL(t, s, e),
      },
      {
        name: 'restaurant',
        run: (t, s, e) =>
          this.moduleRef
            .get(RestaurantService, { strict: false })
            .calculateKpisByDateRange(t, s, e),
      },
      {
        name: 'governance',
        run: (t, s, e) =>
          this.moduleRef
            .get(GovernanceService, { strict: false })
            .calculateKpibyDateRangeSQL(t, s, e),
      },
    ];

    const tasks: (() => Promise<void>)[] = [];
    let calculated = 0;
    let errors = 0;

    for (const tenant of allTenants()) {
      for (const svc of services) {
        for (const p of periods) {
          tasks.push(async () => {
            const key = `${tenant.slug}:${svc.name}:${p.name}`;
            try {
              const calcStart = Date.now();
              const data = await svc.run(tenant, p.start, p.end);
              await this.cacheService.set(
                tenant.slug,
                svc.name,
                p.period,
                data,
                p.period === CachePeriodEnum.CUSTOM ? { start: p.start, end: p.end } : undefined,
                WARMUP_TTL_SECONDS,
              );
              calculated++;
              this.logger.log(`${key}: CALCULATED (${Date.now() - calcStart}ms)`);
            } catch (error) {
              errors++;
              this.logger.error(
                `${key}: ERROR - ${error instanceof Error ? error.message : error}`,
              );
            }
          });
        }
      }
    }

    // Worker pool simples com concorrência limitada
    let idx = 0;
    const workers = Array.from({ length: Math.min(WARMUP_CONCURRENCY, tasks.length) }, async () => {
      while (idx < tasks.length) {
        const current = idx++;
        await tasks[current]();
      }
    });
    await Promise.all(workers);

    this.logger.log(
      `Warmup multi-tenant: ${calculated} calculados, ${errors} erros (${Date.now() - startTime}ms)`,
    );
  }
}

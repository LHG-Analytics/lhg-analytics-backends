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
import { CompanyMultitenantService } from '../consolidated/company/company-multitenant.service';
import { BookingsMultitenantService } from '../consolidated/bookings/bookings-multitenant.service';
import { RestaurantMultitenantService } from '../consolidated/restaurant/restaurant-multitenant.service';
import { GovernanceMultitenantService } from '../consolidated/governance/governance-multitenant.service';

// TTL longo (>= maior intervalo entre warmups; cron 3,9,15,18 UTC → gap máx 9h)
const WARMUP_TTL_SECONDS = 12 * 60 * 60;
// Paralelismo POR UNIDADE: cada unidade tem um worker sequencial próprio
// (1 query de warmup por vez em cada banco AUTOMO — carga gentil por banco),
// e as unidades rodam em paralelo entre si (pools independentes). Escala
// sozinho com o registry; teto de segurança para não saturar o processo.
const MAX_PARALLEL_WORKERS = 16;

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

    let calculated = 0;
    let errors = 0;

    // Um worker sequencial POR UNIDADE (paralelismo entre unidades, carga
    // de 1 query de warmup por vez em cada banco AUTOMO)
    const unitWorkers = allTenants().map((tenant) => async () => {
      for (const svc of services) {
        for (const p of periods) {
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
            this.logger.error(`${key}: ERROR - ${error instanceof Error ? error.message : error}`);
          }
        }
      }
    });

    // Worker do CONSOLIDATED (sequencial nas suas células — cada getUnifiedKpis
    // já faz fan-out paralelo interno para todas as unidades)
    const fmt = (d: Date) => moment(d).format('DD/MM/YYYY');
    const consolidatedServices: { name: string; run: (s: string, e: string) => Promise<any> }[] = [
      {
        name: 'company',
        run: (s, e) =>
          this.moduleRef.get(CompanyMultitenantService, { strict: false }).getUnifiedKpis(s, e),
      },
      {
        name: 'bookings',
        run: (s, e) =>
          this.moduleRef.get(BookingsMultitenantService, { strict: false }).getUnifiedKpis(s, e),
      },
      {
        name: 'restaurant',
        run: (s, e) =>
          this.moduleRef.get(RestaurantMultitenantService, { strict: false }).getUnifiedKpis(s, e),
      },
      {
        name: 'governance',
        run: (s, e) =>
          this.moduleRef.get(GovernanceMultitenantService, { strict: false }).getUnifiedKpis(s, e),
      },
    ];
    const consolidatedWorker = async () => {
      for (const svc of consolidatedServices) {
        for (const p of periods) {
          const key = `consolidated:${svc.name}:${p.name}`;
          try {
            const calcStart = Date.now();
            // getUnifiedKpis cacheia internamente nas MESMAS chaves que a API consulta
            await svc.run(fmt(p.start), fmt(p.end));
            calculated++;
            this.logger.log(`${key}: CALCULATED (${Date.now() - calcStart}ms)`);
          } catch (error) {
            errors++;
            this.logger.error(`${key}: ERROR - ${error instanceof Error ? error.message : error}`);
          }
        }
      }
    };

    // Executa todos os workers em paralelo (com teto de segurança)
    const workers = [...unitWorkers, consolidatedWorker];
    let idx = 0;
    const runners = Array.from({ length: Math.min(MAX_PARALLEL_WORKERS, workers.length) }, async () => {
      while (idx < workers.length) {
        const current = idx++;
        await workers[current]();
      }
    });
    await Promise.all(runners);

    this.logger.log(
      `Warmup multi-tenant: ${calculated} calculados, ${errors} erros (${Date.now() - startTime}ms)`,
    );
  }
}

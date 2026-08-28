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
  async getCacheStatus() {
    return this.cacheService.getDetailedStatus();
  }

  private buildPeriods(): { name: string; period: CachePeriodEnum; start: Date; end: Date }[] {
    // IMPORTANTE: o frontend consulta SEMPRE por datas explícitas (período CUSTOM)
    // terminando HOJE — ex.: mês atual = 01/mês..hoje; últimos 7 = hoje-7..hoje.
    // Por isso todos os períodos aqui são CUSTOM e terminam HOJE: a chave gerada
    // (kpi:{unit}:{svc}:custom:{start}:{end}) fica IDÊNTICA à que o front pede, e
    // o primeiro clique já vem do cache (antes o warmup terminava ONTEM → miss
    // garantido → query ao vivo → timeout no front). O dado reflete o último
    // warmup (0/6/12/15h BRT); atualiza a cada 6h.
    const now = moment();
    const endToday = moment(now).endOf('day').toDate();
    return [
      {
        name: 'LAST_7_D',
        period: CachePeriodEnum.CUSTOM,
        start: moment(now).startOf('day').subtract(7, 'days').toDate(),
        end: endToday,
      },
      {
        name: 'LAST_MONTH',
        period: CachePeriodEnum.CUSTOM,
        start: moment(now).subtract(1, 'month').startOf('month').toDate(),
        end: moment(now).subtract(1, 'month').endOf('month').toDate(),
      },
      {
        name: 'THIS_MONTH',
        period: CachePeriodEnum.CUSTOM,
        start: moment(now).startOf('month').toDate(),
        end: endToday,
      },
      {
        name: 'YEAR_TO_DATE',
        period: CachePeriodEnum.CUSTOM,
        start: moment(now).startOf('year').toDate(),
        end: endToday,
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
            const data = await this.withRetry(
              () => svc.run(tenant, p.start, p.end),
              key,
            );
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
            await this.withRetry(() => svc.run(fmt(p.start), fmt(p.end)), key);
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

  /**
   * Executa `fn` com retry — tolerância p/ unidades de banco lento/instável
   * (ex.: LIV, PQ Oeste) que às vezes falham na 1ª tentativa e passam na 2ª.
   * Só afeta o WARMUP (background); não muda o caminho da API. Backoff 2s → 5s.
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    delaysMs: number[] = [2000, 5000],
  ): Promise<T> {
    const maxAttempts = delaysMs.length + 1;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          const wait = delaysMs[attempt - 1];
          this.logger.warn(
            `${label}: tentativa ${attempt}/${maxAttempts} falhou (${
              err instanceof Error ? err.message : err
            }) — novo retry em ${wait}ms`,
          );
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
    throw lastErr;
  }
}

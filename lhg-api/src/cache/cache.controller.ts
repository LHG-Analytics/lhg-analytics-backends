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
import { DateUtilsService } from '@lhg/utils';
import { Public } from '../auth/public.decorator';
import { datasDoServico } from '../common/datas-do-servico';
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
    private readonly dateUtils: DateUtilsService,
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

  /**
   * Invalida TODO o cache do ambiente e reaquece em background.
   *
   * Necessário porque o cache agora vive no Redis e SOBREVIVE a deploys: depois de
   * corrigir um cálculo de KPI, as chaves antigas continuam servindo o número
   * ERRADO até o TTL vencer (até 12h). O warmup sozinho não resolve — ele só
   * reescreve os 4 períodos preset, deixando intactas as faixas customizadas.
   *
   * Só apaga o namespace do próprio ambiente (prod não derruba o cache de dev).
   */
  @Post('clear')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Limpa TODO o cache do ambiente e reaquece em background' })
  async clearCache(): Promise<{
    cleared: number;
    namespace: string;
    rewarming: boolean;
    timestamp: string;
  }> {
    const before = await this.cacheService.getDetailedStatus();
    // Usa a contagem REAL devolvida pelo clearAll (e não o total do status): se o
    // UNLINK falhar, o número reflete isso em vez de dar um falso positivo.
    const cleared = await this.cacheService.clearAll();
    this.logger.log(
      `Cache invalidado sob demanda: ${cleared} chaves apagadas (status via antes: ${before.summary.total}).`,
    );

    this.runWarmupInternal()
      .then(() => this.logger.log('Reaquecimento pós-limpeza concluído.'))
      .catch((error) => this.logger.error('Erro no reaquecimento pós-limpeza:', error));

    return {
      cleared,
      namespace: before.namespace,
      rewarming: true,
      timestamp: new Date().toISOString(),
    };
  }

  private buildPeriods(): PeriodoDoWarmup[] {
    return periodosDoWarmup(moment.tz('America/Sao_Paulo'));
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
            // As MESMAS datas que o controller do serviço calcula para esse
            // período: a chave do cache usa o instante exato, então só assim
            // o warmup serve a requisição do dashboard.
            const { start, end } = datasDoServico(this.dateUtils, svc.name, p.inicio, p.fim);
            if (!start || !end) throw new Error(`datas inválidas ${p.inicio}–${p.fim}`);
            const data = await this.withRetry(() => svc.run(tenant, start, end), key);
            await this.cacheService.set(
              tenant.slug,
              svc.name,
              p.period,
              data,
              { start, end },
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
            await this.withRetry(() => svc.run(p.inicio, p.fim), key);
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

/** Um período do warmup: datas DD/MM/YYYY como o front envia (fuso de Brasília). */
export interface PeriodoDoWarmup {
  name: string;
  period: CachePeriodEnum;
  inicio: string;
  fim: string;
}

/**
 * Períodos do warmup, como o FRONT pede: datas explícitas (CUSTOM) no fuso de
 * Brasília, terminando HOJE (exceto o mês passado, fechado). Cada serviço
 * converte essas datas com as MESMAS opções do seu controller
 * (datasDoServico), então a chave do warmup é a mesma da requisição.
 */
export function periodosDoWarmup(agora: moment.Moment): PeriodoDoWarmup[] {
  const d = (m: moment.Moment) => m.format('DD/MM/YYYY');
  const hoje = agora.clone().startOf('day');
  const mesPassado = hoje.clone().subtract(1, 'month');
  return [
    { name: 'LAST_7_D', period: CachePeriodEnum.CUSTOM, inicio: d(hoje.clone().subtract(7, 'days')), fim: d(hoje) },
    {
      name: 'LAST_MONTH',
      period: CachePeriodEnum.CUSTOM,
      inicio: d(mesPassado.clone().startOf('month')),
      fim: d(mesPassado.clone().endOf('month')),
    },
    { name: 'THIS_MONTH', period: CachePeriodEnum.CUSTOM, inicio: d(hoje.clone().startOf('month')), fim: d(hoje) },
    { name: 'YEAR_TO_DATE', period: CachePeriodEnum.CUSTOM, inicio: d(hoje.clone().startOf('year')), fim: d(hoje) },
  ];
}

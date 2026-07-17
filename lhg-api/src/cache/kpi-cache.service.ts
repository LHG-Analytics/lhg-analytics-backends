/**
 * Cache de KPIs multi-tenant, em memória (Map por processo).
 * Diferença para os backends por unidade: a UNIDADE faz parte da chave —
 * um único processo cacheia todas as unidades.
 * Chave: kpi:{unit}:{svcPrefix}:{period}[:start:end]
 */
import { Injectable, Logger } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { CacheItem, CachePeriodEnum, CacheResult, DateRange, ServiceType } from './cache.interfaces';

const SERVICE_PREFIXES: Record<ServiceType, string> = {
  bookings: 'bk',
  company: 'cp',
  restaurant: 'rt',
  governance: 'gv',
};

const CACHE_KEY_PREFIX = 'kpi';
// Dimensionado pelo registry: (unidades + consolidated + folga) × 4 serviços × ~15 slots.
// Escala sozinho quando novas unidades (Goiânia) entrarem no tenant registry.
import { allTenants } from '../tenant/tenant.registry';
const MAX_CACHE_SIZE = Math.max(480, (allTenants().length + 2) * 60);

const PERIOD_TTL: Record<CachePeriodEnum, number> = {
  [CachePeriodEnum.LAST_7_D]: 21600,
  [CachePeriodEnum.LAST_MONTH]: 86400,
  [CachePeriodEnum.YEAR_TO_DATE]: 86400,
  [CachePeriodEnum.CUSTOM]: 21600,
};

@Injectable()
export class KpiCacheService {
  private readonly logger = new Logger(KpiCacheService.name);
  private cache = new Map<string, CacheItem>();

  buildCacheKey(
    unit: string,
    service: ServiceType,
    period: CachePeriodEnum,
    customDates?: DateRange,
  ): string {
    const prefix = SERVICE_PREFIXES[service];
    if (period === CachePeriodEnum.CUSTOM && customDates) {
      const start = moment(customDates.start).format('YYYY-MM-DD');
      const end = moment(customDates.end).format('YYYY-MM-DD');
      return `${CACHE_KEY_PREFIX}:${unit}:${prefix}:custom:${start}:${end}`;
    }
    return `${CACHE_KEY_PREFIX}:${unit}:${prefix}:${period.toLowerCase()}`;
  }

  async get<T>(
    unit: string,
    service: ServiceType,
    period: CachePeriodEnum,
    customDates?: DateRange,
  ): Promise<T | null> {
    const key = this.buildCacheKey(unit, service, period, customDates);
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (new Date() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return cached.data as T;
  }

  async set<T>(
    unit: string,
    service: ServiceType,
    period: CachePeriodEnum,
    data: T,
    customDates?: DateRange,
    ttlSecondsOverride?: number,
  ): Promise<void> {
    const key = this.buildCacheKey(unit, service, period, customDates);
    const ttl = ttlSecondsOverride ?? this.getTTL(period, customDates);

    if (this.cache.size >= MAX_CACHE_SIZE) this.cleanOldestEntries();

    const now = new Date();
    this.cache.set(key, {
      data,
      cachedAt: now,
      expiresAt: new Date(now.getTime() + ttl * 1000),
      period: period === CachePeriodEnum.CUSTOM ? 'custom' : period,
      service,
      unit,
    });
  }

  async getOrCalculate<T>(
    unit: string,
    service: ServiceType,
    period: CachePeriodEnum,
    calculateFn: () => Promise<T>,
    customDates?: DateRange,
  ): Promise<CacheResult<T>> {
    const key = this.buildCacheKey(unit, service, period, customDates);
    const cached = await this.get<T>(unit, service, period, customDates);
    if (cached) return { data: cached, fromCache: true, cacheKey: key };

    const startTime = Date.now();
    const data = await calculateFn();
    const calculationTime = Date.now() - startTime;
    this.logger.log(`[${unit}] ${service} KPIs calculados em ${calculationTime}ms`);

    await this.set(unit, service, period, data, customDates);
    return { data, fromCache: false, calculationTime, cacheKey: key };
  }

  /** TTL dinâmico para CUSTOM conforme o tamanho do range (mesma regra atual) */
  private getTTL(period: CachePeriodEnum, customDates?: DateRange): number {
    if (period !== CachePeriodEnum.CUSTOM) return PERIOD_TTL[period];
    if (customDates) {
      const daysDiff = moment(customDates.end).diff(moment(customDates.start), 'days');
      if (daysDiff <= 10) return 600;
      if (daysDiff <= 30) return 1800;
      return 10800;
    }
    return PERIOD_TTL[CachePeriodEnum.CUSTOM];
  }

  private cleanOldestEntries(): void {
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime(),
    );
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) this.cache.delete(entries[i][0]);
    this.logger.debug(`Cache cleanup: removidas ${toRemove} entradas antigas`);
  }

  async invalidateUnit(unit: string, service?: ServiceType): Promise<number> {
    const prefix = service
      ? `${CACHE_KEY_PREFIX}:${unit}:${SERVICE_PREFIXES[service]}:`
      : `${CACHE_KEY_PREFIX}:${unit}:`;
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    this.logger.log(`Invalidadas ${count} entradas de ${unit}${service ? `/${service}` : ''}`);
    return count;
  }

  getDetailedStatus() {
    const now = new Date();
    const items = Array.from(this.cache.entries()).map(([key, item]) => {
      const isExpired = now > item.expiresAt;
      return {
        key,
        unit: item.unit,
        service: item.service,
        period: String(item.period),
        cachedAt: item.cachedAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
        isExpired,
        ageMinutes: Math.round((now.getTime() - item.cachedAt.getTime()) / 60000),
        expiresInMinutes: isExpired
          ? 0
          : Math.round((item.expiresAt.getTime() - now.getTime()) / 60000),
      };
    });
    items.sort(
      (a, b) =>
        a.unit.localeCompare(b.unit) ||
        a.service.localeCompare(b.service) ||
        a.period.localeCompare(b.period),
    );

    const byUnit: Record<string, { total: number; active: number }> = {};
    for (const i of items) {
      byUnit[i.unit] = byUnit[i.unit] || { total: 0, active: 0 };
      byUnit[i.unit].total++;
      if (!i.isExpired) byUnit[i.unit].active++;
    }

    return {
      items,
      byUnit,
      summary: {
        total: items.length,
        active: items.filter((i) => !i.isExpired).length,
        expired: items.filter((i) => i.isExpired).length,
      },
    };
  }

  clearAll(): void {
    this.cache.clear();
    this.logger.log('Cache completamente limpo');
  }
}

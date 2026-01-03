/**
 * Serviço de Cache para KPIs Unificados
 * Implementação em memória com TTL dinâmico baseado no período
 */

import { Injectable, Logger } from '@nestjs/common';
import * as moment from 'moment-timezone';
import {
  ServiceType,
  CachePeriodEnum,
  DateRange,
  CacheItem,
  CacheMetrics,
  CacheResult,
} from './cache.interfaces';
import {
  SERVICE_PREFIXES,
  CACHE_STRATEGY,
  CACHE_KEY_PREFIX,
  MAX_CACHE_SIZE,
} from './cache.constants';

@Injectable()
export class KpiCacheService {
  private readonly logger = new Logger(KpiCacheService.name);

  // Cache em memória
  private cache = new Map<string, CacheItem>();

  // Métricas por serviço
  private metrics: Map<ServiceType, { hits: number; misses: number; calculationTimes: number[] }> =
    new Map();

  constructor() {
    // Inicializa métricas para cada serviço
    const services: ServiceType[] = ['bookings', 'company', 'restaurant', 'governance'];
    services.forEach((service) => {
      this.metrics.set(service, { hits: 0, misses: 0, calculationTimes: [] });
    });

    this.logger.log('KpiCacheService (Unified) inicializado');
  }

  /**
   * Constrói a chave de cache baseada no serviço e período
   */
  buildCacheKey(
    service: ServiceType,
    period: CachePeriodEnum,
    customDates?: DateRange,
  ): string {
    const prefix = SERVICE_PREFIXES[service];

    if (period === CachePeriodEnum.CUSTOM && customDates) {
      const start = moment(customDates.start).format('YYYY-MM-DD');
      const end = moment(customDates.end).format('YYYY-MM-DD');
      return `${CACHE_KEY_PREFIX}:${prefix}:custom:${start}:${end}`;
    }

    return `${CACHE_KEY_PREFIX}:${prefix}:${period.toLowerCase()}`;
  }

  /**
   * Obtém dados do cache
   */
  async get<T>(
    service: ServiceType,
    period: CachePeriodEnum,
    customDates?: DateRange,
  ): Promise<T | null> {
    const key = this.buildCacheKey(service, period, customDates);

    try {
      const cached = this.cache.get(key);

      if (cached) {
        // Verifica se expirou
        if (new Date() > cached.expiresAt) {
          this.cache.delete(key);
          this.incrementMiss(service);
          this.logger.debug(`Cache EXPIRED: ${key}`);
          return null;
        }

        this.incrementHit(service);
        this.logger.debug(`Cache HIT: ${key}`);
        return cached.data as T;
      }

      this.incrementMiss(service);
      this.logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      this.logger.error(`Erro ao buscar cache ${key}:`, error);
      return null;
    }
  }

  /**
   * Salva dados no cache
   */
  async set<T>(
    service: ServiceType,
    period: CachePeriodEnum,
    data: T,
    customDates?: DateRange,
  ): Promise<void> {
    const key = this.buildCacheKey(service, period, customDates);
    const ttl = this.getTTL(period, customDates);

    try {
      // Limpa cache se excedeu tamanho máximo
      if (this.cache.size >= MAX_CACHE_SIZE) {
        this.cleanOldestEntries();
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 1000);

      const cacheItem: CacheItem<T> = {
        data,
        cachedAt: now,
        expiresAt,
        period: period === CachePeriodEnum.CUSTOM ? 'custom' : period,
        service,
      };

      this.cache.set(key, cacheItem);
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl}s, expira em: ${expiresAt.toISOString()})`);
    } catch (error) {
      this.logger.error(`Erro ao salvar cache ${key}:`, error);
    }
  }

  /**
   * Busca ou calcula dados com cache
   */
  async getOrCalculate<T>(
    service: ServiceType,
    period: CachePeriodEnum,
    calculateFn: () => Promise<T>,
    customDates?: DateRange,
  ): Promise<CacheResult<T>> {
    const key = this.buildCacheKey(service, period, customDates);

    // Tenta buscar do cache
    const cached = await this.get<T>(service, period, customDates);
    if (cached) {
      return {
        data: cached,
        fromCache: true,
        cacheKey: key,
      };
    }

    // Calcula em tempo real
    const startTime = Date.now();
    const data = await calculateFn();
    const calculationTime = Date.now() - startTime;

    // Registra tempo de cálculo
    this.recordCalculationTime(service, calculationTime);

    this.logger.log(`Unified ${service} KPIs calculados em ${calculationTime}ms`);

    // Salva no cache
    await this.set(service, period, data, customDates);

    return {
      data,
      fromCache: false,
      calculationTime,
      cacheKey: key,
    };
  }

  /**
   * Obtém TTL baseado no período ou no tamanho do range de datas (para CUSTOM)
   * Regras para período CUSTOM:
   * - 1-10 dias: 10 minutos (600s) - calcula rápido, pode mudar frequentemente
   * - 11-30 dias: 30 minutos (1800s) - período médio
   * - 31+ dias: 3 horas (10800s) - acumulado, dados mais estáveis
   */
  private getTTL(period: CachePeriodEnum, customDates?: DateRange): number {
    // Para períodos não-customizados, usa a estratégia padrão
    if (period !== CachePeriodEnum.CUSTOM) {
      const strategy = CACHE_STRATEGY[period];
      return strategy?.ttl || CACHE_STRATEGY.CUSTOM.ttl;
    }

    // Para período CUSTOM, calcula TTL baseado no tamanho do range
    if (customDates) {
      const startMoment = moment(customDates.start);
      const endMoment = moment(customDates.end);
      const daysDiff = endMoment.diff(startMoment, 'days');

      if (daysDiff <= 10) {
        // 1-10 dias: 10 minutos
        return 600;
      } else if (daysDiff <= 30) {
        // 11-30 dias: 30 minutos
        return 1800;
      } else {
        // 31+ dias: 3 horas
        return 10800;
      }
    }

    // Fallback para valor padrão
    return CACHE_STRATEGY.CUSTOM.ttl;
  }

  /**
   * Incrementa contador de hits
   */
  private incrementHit(service: ServiceType): void {
    const metric = this.metrics.get(service);
    if (metric) {
      metric.hits++;
    }
  }

  /**
   * Incrementa contador de misses
   */
  private incrementMiss(service: ServiceType): void {
    const metric = this.metrics.get(service);
    if (metric) {
      metric.misses++;
    }
  }

  /**
   * Registra tempo de cálculo
   */
  private recordCalculationTime(service: ServiceType, time: number): void {
    const metric = this.metrics.get(service);
    if (metric) {
      metric.calculationTimes.push(time);
      // Mantém apenas os últimos 100 registros
      if (metric.calculationTimes.length > 100) {
        metric.calculationTimes.shift();
      }
    }
  }

  /**
   * Remove entradas mais antigas do cache
   */
  private cleanOldestEntries(): void {
    const entries = Array.from(this.cache.entries());
    // Ordena por data de criação (mais antigas primeiro)
    entries.sort((a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime());

    // Remove 20% das entradas mais antigas
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }

    this.logger.debug(`Cache cleanup: removidas ${toRemove} entradas antigas`);
  }

  /**
   * Invalida cache por padrão
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.logger.log(`Invalidados ${count} itens de cache com padrão: ${pattern}`);
    return count;
  }

  /**
   * Invalida cache de um serviço específico
   */
  async invalidateService(service: ServiceType, period?: CachePeriodEnum): Promise<number> {
    const prefix = SERVICE_PREFIXES[service];
    const pattern = period
      ? `${CACHE_KEY_PREFIX}:${prefix}:${period.toLowerCase()}`
      : `${CACHE_KEY_PREFIX}:${prefix}:*`;

    return this.invalidatePattern(pattern);
  }

  /**
   * Obtém métricas de um serviço
   */
  getServiceMetrics(service: ServiceType): CacheMetrics {
    const metric = this.metrics.get(service);
    if (!metric) {
      return {
        service,
        hits: 0,
        misses: 0,
        hitRatio: 0,
        avgCalculationTime: 0,
        totalRequests: 0,
        lastUpdated: new Date(),
      };
    }

    const total = metric.hits + metric.misses;
    const avgTime =
      metric.calculationTimes.length > 0
        ? metric.calculationTimes.reduce((a, b) => a + b, 0) / metric.calculationTimes.length
        : 0;

    return {
      service,
      hits: metric.hits,
      misses: metric.misses,
      hitRatio: total > 0 ? (metric.hits / total) * 100 : 0,
      avgCalculationTime: Math.round(avgTime),
      totalRequests: total,
      lastUpdated: new Date(),
    };
  }

  /**
   * Obtém métricas de todos os serviços
   */
  getAllMetrics(): CacheMetrics[] {
    const services: ServiceType[] = ['bookings', 'company', 'restaurant', 'governance'];
    return services.map((service) => this.getServiceMetrics(service));
  }

  /**
   * Obtém estatísticas gerais do cache
   */
  getCacheStats(): {
    totalItems: number;
    services: Record<ServiceType, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    const services: Record<ServiceType, number> = {
      bookings: 0,
      company: 0,
      restaurant: 0,
      governance: 0,
    };

    let oldestEntry: Date | null = null;
    let newestEntry: Date | null = null;

    for (const item of this.cache.values()) {
      services[item.service]++;

      if (!oldestEntry || item.cachedAt < oldestEntry) {
        oldestEntry = item.cachedAt;
      }
      if (!newestEntry || item.cachedAt > newestEntry) {
        newestEntry = item.cachedAt;
      }
    }

    return {
      totalItems: this.cache.size,
      services,
      oldestEntry,
      newestEntry,
    };
  }

  /**
   * Limpa todo o cache
   */
  clearAll(): void {
    this.cache.clear();
    this.logger.log('Cache completamente limpo');
  }
}

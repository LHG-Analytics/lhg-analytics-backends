/**
 * Interfaces para o sistema de cache de KPIs unificados
 */

// Tipos de serviço suportados
export type ServiceType = 'bookings' | 'company' | 'restaurant' | 'governance';

// Períodos suportados
export enum CachePeriodEnum {
  LAST_7_D = 'LAST_7_D',
  LAST_MONTH = 'LAST_MONTH',
  YEAR_TO_DATE = 'YEAR_TO_DATE',
  CUSTOM = 'CUSTOM',
}

// Range de datas customizado
export interface DateRange {
  start: Date;
  end: Date;
}

// Estratégia de cache por período
export interface CacheStrategy {
  ttl: number; // TTL em segundos
  description: string;
}

// Configuração completa de cache
export interface CacheConfig {
  [key: string]: CacheStrategy;
}

// Item armazenado no cache
export interface CacheItem<T = any> {
  data: T;
  cachedAt: Date;
  expiresAt: Date;
  period: CachePeriodEnum | string;
  service: ServiceType;
}

// Métricas do cache
export interface CacheMetrics {
  service: ServiceType;
  hits: number;
  misses: number;
  hitRatio: number;
  avgCalculationTime: number;
  totalRequests: number;
  lastUpdated: Date;
}

// Resultado de operação de cache
export interface CacheResult<T> {
  data: T;
  fromCache: boolean;
  calculationTime?: number;
  cacheKey?: string;
}

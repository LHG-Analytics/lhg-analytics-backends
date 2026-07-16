export type ServiceType = 'bookings' | 'company' | 'restaurant' | 'governance';

export enum CachePeriodEnum {
  LAST_7_D = 'LAST_7_D',
  LAST_MONTH = 'LAST_MONTH',
  YEAR_TO_DATE = 'YEAR_TO_DATE',
  CUSTOM = 'CUSTOM',
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface CacheItem<T = any> {
  data: T;
  cachedAt: Date;
  expiresAt: Date;
  period: string;
  service: ServiceType;
  unit: string;
}

export interface CacheResult<T> {
  data: T;
  fromCache: boolean;
  calculationTime?: number;
  cacheKey: string;
}

/**
 * ADAPTER: mesma assinatura do KpiCacheService do authentication
 * (getOrCalculate com unitKey opcional no fim), delegando ao cache
 * multi-tenant do lhg-api com unit "consolidated" (ou "consolidated_<unit>"
 * quando a visão consolidada é filtrada por unidade).
 */
import { Injectable } from '@nestjs/common';
import { KpiCacheService as RootKpiCacheService } from '../../cache/kpi-cache.service';
import {
  CachePeriodEnum as RootCachePeriodEnum,
  CacheResult,
  DateRange,
  ServiceType,
} from '../../cache/cache.interfaces';
import { CachePeriodEnum } from './cache.interfaces';

@Injectable()
export class KpiCacheService {
  constructor(private readonly root: RootKpiCacheService) {}

  async getOrCalculate<T>(
    service: ServiceType,
    period: CachePeriodEnum,
    calculateFn: () => Promise<T>,
    customDates?: DateRange,
    unitKey?: string,
  ): Promise<CacheResult<T>> {
    const unit = unitKey ? `consolidated_${unitKey}` : 'consolidated';
    return this.root.getOrCalculate(
      unit,
      service,
      period as unknown as RootCachePeriodEnum,
      calculateFn,
      customDates,
    );
  }
}

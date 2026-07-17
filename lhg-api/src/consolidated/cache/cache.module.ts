import { Global, Module } from '@nestjs/common';
import { KpiCacheService } from './kpi-cache.service';

/** Adapter de cache do módulo Consolidated (mesmo caminho relativo do original) */
@Global()
@Module({
  providers: [KpiCacheService],
  exports: [KpiCacheService],
})
export class CacheModule {}

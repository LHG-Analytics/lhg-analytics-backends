/**
 * Módulo de Cache para KPIs
 * Exporta o KpiCacheService e SuiteMetadataCacheService para uso em outros módulos
 */

import { Module, Global } from '@nestjs/common';
import { KpiCacheService } from './kpi-cache.service';
import { SuiteMetadataCacheService } from './suite-metadata-cache.service';

@Global() // Torna o módulo disponível globalmente
@Module({
  providers: [KpiCacheService, SuiteMetadataCacheService],
  exports: [KpiCacheService, SuiteMetadataCacheService],
})
export class CacheModule {}

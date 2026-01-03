/**
 * Módulo de Cache para KPIs Unificados
 * Exporta o KpiCacheService para uso em outros módulos
 */

import { Module, Global } from '@nestjs/common';
import { KpiCacheService } from './kpi-cache.service';

@Global() // Torna o módulo disponível globalmente
@Module({
  providers: [KpiCacheService],
  exports: [KpiCacheService],
})
export class CacheModule {}

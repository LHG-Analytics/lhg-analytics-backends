/**
 * Módulo de Cache para KPIs Unificados
 * Exporta o KpiCacheService para uso em outros módulos
 * Inclui CacheController com endpoint de warmup
 * Usa forwardRef para evitar dependência circular
 */

import { Module, Global, forwardRef } from '@nestjs/common';
import { KpiCacheService } from './kpi-cache.service';
import { CacheController } from './cache.controller';
import { CompanyModule } from '../company/company.module';
import { BookingsModule } from '../bookings/bookings.module';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { GovernanceModule } from '../governance/governance.module';

@Global() // Torna o módulo disponível globalmente
@Module({
  imports: [
    forwardRef(() => CompanyModule),
    forwardRef(() => BookingsModule),
    forwardRef(() => RestaurantModule),
    forwardRef(() => GovernanceModule),
  ],
  controllers: [CacheController],
  providers: [KpiCacheService],
  exports: [KpiCacheService],
})
export class CacheModule {}

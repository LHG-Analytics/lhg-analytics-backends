import { forwardRef, Global, Module } from '@nestjs/common';
import { CacheController } from './cache.controller';
import { KpiCacheService } from './kpi-cache.service';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { GovernanceModule } from '../governance/governance.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CompanyModule } from '../company/company.module';

@Global()
@Module({
  imports: [
    forwardRef(() => RestaurantModule),
    forwardRef(() => GovernanceModule),
    forwardRef(() => BookingsModule),
    forwardRef(() => CompanyModule),
  ],
  controllers: [CacheController],
  providers: [KpiCacheService],
  exports: [KpiCacheService],
})
export class CacheModule {}

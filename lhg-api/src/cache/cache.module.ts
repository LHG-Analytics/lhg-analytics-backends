import { forwardRef, Global, Module } from '@nestjs/common';
import { CacheController } from './cache.controller';
import { KpiCacheService } from './kpi-cache.service';
import { RestaurantModule } from '../restaurant/restaurant.module';

@Global()
@Module({
  imports: [forwardRef(() => RestaurantModule)],
  controllers: [CacheController],
  providers: [KpiCacheService],
  exports: [KpiCacheService],
})
export class CacheModule {}

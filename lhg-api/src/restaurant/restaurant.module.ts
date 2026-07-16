import { forwardRef, Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { RestaurantController } from './restaurant.controller';
import { RestaurantService } from './restaurant.service';

@Module({
  imports: [forwardRef(() => CacheModule)],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}

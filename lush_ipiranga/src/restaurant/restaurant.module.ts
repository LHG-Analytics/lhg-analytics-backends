import { Module, forwardRef } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { DatabaseModule } from '../database/database.module';
import { CacheModule } from '../cache/cache.module';
//import { AuthModule } from '@auth/auth/auth.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => CacheModule)],
  //imports: [AuthModule],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}

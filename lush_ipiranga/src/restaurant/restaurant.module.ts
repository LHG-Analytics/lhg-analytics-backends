import { Module } from '@nestjs/common';
import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { DatabaseModule } from '../database/database.module';
import { CacheModule } from '../cache/cache.module';
//import { AuthModule } from '@auth/auth/auth.module';

@Module({
  imports: [DatabaseModule, CacheModule],
  //imports: [AuthModule],
  controllers: [RestaurantController],
  providers: [RestaurantService],
})
export class RestaurantModule {}

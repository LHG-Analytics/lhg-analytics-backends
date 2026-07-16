import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  ConcurrencyUtilsModule,
  DateUtilsModule,
  QueryUtilsModule,
  ValidationModule,
} from '@lhg/utils';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { RestaurantModule } from './restaurant/restaurant.module';

@Module({
  imports: [
    DateUtilsModule,
    ValidationModule,
    QueryUtilsModule,
    ConcurrencyUtilsModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    DatabaseModule,
    CacheModule,
    RestaurantModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

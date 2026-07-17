import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  ConcurrencyUtilsModule,
  DateUtilsModule,
  QueryUtilsModule,
  ValidationModule,
} from '@lhg/utils';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { GovernanceModule } from './governance/governance.module';
import { BookingsModule } from './bookings/bookings.module';
import { CompanyModule } from './company/company.module';
import { ConsolidatedModule } from './consolidated/consolidated.module';

@Module({
  imports: [
    DateUtilsModule,
    ValidationModule,
    QueryUtilsModule,
    ConcurrencyUtilsModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    DatabaseModule,
    CacheModule,
    // ConsolidatedModule ANTES dos módulos de unidade: as rotas estáticas
    // /consolidated/api/... precisam registrar antes das paramétricas
    // /:unit/api/... (senão ':unit' captura o segmento 'consolidated').
    ConsolidatedModule,
    RestaurantModule,
    GovernanceModule,
    BookingsModule,
    CompanyModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

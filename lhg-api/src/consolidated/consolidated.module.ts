/**
 * Módulo Consolidated — visão agregada de todas as unidades (LHG).
 * Migrado do serviço authentication (que volta a ser só auth/usuários).
 * Rotas: /consolidated/api/{Company|Bookings|Restaurant|Governance}/kpis/date-range
 */
import { Module } from '@nestjs/common';
import { ConsolidatedDatabaseModule } from './database/database.module';
import { CacheModule } from './cache/cache.module';
import { ConsolidatedUtilsModule } from './utils/utils.module';
import { CompanyModule } from './company/company.module';
import { BookingsModule } from './bookings/bookings.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { GovernanceModule } from './governance/governance.module';

@Module({
  imports: [
    ConsolidatedDatabaseModule,
    CacheModule,
    ConsolidatedUtilsModule,
    CompanyModule,
    BookingsModule,
    RestaurantModule,
    GovernanceModule,
  ],
})
export class ConsolidatedModule {}

/**
 * Módulo para KPIs unificados de Restaurant
 * Versão Multi-Tenant com conexão direta aos bancos
 */

import { Module, forwardRef } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantMultitenantService } from './restaurant-multitenant.service';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [forwardRef(() => CacheModule)],
  controllers: [RestaurantController],
  providers: [RestaurantMultitenantService],
  exports: [RestaurantMultitenantService],
})
export class RestaurantModule {}

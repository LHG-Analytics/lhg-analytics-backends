/**
 * Módulo para KPIs unificados de Restaurant
 * Versão Multi-Tenant com conexão direta aos bancos
 */

import { Module } from '@nestjs/common';
import { RestaurantController } from './restaurant.controller';
import { RestaurantMultitenantService } from './restaurant-multitenant.service';

@Module({
  controllers: [RestaurantController],
  providers: [RestaurantMultitenantService],
  exports: [RestaurantMultitenantService],
})
export class RestaurantModule {}

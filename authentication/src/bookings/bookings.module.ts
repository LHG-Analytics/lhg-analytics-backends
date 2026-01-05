/**
 * Módulo para KPIs unificados de Bookings (Reservas)
 * Versão Multi-Tenant com conexão direta aos bancos
 */

import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsMultitenantService } from './bookings-multitenant.service';

@Module({
  controllers: [BookingsController],
  providers: [BookingsMultitenantService],
  exports: [BookingsMultitenantService],
})
export class BookingsModule {}

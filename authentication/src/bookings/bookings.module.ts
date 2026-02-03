/**
 * Módulo para KPIs unificados de Bookings (Reservas)
 * Versão Multi-Tenant com conexão direta aos bancos
 */

import { Module, forwardRef } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsMultitenantService } from './bookings-multitenant.service';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [forwardRef(() => CacheModule)],
  controllers: [BookingsController],
  providers: [BookingsMultitenantService],
  exports: [BookingsMultitenantService],
})
export class BookingsModule {}

import { Global, Module } from '@nestjs/common';
import { DateUtilsService } from './date-utils.service';
import { CurrencyConversionService } from './currency-conversion.service';

/**
 * Módulo de utilitários compartilhados.
 * Marcado como @Global para estar disponível em todos os módulos.
 */
@Global()
@Module({
  providers: [DateUtilsService, CurrencyConversionService],
  exports: [DateUtilsService, CurrencyConversionService],
})
export class UtilsModule {}

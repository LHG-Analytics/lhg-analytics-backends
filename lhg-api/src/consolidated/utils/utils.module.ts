import { Global, Module } from '@nestjs/common';
import { DateUtilsService } from './date-utils.service';
import { CurrencyConversionService } from './currency-conversion.service';

/** Utils do módulo Consolidated (fork herdado do authentication — unificar depois) */
@Global()
@Module({
  providers: [DateUtilsService, CurrencyConversionService],
  exports: [DateUtilsService, CurrencyConversionService],
})
export class ConsolidatedUtilsModule {}

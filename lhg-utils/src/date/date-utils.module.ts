import { Global, Module } from '@nestjs/common';
import { DateUtilsService } from './date-utils.service';

/**
 * Módulo global de utilitários de data.
 * Marcado como @Global para estar disponível em todos os módulos.
 */
@Global()
@Module({
  providers: [DateUtilsService],
  exports: [DateUtilsService],
})
export class DateUtilsModule {}

import { Global, Module } from '@nestjs/common';
import { DateUtilsService } from './date-utils.service';

/**
 * Módulo de utilitários compartilhados.
 * Marcado como @Global para estar disponível em todos os módulos.
 */
@Global()
@Module({
  providers: [DateUtilsService],
  exports: [DateUtilsService],
})
export class UtilsModule {}

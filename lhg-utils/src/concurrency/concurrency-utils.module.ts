import { Global, Module } from '@nestjs/common';
import { ConcurrencyUtilsService } from './concurrency-utils.service';

/**
 * Módulo global para utilitários de concorrência.
 *
 * Este módulo é marcado como @Global(), então não é necessário importar
 * em outros módulos. O ConcurrencyUtilsService estará disponível em toda
 * a aplicação automaticamente.
 *
 * @example
 * // Em qualquer service:
 * constructor(
 *   private readonly concurrencyUtils: ConcurrencyUtilsService,
 * ) {}
 *
 * const results = await this.concurrencyUtils.executeWithLimit(tasks, 5);
 */
@Global()
@Module({
  providers: [ConcurrencyUtilsService],
  exports: [ConcurrencyUtilsService],
})
export class ConcurrencyUtilsModule {}

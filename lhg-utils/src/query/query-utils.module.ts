import { Global, Module } from '@nestjs/common';
import { QueryUtilsService } from './query-utils.service';

/**
 * Módulo global para QueryUtilsService
 * Disponível em toda a aplicação sem necessidade de import explícito
 */
@Global()
@Module({
  providers: [QueryUtilsService],
  exports: [QueryUtilsService],
})
export class QueryUtilsModule {}

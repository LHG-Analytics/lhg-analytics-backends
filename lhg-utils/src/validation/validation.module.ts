import { Global, Module } from '@nestjs/common';
import { ValidationService } from './validation.service';

/**
 * Módulo global de validação.
 * Disponibiliza ValidationService em toda a aplicação sem necessidade de importação explícita.
 */
@Global()
@Module({
  providers: [ValidationService],
  exports: [ValidationService],
})
export class ValidationModule {}

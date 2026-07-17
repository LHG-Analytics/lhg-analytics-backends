import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

/** Adapter global (mesmo padrão do original no authentication) */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class ConsolidatedDatabaseModule {}

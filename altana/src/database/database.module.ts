/**
 * Módulo de conexão com banco de dados usando node-postgres (pg)
 */

import { Global, Module } from '@nestjs/common';
import { PgPoolService } from './database.service';

@Global()
@Module({
  providers: [PgPoolService],
  exports: [PgPoolService],
})
export class DatabaseModule {}

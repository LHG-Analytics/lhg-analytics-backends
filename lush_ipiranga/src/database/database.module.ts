import { Module } from '@nestjs/common';
import { PgPoolService } from './database.service';

@Module({
  providers: [PgPoolService],
  exports: [PgPoolService],
})
export class DatabaseModule {}

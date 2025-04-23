import { Module } from '@nestjs/common';
import { KpiGiroService } from './kpiGiro.service';
import { KpiGiroController } from './kpiGiro.controller';

@Module({
  controllers: [KpiGiroController],
  providers: [KpiGiroService],
  exports: [KpiGiroService],
})
export class KpiGiroModule {}

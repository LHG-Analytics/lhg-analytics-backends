import { Module } from '@nestjs/common';
import { KpiRevparService } from './kpiRevpar.service';
import { KpiRevparController } from './kpiRevpar.controller';

@Module({
  controllers: [KpiRevparController],
  providers: [KpiRevparService],
  exports: [KpiRevparService],
})
export class KpiRevparModule {}

import { Module } from '@nestjs/common';
import { KpiAlosService } from './kpiAlos.service';
import { KpiAlosController } from './kpiAlos.controller';

@Module({
  controllers: [KpiAlosController],
  providers: [KpiAlosService],
  exports: [KpiAlosService],
})
export class KpiAlosModule {}

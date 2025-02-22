import { Module } from '@nestjs/common';
import { KpiOccupancyRateService } from './kpiOccupancyRate.service';
import { KpiOccupancyRateController } from './kpiOccupancyRate.controller';

@Module({
  controllers: [KpiOccupancyRateController],
  providers: [KpiOccupancyRateService],
  exports: [KpiOccupancyRateService],
})
export class KpiOccupancyRateModule {}

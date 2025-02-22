import { Module } from '@nestjs/common';
import { KpiRevenueService } from './kpiRevenue.service';
import { KpiRevenueController } from './kpiRevenue.controller';

@Module({
  controllers: [KpiRevenueController],
  providers: [KpiRevenueService],
  exports: [KpiRevenueService],
})
export class KpiRevenueModule {}

import { Module } from '@nestjs/common';
import { KpiTotalRentalsService } from './kpiTotalRentals.service';
import { KpiTotalRentalsController } from './kpiTotalRentals.controller';

@Module({
  controllers: [KpiTotalRentalsController],
  providers: [KpiTotalRentalsService],
  exports: [KpiTotalRentalsService],
})
export class KpiTotalRentalsModule {}

import { Module } from '@nestjs/common';
import { KpiTicketAverageService } from './kpiTicketAverage.service';
import { KpiTicketAverageController } from './kpiTicketAverage.controller';

@Module({
  controllers: [KpiTicketAverageController],
  providers: [KpiTicketAverageService],
  exports: [KpiTicketAverageService],
})
export class KpiTicketAverageModule {}

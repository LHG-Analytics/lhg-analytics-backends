import { Module } from '@nestjs/common';
import { KpiTrevparService } from './kpiTrevpar.service';
import { KpiTrevparController } from './kpiTrevpar.controller';

@Module({
  controllers: [KpiTrevparController],
  providers: [KpiTrevparService],
  exports: [KpiTrevparService],
})
export class KpiTrevparModule {}

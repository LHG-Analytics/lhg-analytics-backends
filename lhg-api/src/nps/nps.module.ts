import { Module } from '@nestjs/common';
import { NpsController } from './nps.controller';
import { NpsService } from './nps.service';
import { NpsHmacGuard } from './nps-hmac.guard';

@Module({
  controllers: [NpsController],
  providers: [NpsService, NpsHmacGuard],
})
export class NpsModule {}

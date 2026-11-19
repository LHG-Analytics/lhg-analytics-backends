import { Module } from '@nestjs/common';
import { NpsController } from './nps.controller';
import { NpsService } from './nps.service';
import { NpsHmacGuard } from './nps-hmac.guard';
import { NpsTentativasService } from './nps-tentativas.service';

@Module({
  controllers: [NpsController],
  providers: [NpsService, NpsHmacGuard, NpsTentativasService],
})
export class NpsModule {}

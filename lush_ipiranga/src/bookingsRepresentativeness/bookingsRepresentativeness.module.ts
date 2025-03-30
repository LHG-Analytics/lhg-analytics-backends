import { Module } from '@nestjs/common';
import { BookingsRepresentativenessService } from './bookingsRepresentativeness.service';
import { BookingsRepresentativenessController } from './bookingsRepresentativeness.controller';

@Module({
  controllers: [BookingsRepresentativenessController],
  providers: [BookingsRepresentativenessService],
})
export class BookingsRepresentativenessModule {}

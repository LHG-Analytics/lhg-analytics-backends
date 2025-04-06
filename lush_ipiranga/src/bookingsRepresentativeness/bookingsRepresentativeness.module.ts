import { Module } from '@nestjs/common';
import { BookingsRepresentativenessService } from './bookingsRepresentativeness.service';
import { BookingsRepresentativenessController } from './bookingsRepresentativeness.controller';

@Module({
  controllers: [BookingsRepresentativenessController],
  providers: [BookingsRepresentativenessService],
  exports: [BookingsRepresentativenessService],
})
export class BookingsRepresentativenessModule {}

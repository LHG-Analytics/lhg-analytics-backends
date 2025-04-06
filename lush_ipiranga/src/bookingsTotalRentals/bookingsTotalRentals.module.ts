import { Module } from '@nestjs/common';
import { BookingsTotalRentalsService } from './bookingsTotalRentals.service';
import { BookingsTotalRentalsController } from './bookingsTotalRentals.controller';

@Module({
  controllers: [BookingsTotalRentalsController],
  providers: [BookingsTotalRentalsService],
  exports: [BookingsTotalRentalsService],
})
export class BookingsTotalRentalsModule {}

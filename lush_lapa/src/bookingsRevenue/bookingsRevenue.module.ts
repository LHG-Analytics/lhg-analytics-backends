import { Module } from '@nestjs/common';
import { BookingsRevenueService } from './bookingsRevenue.service';
import { BookingsRevenueController } from './bookingsRevenue.controller';

@Module({
  controllers: [BookingsRevenueController],
  providers: [BookingsRevenueService],
})
export class BookingsRevenueModule {}

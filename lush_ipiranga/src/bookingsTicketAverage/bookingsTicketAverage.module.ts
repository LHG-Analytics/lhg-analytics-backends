import { Module } from '@nestjs/common';
import { BookingsTicketAverageService } from './bookingsTicketAverage.service';
import { BookingsTicketAverageController } from './bookingsTicketAverage.controller';

@Module({
  controllers: [BookingsTicketAverageController],
  providers: [BookingsTicketAverageService],
  exports: [BookingsTicketAverageService],
})
export class BookingsTicketAverageModule {}

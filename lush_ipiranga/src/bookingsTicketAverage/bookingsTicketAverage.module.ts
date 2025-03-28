import { Module } from '@nestjs/common';
import { BookingsTicketAverageService } from './bookingsTicketAverage.service';
import { BookingsTicketAverageController } from './bookingsTicketAverage.controller';

@Module({
  controllers: [BookingsTicketAverageController],
  providers: [BookingsTicketAverageService],
})
export class BookingsTicketAverageModule {}

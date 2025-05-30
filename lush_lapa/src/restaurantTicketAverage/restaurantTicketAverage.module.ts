import { Module } from '@nestjs/common';
import { RestaurantTicketAverageService } from './restaurantTicketAverage.service';
import { RestaurantTicketAverageController } from './restaurantTicketAverage.controller';

@Module({
  controllers: [RestaurantTicketAverageController],
  providers: [RestaurantTicketAverageService],
  exports: [RestaurantTicketAverageService],
})
export class RestaurantTicketAverageModule {}

import { Module } from '@nestjs/common';
import { RestaurantRevenueService } from './restaurantRevenue.service';
import { RestaurantRevenueController } from './restaurantRevenue.controller';

@Module({
  controllers: [RestaurantRevenueController],
  providers: [RestaurantRevenueService],
})
export class RestaurantRevenueModule {}

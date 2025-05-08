import { Module } from '@nestjs/common';
import { RestaurantSalesService } from './restaurantSales.service';
import { RestaurantSalesController } from './restaurantSales.controller';

@Module({
  controllers: [RestaurantSalesController],
  providers: [RestaurantSalesService],
})
export class RestaurantSalesModule {}

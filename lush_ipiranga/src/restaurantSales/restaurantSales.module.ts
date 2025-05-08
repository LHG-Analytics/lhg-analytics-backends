import { Module } from '@nestjs/common';
import { RestaurantSalesService } from './restaurant-sales.service';
import { RestaurantSalesController } from './restaurant-sales.controller';

@Module({
  controllers: [RestaurantSalesController],
  providers: [RestaurantSalesService],
})
export class RestaurantSalesModule {}

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RestaurantCostsService } from './restaurantCosts.service';
import { RestaurantCostsController } from './restaurantCosts.controller';

@Module({
  imports: [
    HttpModule,
    ConfigModule, // se ainda não estiver global
  ],
  controllers: [RestaurantCostsController],
  providers: [RestaurantCostsService],
})
export class RestaurantCostsModule {}

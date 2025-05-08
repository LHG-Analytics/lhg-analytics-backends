import { Injectable } from '@nestjs/common';
import { CreateRestaurantSaleDto } from './dto/create-restaurant-sale.dto';
import { UpdateRestaurantSaleDto } from './dto/update-restaurant-sale.dto';

@Injectable()
export class RestaurantSalesService {
  create(createRestaurantSaleDto: CreateRestaurantSaleDto) {
    return 'This action adds a new restaurantSale';
  }

  findAll() {
    return `This action returns all restaurantSales`;
  }

  findOne(id: number) {
    return `This action returns a #${id} restaurantSale`;
  }

  update(id: number, updateRestaurantSaleDto: UpdateRestaurantSaleDto) {
    return `This action updates a #${id} restaurantSale`;
  }

  remove(id: number) {
    return `This action removes a #${id} restaurantSale`;
  }
}

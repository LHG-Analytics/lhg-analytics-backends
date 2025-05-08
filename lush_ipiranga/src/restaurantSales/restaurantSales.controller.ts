import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RestaurantSalesService } from './restaurant-sales.service';
import { CreateRestaurantSaleDto } from './dto/create-restaurant-sale.dto';
import { UpdateRestaurantSaleDto } from './dto/update-restaurant-sale.dto';

@Controller('restaurant-sales')
export class RestaurantSalesController {
  constructor(private readonly restaurantSalesService: RestaurantSalesService) {}

  @Post()
  create(@Body() createRestaurantSaleDto: CreateRestaurantSaleDto) {
    return this.restaurantSalesService.create(createRestaurantSaleDto);
  }

  @Get()
  findAll() {
    return this.restaurantSalesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.restaurantSalesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRestaurantSaleDto: UpdateRestaurantSaleDto) {
    return this.restaurantSalesService.update(+id, updateRestaurantSaleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.restaurantSalesService.remove(+id);
  }
}

import { PartialType } from '@nestjs/swagger';
import { CreateRestaurantSaleDto } from './create-restaurant-sale.dto';

export class UpdateRestaurantSaleDto extends PartialType(CreateRestaurantSaleDto) {}

import { PartialType } from '@nestjs/swagger';
import { CreateRestaurantSaleDto } from './create-restaurantSale.dto';

export class UpdateRestaurantSaleDto extends PartialType(
  CreateRestaurantSaleDto,
) {}

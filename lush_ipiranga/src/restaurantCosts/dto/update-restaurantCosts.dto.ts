import { PartialType } from '@nestjs/swagger';
import { CreateRestaurantCostsDto } from './create-restaurantCosts.dto';

export class UpdateRestaurantCostsDto extends PartialType(
  CreateRestaurantCostsDto,
) {}

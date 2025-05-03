import { PartialType } from '@nestjs/swagger';
import { CreateRestaurantRevenueDto } from './create-restaurantRevenue.dto';

export class UpdateRestaurantRevenueDto extends PartialType(
  CreateRestaurantRevenueDto,
) {}

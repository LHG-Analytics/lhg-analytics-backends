import { PartialType } from '@nestjs/swagger';
import { CreateRestaurantTicketAverageDto } from './create-restaurantTicketAverage.dto';

export class UpdateRestaurantTicketAverageDto extends PartialType(
  CreateRestaurantTicketAverageDto,
) {}

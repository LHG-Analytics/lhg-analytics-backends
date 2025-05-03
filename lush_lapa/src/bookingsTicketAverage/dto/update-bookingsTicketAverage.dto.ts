import { PartialType } from '@nestjs/swagger';
import { CreateBookingsTicketAverageDto } from './create-bookingsTicketAverage.dto';

export class UpdateBookingsTicketAverageDto extends PartialType(
  CreateBookingsTicketAverageDto,
) {}

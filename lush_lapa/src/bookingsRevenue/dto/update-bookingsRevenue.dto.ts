import { PartialType } from '@nestjs/swagger';
import { CreateBookingsRevenueDto } from './create-bookingsRevenue.dto';

export class UpdateBookingsRevenueDto extends PartialType(CreateBookingsRevenueDto) {}

import { PartialType } from '@nestjs/swagger';
import { CreateBookingsTotalRentalDto } from './create-bookingsTotalRental.dto';

export class UpdateBookingsTotalRentalDto extends PartialType(CreateBookingsTotalRentalDto) {}

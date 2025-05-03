import { PartialType } from '@nestjs/swagger';
import { CreateBookingsRepresentativenessDto } from './create-bookingsRepresentativeness.dto';

export class UpdateBookingsRepresentativenessDto extends PartialType(
  CreateBookingsRepresentativenessDto,
) {}

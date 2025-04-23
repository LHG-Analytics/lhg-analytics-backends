import { PartialType } from '@nestjs/swagger';
import { CreateApartmentInspectionDto } from './create-apartment-inspection.dto';

export class UpdateApartmentInspectionDto extends PartialType(
  CreateApartmentInspectionDto,
) {}

import { PartialType } from '@nestjs/swagger';
import { CreateKpiTotalRentalsDto } from './create-kpiTotalRental.dto';

export class UpdateKpiTotalRentalsDto extends PartialType(CreateKpiTotalRentalsDto) {}

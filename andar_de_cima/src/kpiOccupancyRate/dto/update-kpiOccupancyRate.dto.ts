import { PartialType } from '@nestjs/swagger';
import { CreateKpiOccupancyRateDto } from './create-kpiOccupancyRate.dto';

export class UpdateKpiOccupancyRateDto extends PartialType(CreateKpiOccupancyRateDto) {}

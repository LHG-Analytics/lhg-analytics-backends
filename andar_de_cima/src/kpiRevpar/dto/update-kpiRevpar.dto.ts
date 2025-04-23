import { PartialType } from '@nestjs/swagger';
import { CreateKpiRevparDto } from './create-kpiRevpar.dto';

export class UpdateKpiRevparDto extends PartialType(CreateKpiRevparDto) {}

import { PartialType } from '@nestjs/swagger';
import { CreateKpiGiroDto } from './create-kpiGiro.dto';

export class UpdateKpiGiroDto extends PartialType(CreateKpiGiroDto) {}

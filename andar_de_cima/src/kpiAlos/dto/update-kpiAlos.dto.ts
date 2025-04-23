import { PartialType } from '@nestjs/swagger';
import { CreateKpiAlosDto } from './create-kpiAlos.dto';

export class UpdateKpiAlosDto extends PartialType(CreateKpiAlosDto) {}

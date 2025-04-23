import { PartialType } from '@nestjs/swagger';
import { CreateKpiTrevparDto } from './create-kpiTrevpar.dto';

export class UpdateKpiTrevparDto extends PartialType(CreateKpiTrevparDto) {}

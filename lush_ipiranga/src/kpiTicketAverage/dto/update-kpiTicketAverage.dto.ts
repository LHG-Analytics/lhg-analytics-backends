import { PartialType } from '@nestjs/swagger';
import { CreateKpiTicketAverageDto } from './create-kpiTicketAverage.dto';

export class UpdateKpiTicketAverageDto extends PartialType(CreateKpiTicketAverageDto) {}

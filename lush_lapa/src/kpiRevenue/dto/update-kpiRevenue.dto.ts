import { PartialType } from '@nestjs/swagger';
import { CreateKpiRevenueDto } from './create-kpiRevenue.dto';

export class UpdateKpiRevenueDto extends PartialType(CreateKpiRevenueDto) {}

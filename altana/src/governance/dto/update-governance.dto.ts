import { PartialType } from '@nestjs/swagger';
import { CreateGovernanceDto } from './create-governance.dto';

export class UpdateGovernanceDto extends PartialType(CreateGovernanceDto) {}

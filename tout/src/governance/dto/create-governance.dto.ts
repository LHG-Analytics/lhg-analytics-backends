import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateGovernanceDto {
  @ApiProperty({ description: 'id da empresa', example: 1 })
  @IsNotEmpty({ message: 'O id da empresa é obrigatório' })
  companyId: number;

  constructor(companyId: number) {
    this.companyId = companyId;
  }
}

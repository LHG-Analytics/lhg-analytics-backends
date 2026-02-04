import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateGovernanceDto {
  @ApiProperty({ description: 'id da empresa', example: 1 })
  @IsNotEmpty({ message: 'O id da empresa é obrigatório' })
  @IsNumber()
  companyId: number;

  constructor(companyId: number) {
    this.companyId = companyId;
  }
}

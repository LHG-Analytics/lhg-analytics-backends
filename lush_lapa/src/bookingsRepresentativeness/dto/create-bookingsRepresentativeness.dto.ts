import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsDate, IsOptional } from 'class-validator';
import { Prisma, PeriodEnum } from '@client-online';

export class CreateBookingsRepresentativenessDto {
  @ApiProperty({
    description: 'Valor total de todas as receitas',
    example: 19.0,
  })
  @IsNotEmpty({ message: 'O valor total de todas as receitas é obrigatório' })
  totalAllRepresentativeness: Prisma.Decimal;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsDate({ message: 'A data de criação deve ser uma data válida' })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  @ApiProperty({ description: 'Período', example: 'DAILY', required: false })
  @IsOptional()
  period?: PeriodEnum;

  constructor(
    totalAllRepresentativeness: Prisma.Decimal,
    createdDate: Date,
    period?: PeriodEnum,
  ) {
    this.totalAllRepresentativeness = totalAllRepresentativeness;
    this.createdDate = createdDate;
    this.period = period;
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsDate, IsOptional } from 'class-validator';
import { Prisma, PeriodEnum } from '@client-online';

export class CreateBookingsRevenueDto {
  @ApiProperty({
    description: 'Valor total de todas as receitas',
    example: 150.0,
  })
  @IsNotEmpty({ message: 'O valor total de todas as receitas é obrigatório' })
  totalAllValue: Prisma.Decimal;

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

  constructor(totalAllValue: Prisma.Decimal, createdDate: Date, period?: PeriodEnum) {
    this.totalAllValue = totalAllValue;
    this.createdDate = createdDate;
    this.period = period;
  }
}

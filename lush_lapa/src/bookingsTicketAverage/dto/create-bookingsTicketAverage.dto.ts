import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsDate, IsOptional } from 'class-validator';
import { Prisma, PeriodEnum } from '@client-online';

export class CreateBookingsTicketAverageDto {
  @ApiProperty({
    description: 'Valor total de todos os tickets médios',
    example: 150.8,
  })
  @IsNotEmpty({
    message: 'O valor total de todos os tickets médios é obrigatório',
  })
  totalAllTicketAverage: Prisma.Decimal;

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
    totalAllTicketAverage: Prisma.Decimal,
    createdDate: Date,
    period?: PeriodEnum,
  ) {
    this.totalAllTicketAverage = totalAllTicketAverage;
    this.createdDate = createdDate;
    this.period = period;
  }
}

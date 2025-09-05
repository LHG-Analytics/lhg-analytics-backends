import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsDate, IsOptional } from 'class-validator';
import { PeriodEnum } from '@client-online';

export class CreateBookingsTotalRentalDto {
  @ApiProperty({
    description: 'Número total de reservas',
    example: 150,
  })
  @IsNotEmpty({ message: 'O número total de todas as reservas é obrigatório' })
  totalAllRentalsApartments: number;

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
    totalAllRentalsApartments: number,
    createdDate: Date,
    period?: PeriodEnum,
  ) {
    this.totalAllRentalsApartments = totalAllRentalsApartments;
    this.createdDate = createdDate;
    this.period = period;
  }
}

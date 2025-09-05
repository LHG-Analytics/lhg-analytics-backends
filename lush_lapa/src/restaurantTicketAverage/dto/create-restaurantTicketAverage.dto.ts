import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';
import { PeriodEnum, Prisma } from '@client-online';

export class CreateRestaurantTicketAverageDto {
  @ApiProperty({
    description: 'Ticket médio total de A&B',
    example: 150,
  })
  @IsNotEmpty({
    message: 'O ticket médio total de A&B é obrigatório',
  })
  totalAllTicketAverage: Prisma.Decimal;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  @ApiProperty({
    description: 'ID da empresa',
    example: 1,
  })
  @IsNotEmpty({ message: 'O ID da empresa é obrigatório' })
  companyId: number;

  @ApiProperty({
    description: 'Período do registro',
    example: 'LAST_7_D',
    required: false,
  })
  @IsOptional()
  period?: PeriodEnum | null;

  @ApiProperty({
    description: 'ID do restaurante',
    example: 1,
    required: false,
  })
  @IsOptional()
  restaurantId?: number | null;

  constructor(
    totalAllTicketAverage: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    period?: PeriodEnum | null,
    restaurantId?: number | null,
  ) {
    this.totalAllTicketAverage = totalAllTicketAverage;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.period = period;
    this.restaurantId = restaurantId;
  }
}
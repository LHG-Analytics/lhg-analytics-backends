import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional } from 'class-validator';
import { PeriodEnum, Prisma } from '@client-online';

export class CreateRestaurantRevenueDto {
  @ApiProperty({
    description: 'Valor total de toda a receita de A&B',
    example: 150.0,
  })
  @IsNotEmpty({
    message: 'O valor total de toda a receita de A&B é obrigatório',
  })
  totalAllValue: Prisma.Decimal;

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
    totalAllValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    period?: PeriodEnum | null,
    restaurantId?: number | null,
  ) {
    this.totalAllValue = totalAllValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.period = period;
    this.restaurantId = restaurantId;
  }
}
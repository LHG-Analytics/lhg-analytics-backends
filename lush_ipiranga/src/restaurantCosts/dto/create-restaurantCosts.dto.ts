import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional } from 'class-validator';
import { PeriodEnum, Prisma } from '@client-online';

export class CreateRestaurantCostsDto {
  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  @ApiProperty({
    description: 'Valor total do CMV de A&B',
    example: 150.0,
  })
  @IsNotEmpty({
    message: 'O valor total do CMV de A&B é obrigatório',
  })
  totalAllCMV: Prisma.Decimal;

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
    createdDate: Date,
    totalAllCMV: Prisma.Decimal,
    companyId: number,
    period?: PeriodEnum | null,
    restaurantId?: number | null,
  ) {
    this.createdDate = createdDate;
    this.totalAllCMV = totalAllCMV;
    this.companyId = companyId;
    this.period = period;
    this.restaurantId = restaurantId;
  }
}

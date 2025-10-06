import { IsInt, IsNotEmpty, IsDecimal, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@client-online';

export class CreateKpiOccupancyRateDto {
  @ApiProperty({ description: 'ID da categoria da suíte', example: 2 })
  @IsInt({ message: 'O ID da categoria da suíte deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da categoria da suíte é obrigatório' })
  suiteCategoryId: number;

  @ApiProperty({
    description: 'Nome da categoria da suíte',
    example: 'Lush Spa',
  })
  @IsInt({ message: 'O nome da categoria da suíte deve ser uma string' })
  @IsNotEmpty({ message: 'O nome da categoria da suíte é obrigatório' })
  suiteCategoryName: string;

  @ApiProperty({ description: 'Taxa de ocupação', example: '75.00' })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message: 'A taxa de ocupação deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A taxa de ocupação é obrigatória' })
  occupancyRate: Prisma.Decimal;

  @ApiProperty({ description: 'Taxa de ocupação total', example: '80.00' })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message: 'A taxa de ocupação total deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A taxa de ocupação total é obrigatória' })
  totalOccupancyRate: Prisma.Decimal;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2024-08-22T00:00:00.000Z',
  })
  @IsDate({ message: 'A data de criação deve ser uma data válida' })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  @ApiProperty({ description: 'ID da empresa', example: 1 })
  @IsInt({ message: 'O ID da empresa deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da empresa é obrigatório' })
  companyId: number;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    occupancyRate: Prisma.Decimal,
    totalOccupancyRate: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.occupancyRate = occupancyRate;
    this.totalOccupancyRate = totalOccupancyRate;
    this.createdDate = createdDate;
    this.companyId = companyId;
  }
}

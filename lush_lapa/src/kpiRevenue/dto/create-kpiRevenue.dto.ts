import { IsInt, IsNotEmpty, IsOptional, IsDecimal, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma, PeriodEnum, RentalTypeEnum } from '@client-online';

export class CreateKpiRevenueDto {
  @ApiProperty({ description: 'ID da categoria da suíte', example: 2 })
  @IsInt({ message: 'O ID da categoria da suíte deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da categoria da suíte é obrigatório' })
  suiteCategoryId: number;

  @ApiProperty({
    description: 'Nome da categoria da suíte',
    example: 'Lush Spa',
  })
  @IsNotEmpty({ message: 'O nome da categoria da suíte é obrigatório' })
  suiteCategoryName: string;

  @ApiProperty({ description: 'Receita de locação total', example: 100 })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'A receita de locação total deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A receita de locação total é obrigatória' })
  permanenceValueTotal: Prisma.Decimal;

  @ApiProperty({ description: 'Receita de locação líquida', example: 100 })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'A receita de locação líquida deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A receita de locação líquida é obrigatória' })
  permanenceValueLiquid: Prisma.Decimal;

  @ApiProperty({
    description: 'Receita de consumo',
    example: 50,
    required: false,
  })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'A receita de consumo deve ser um número decimal com duas casas decimais',
    },
  )
  @IsOptional()
  priceSale?: Prisma.Decimal;

  @ApiProperty({
    description: 'Receita total das vendas diretas',
    example: 150,
  })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'A receita total das vendas diretas deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A receita total das vendas diretas é obrigatória' })
  totalSaleDirect: Prisma.Decimal;

  @ApiProperty({ description: 'Receita total', example: 150 })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'A receita total deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A receita total é obrigatória' })
  totalValue: Prisma.Decimal;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsDate({ message: 'A data de criação deve ser uma data válida' })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  @ApiProperty({ description: 'ID da empresa', example: 1 })
  @IsInt({ message: 'O ID da empresa deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da empresa é obrigatório' })
  companyId: number;

  @ApiProperty({ description: 'Período', example: 'DAILY', required: false })
  @IsOptional()
  period?: PeriodEnum;

  @ApiProperty({ description: 'Tipo de locação', example: 'DAILY', required: false })
  @IsOptional()
  rentalType?: RentalTypeEnum;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    permanenceValueTotal: Prisma.Decimal,
    permanenceValueLiquid: Prisma.Decimal,
    totalSaleDirect: Prisma.Decimal,
    totalValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    priceSale?: Prisma.Decimal,
    period?: PeriodEnum,
    rentalType?: RentalTypeEnum,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.permanenceValueTotal = permanenceValueTotal;
    this.permanenceValueLiquid = permanenceValueLiquid;
    this.totalSaleDirect = totalSaleDirect;
    this.totalValue = totalValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.priceSale = priceSale;
    this.period = period;
    this.rentalType = rentalType;
  }
}

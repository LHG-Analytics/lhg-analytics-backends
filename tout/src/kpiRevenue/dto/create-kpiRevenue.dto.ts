import { IsInt, IsNotEmpty, IsOptional, IsDecimal } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateKpiRevenueDto {
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

  @ApiProperty({ description: 'Receita de locação total', example: 100 })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'A receita de locação total deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A receita de locação total é obrigatória' })
  permanenceValueTotal: number;

  @ApiProperty({ description: 'Receita de locação líquida', example: 100 })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'A receita de locação líquida deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A receita de locação líquida é obrigatória' })
  permanenceValueLiquid: number;

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
  priceSale?: number;

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
  totalSaleDirect: number;

  @ApiProperty({ description: 'Receita total', example: 150 })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'A receita total deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A receita total é obrigatória' })
  totalValue: number;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  @ApiProperty({ description: 'ID da empresa', example: 1 })
  @IsInt({ message: 'O ID da empresa deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da empresa é obrigatório' })
  companyId: number;
}

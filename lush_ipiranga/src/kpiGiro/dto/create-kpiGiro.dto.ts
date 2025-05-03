import { IsInt, IsNotEmpty, IsDecimal, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@client-online';

export class CreateKpiGiroDto {
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

  @ApiProperty({ description: 'Giro', example: '100.50' })
  @IsDecimal(
    { decimal_digits: '2' },
    { message: 'O giro deve ser um número decimal com duas casas decimais' },
  )
  @IsNotEmpty({ message: 'O giro é obrigatório' })
  giro: Prisma.Decimal;

  @ApiProperty({ description: 'Giro', example: '100.50' })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message: 'O totalGiro deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'O TotalGiro é obrigatório' })
  totalGiro: Prisma.Decimal;

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
}

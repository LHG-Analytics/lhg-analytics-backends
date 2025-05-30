import { IsInt, IsNotEmpty, IsDecimal, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@client-online';

export class CreateKpiTrevparDto {
  @ApiProperty({ description: 'ID do apartamento', example: 1 })
  @IsInt({ message: 'O ID do apartamento deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID do apartamento é obrigatório' })
  rentalApartmentId: number;

  @ApiProperty({ description: 'ID da categoria da suíte', example: 2 })
  @IsInt({ message: 'O ID da categoria da suíte deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da categoria da suíte é obrigatório' })
  suiteCategoryId: number;

  @ApiProperty({ description: 'ID da suíte', example: 3 })
  @IsInt({ message: 'O ID da suíte deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da suíte é obrigatório' })
  suiteId: number;

  @ApiProperty({
    description: 'Nome da categoria da suíte',
    example: 'Lush Spa',
  })
  @IsInt({ message: 'O nome da categoria da suíte deve ser uma string' })
  @IsNotEmpty({ message: 'O nome da categoria da suíte é obrigatório' })
  suiteCategoryName: string;

  @ApiProperty({ description: 'Trevpar', example: '150.75' })
  @IsDecimal(
    { decimal_digits: '2' },
    { message: 'O trevpar deve ser um número decimal com duas casas decimais' },
  )
  @IsNotEmpty({ message: 'O trevpar é obrigatório' })
  trevpar: Prisma.Decimal;

  @ApiProperty({ description: 'TotalTrevpar', example: '150.75' })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'O totalTrevpar deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'O totalTrevpar é obrigatório' })
  totalTrevpar: Prisma.Decimal;

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

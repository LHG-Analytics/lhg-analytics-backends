import {
  IsInt,
  IsNotEmpty,
  IsDecimal,
  IsDate,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '../../../dist/generated/client-online';

export class CreateCleaningsDto {
  @ApiProperty({ description: 'Nome do funcionário', example: 'João Silva' })
  @IsString({ message: 'O nome do funcionário deve ser uma string' })
  @IsNotEmpty({ message: 'O nome do funcionário é obrigatório' })
  employeeName: string;

  @ApiProperty({ description: 'Total de limpezas de suítes', example: 10 })
  @IsInt({
    message: 'O total de limpezas de suítes deve ser um número inteiro',
  })
  @IsNotEmpty({ message: 'O total de limpezas de suítes é obrigatório' })
  totalSuitesCleanings: number;

  @ApiProperty({
    description: 'Total geral de limpezas de suítes',
    example: 100,
  })
  @IsInt({
    message: 'O total geral de limpezas de suítes deve ser um número inteiro',
  })
  @IsNotEmpty({ message: 'O total geral de limpezas de suítes é obrigatório' })
  totalAllSuitesCleanings: number;

  @ApiProperty({ description: 'Total de dias trabalhados', example: 5 })
  @IsInt({ message: 'O total de dias trabalhados deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O total de dias trabalhados é obrigatório' })
  totalDaysWorked: number;

  @ApiProperty({ description: 'Turno', example: 'Manhã' })
  @IsString({ message: 'O turno deve ser uma string' })
  @IsNotEmpty({ message: 'O turno é obrigatório' })
  shift: string;

  @ApiProperty({ description: 'Média diária de limpeza', example: '5.00' })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'A média diária de limpeza deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'A média diária de limpeza é obrigatória' })
  averageDailyCleaning: Prisma.Decimal;

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

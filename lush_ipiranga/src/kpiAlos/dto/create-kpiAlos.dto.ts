import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsDate, IsOptional } from 'class-validator';
import { PeriodEnum } from '@client-online';

export class CreateKpiAlosDto {
  @ApiProperty({ description: 'ID da categoria da suíte', example: 1 })
  @IsInt({ message: 'O ID da categoria da suíte deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da categoria da suíte é obrigatório' })
  suiteCategoryId: number;

  @ApiProperty({
    description: 'Nome da categoria da suíte',
    example: 'Lush Spa',
  })
  @IsNotEmpty({ message: 'O nome da categoria da suíte é obrigatório' })
  suiteCategoryName: string;

  @ApiProperty({
    description: 'Tempo de ocupação formatado',
    example: '2h 30m 45s',
  })
  @IsNotEmpty({ message: 'O tempo de ocupação é obrigatório' })
  @IsString({ message: 'O tempo de ocupação deve ser uma string' })
  occupationTime: string;

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

  @ApiProperty({
    description: 'Tempo médio de ocupação formatado',
    example: '2h 30m 45s',
    required: false,
  })
  @IsString({ message: 'O tempo médio de ocupação deve ser uma string' })
  @IsOptional()
  averageOccupationTime?: string;

  @ApiProperty({
    description: 'Tempo médio total de ocupação formatado',
    example: '2h 30m 45s',
    required: false,
  })
  @IsString({ message: 'O tempo médio de ocupação deve ser uma string' })
  @IsOptional()
  totalAverageOccupationTime?: string;

  @ApiProperty({ description: 'Período', example: 'DAILY', required: false })
  @IsOptional()
  period?: PeriodEnum;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    occupationTime: string,
    createdDate: Date,
    companyId: number,
    averageOccupationTime?: string,
    totalAverageOccupationTime?: string,
    period?: PeriodEnum,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.occupationTime = occupationTime;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.averageOccupationTime = averageOccupationTime;
    this.totalAverageOccupationTime = totalAverageOccupationTime;
    this.period = period;
  }
}

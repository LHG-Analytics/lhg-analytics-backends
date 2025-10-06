import { IsInt, IsNotEmpty, IsString, IsDate, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApartmentInspectionDto {
  @ApiProperty({ description: 'ID da empresa', example: 1 })
  @IsInt({ message: 'O ID da empresa deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da empresa é obrigatório' })
  companyId: number;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2024-08-22T00:00:00.000Z',
  })
  @IsDate({ message: 'A data de criação deve ser uma data válida' })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  @ApiProperty({ description: 'Nome do funcionário', example: 'João Silva' })
  @IsString({ message: 'O nome do funcionário deve ser uma string' })
  @IsNotEmpty({ message: 'O nome do funcionário é obrigatório' })
  employeeName: string;

  @ApiProperty({ description: 'Período da inspeção', example: 'LAST_30_D' })
  @IsOptional() // O período pode ser opcional
  @IsString({ message: 'O período deve ser uma string' })
  period?: string; // Você pode substituir por PeriodEnum se preferir

  @ApiProperty({
    description: 'Motivo do término',
    example: 'Inspeção concluída',
  })
  @IsString({ message: 'O total de inspeções deve ser um número' })
  @IsNotEmpty({ message: 'O total de inspeções é obrigatório' })
  totalInspections: number;

  constructor(
    companyId: number,
    createdDate: Date,
    employeeName: string,
    totalInspections: number,
    period?: string,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.employeeName = employeeName;
    this.totalInspections = totalInspections;
    this.period = period;
  }
}

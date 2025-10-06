import { IsInt, IsNotEmpty, IsOptional, IsDate } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PeriodEnum } from '@client-online';

export class CreateKpiTotalRentalsDto {
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

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsDate({ message: 'A data de criação deve ser uma data válida' })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  @ApiProperty({
    description: 'Total de locações de apartamentos',
    example: 10,
    required: false,
  })
  @IsInt({
    message: 'O total de locações de apartamentos deve ser um número inteiro',
  })
  @IsOptional()
  totalRentalsApartments?: number;

  @ApiProperty({
    description: 'Total de reservas',
    example: 5,
    required: false,
  })
  @IsInt({ message: 'O total de reservas deve ser um número inteiro' })
  @IsOptional()
  totalBookings?: number;

  @ApiProperty({
    description: 'Total de todas as locações de apartamentos',
    example: 10,
    required: false,
  })
  @IsInt({
    message: 'O total de todas as locações de apartamentos deve ser um número inteiro',
  })
  @IsOptional()
  totalAllRentalsApartments?: number;

  @ApiProperty({
    description: 'Total de todas as reservas',
    example: 5,
    required: false,
  })
  @IsInt({ message: 'O total de todas as reservas deve ser um número inteiro' })
  @IsOptional()
  totalAllBookings?: number;

  @ApiProperty({ description: 'ID da empresa', example: 1 })
  @IsInt({ message: 'O ID da empresa deve ser um número inteiro' })
  @IsNotEmpty({ message: 'O ID da empresa é obrigatório' })
  companyId: number;

  @ApiProperty({ description: 'Período', example: 'DAILY', required: false })
  @IsOptional()
  period?: PeriodEnum;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    createdDate: Date,
    companyId: number,
    totalRentalsApartments?: number,
    totalBookings?: number,
    totalAllRentalsApartments?: number,
    totalAllBookings?: number,
    period?: PeriodEnum,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.totalRentalsApartments = totalRentalsApartments;
    this.totalBookings = totalBookings;
    this.totalAllRentalsApartments = totalAllRentalsApartments;
    this.totalAllBookings = totalAllBookings;
    this.period = period;
  }
}

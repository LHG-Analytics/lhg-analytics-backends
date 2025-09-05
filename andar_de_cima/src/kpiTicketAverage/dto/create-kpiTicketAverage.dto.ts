import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsInt, IsNotEmpty } from 'class-validator';
import { Prisma } from '@client-online';

export class CreateKpiTicketAverageDto {
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

  @ApiProperty({ description: 'Ticket médio total', example: 100 })
  @IsDecimal(
    { decimal_digits: '2' },
    {
      message:
        'O ticket médio total deve ser um número decimal com duas casas decimais',
    },
  )
  @IsNotEmpty({ message: 'O ticket médio total é obrigatório' })
  totalTicketAverage: Prisma.Decimal;

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

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    totalTicketAverage: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.totalTicketAverage = totalTicketAverage;
    this.createdDate = createdDate;
    this.companyId = companyId;
  }
}

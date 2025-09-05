import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateBookingsRepresentativenessDto {
  @ApiProperty({
    description: 'Valor total de todas as receitas',
    example: 19.0,
  })
  @IsNotEmpty({ message: 'O valor total de todas as receitas é obrigatório' })
  totalAllRepresentativeness: number;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  constructor(totalAllRepresentativeness: number, createdDate: Date) {
    this.totalAllRepresentativeness = totalAllRepresentativeness;
    this.createdDate = createdDate;
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateRestaurantRevenueDto {
  @ApiProperty({
    description: 'Valor total de toda a receita de A&B',
    example: 150.0,
  })
  @IsNotEmpty({
    message: 'O valor total de toda a receita de A&B é obrigatório',
  })
  totalAllValue: number;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  constructor(totalAllValue: number, createdDate: Date) {
    this.totalAllValue = totalAllValue;
    this.createdDate = createdDate;
  }
}

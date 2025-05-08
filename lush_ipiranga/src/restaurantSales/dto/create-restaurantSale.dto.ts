import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateRestaurantSaleDto {
  @ApiProperty({
    description: 'Número total de vendas de A&B',
    example: 150,
  })
  @IsNotEmpty({
    message: 'O número total de vendas de A&B é obrigatório',
  })
  totalAllSales: number;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;
}

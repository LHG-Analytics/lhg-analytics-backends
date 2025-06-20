import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty } from 'class-validator';

export class CreateRestaurantCostsDto {
  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  @ApiProperty({
    description: 'Valor total do CMV de A&B',
    example: 150.0,
  })
  @IsNotEmpty({
    message: 'O valor total do CMV de A&B é obrigatório',
  })
  totalAllCMV: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateRestaurantTicketAverageDto {
  @ApiProperty({
    description: 'Ticket médio total de A&B',
    example: 150,
  })
  @IsNotEmpty({
    message: 'O ticket médio total de A&B é obrigatório',
  })
  totalAllTicketAverage: number;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;
}

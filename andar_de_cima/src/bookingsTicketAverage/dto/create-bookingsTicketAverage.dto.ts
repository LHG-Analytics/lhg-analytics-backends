import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { Prisma } from '@client-online';

export class CreateBookingsTicketAverageDto {
  @ApiProperty({
    description: 'Valor total de todos os tickets médios',
    example: 150.8,
  })
  @IsNotEmpty({
    message: 'O valor total de todos os tickets médios é obrigatório',
  })
  totalAllTicketAverage: Prisma.Decimal;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  constructor(totalAllTicketAverage: Prisma.Decimal, createdDate: Date) {
    this.totalAllTicketAverage = totalAllTicketAverage;
    this.createdDate = createdDate;
  }
}

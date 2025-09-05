import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class CreateBookingsTotalRentalDto {
  @ApiProperty({
    description: 'Número total de reservas',
    example: 150,
  })
  @IsNotEmpty({ message: 'O número total de todas as reservas é obrigatório' })
  totalAllRentalsApartments: number;

  @ApiProperty({
    description: 'Data de criação do registro',
    example: '2023-07-15T00:00:00.000Z',
  })
  @IsNotEmpty({ message: 'A data de criação é obrigatória' })
  createdDate: Date;

  constructor(totalAllRentalsApartments: number, createdDate: Date) {
    this.totalAllRentalsApartments = totalAllRentalsApartments;
    this.createdDate = createdDate;
  }
}

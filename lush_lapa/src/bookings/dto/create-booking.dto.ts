import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ description: 'Id da reserva', example: 1 })
  @IsNotEmpty({ message: 'O id da reserva é obrigatório' })
  @IsNumber()
  id!: number;

  constructor(id: number) {
    this.id = id;
  }
}

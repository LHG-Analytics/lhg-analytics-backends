import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber } from 'class-validator';

export class CreateRestaurantDto {
  @ApiProperty({ description: 'Id do restaurante', example: 1 })
  @IsNotEmpty({ message: 'O id do restaurante é obrigatório' })
  @IsNumber()
  id: number;

  constructor(id: number) {
    this.id = id;
  }
}

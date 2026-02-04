import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ description: 'Nome da empresa', example: 'Lush Ipiranga' })
  @IsNotEmpty({ message: 'O nome da empresa é obrigatório' })
  @IsString({ message: 'O nome da empresa deve ser uma string' })
  name: string;

  constructor(name: string) {
    this.name = name;
  }
}

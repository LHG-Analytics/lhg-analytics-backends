import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsInt,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../dist/generated/client-online';

export class CreateUserDto {
  @ApiProperty({ example: 'example@example.com' })
  @IsEmail({}, { message: 'O email deve ser válido' })
  email: string;

  @ApiProperty({ example: 'João da Silva' })
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @IsString({ message: 'O nome deve ser uma string' })
  name: string;

  @ApiProperty({ example: '12345678909' })
  @IsNotEmpty({ message: 'O CPF é obrigatório' })
  @Length(11, 11, { message: 'O CPF deve ter exatamente 11 dígitos' })
  @Matches(/^[0-9]{11}$/, { message: 'O CPF deve conter apenas números' })
  cpf: string;

  @ApiProperty({ example: 'senha123' })
  @IsNotEmpty({ message: 'A senha é obrigatória' })
  @IsString({ message: 'A senha deve conter 8 dígitos' })
  password?: string;

  @ApiProperty({ example: 'admin' })
  @IsNotEmpty({ message: 'A função (role) é obrigatória' })
  @IsString({ message: 'A função (role) deve ser uma string' })
  role?: Role;

  @ApiProperty({ example: 'Lush Lapa' })
  @IsString({ message: 'O nome da empresa deve ser uma string' })
  company: string;
}

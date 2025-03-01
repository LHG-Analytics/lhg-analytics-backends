// user-response.dto.ts
import { IsEmail, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../dist/generated/client-online';

export class UserResponseDto {
  @ApiProperty({ example: 'example@example.com' })
  @IsEmail({}, { message: 'O email deve ser válido' })
  email: string;

  @ApiProperty({ example: 'João da Silva' })
  @IsString({ message: 'O nome deve ser uma string' })
  name: string;

  @ApiProperty({ example: '12345678909' })
  @IsString({ message: 'O CPF deve ser uma string' })
  cpf: string;

  @ApiProperty({ example: 'senha123' })
  @IsString({ message: 'A senha deve ser uma string' })
  password: string; // Incluindo a senha encriptada

  @ApiProperty({ example: 'admin' })
  @IsString({ message: 'A função (role) deve ser uma string' })
  role?: Role;

  @ApiProperty({ example: 'Lush Lapa' })
  @IsString({ message: 'O nome da empresa deve ser uma string' })
  company: string;
}

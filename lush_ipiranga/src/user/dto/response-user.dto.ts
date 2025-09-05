// user-response.dto.ts
import { IsEmail, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@client-online';

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

  @ApiProperty({ example: 'admin' })
  @IsOptional()
  @IsString({ message: 'A função (role) deve ser uma string' })
  role?: Role;

  @ApiProperty({ example: 'Lush Ipiranga' })
  @IsString({ message: 'O nome da empresa deve ser uma string' })
  company: string;

  constructor(
    email: string,
    name: string,
    cpf: string,
    company: string,
    role?: Role,
  ) {
    this.email = email;
    this.name = name;
    this.cpf = cpf;
    this.company = company;
    this.role = role;
  }
}

import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export type UserRole =
  | 'ADMIN'
  | 'GERENTE_GERAL'
  | 'GERENTE_FINANCEIRO'
  | 'GERENTE_RESERVAS'
  | 'GERENTE_RESTAURANTE'
  | 'GERENTE_OPERACIONAL';
export type UserUnit =
  | 'LHG'
  | 'LUSH_LAPA'
  | 'LUSH_IPIRANGA'
  | 'TOUT'
  | 'ANDAR_DE_CIMA';

export class CreateUserDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'senha_supersegura' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: '000.000.000-00' })
  @IsString()
  @IsNotEmpty()
  cpf: string;

  @ApiProperty({
    enum: ['LHG', 'LUSH_LAPA', 'LUSH_IPIRANGA', 'TOUT', 'ANDAR_DE_CIMA'],
    example: 'LUSH_LAPA',
  })
  @IsEnum(['LHG', 'LUSH_LAPA', 'LUSH_IPIRANGA', 'TOUT', 'ANDAR_DE_CIMA'])
  @IsNotEmpty()
  unit: UserUnit;

  @ApiProperty({
    enum: [
      'ADMIN',
      'GERENTE_GERAL',
      'GERENTE_FINANCEIRO',
      'GERENTE_RESERVAS',
      'GERENTE_RESTAURANTE',
      'GERENTE_OPERACIONAL',
    ],
    example: 'ADMIN',
  })
  @IsEnum([
    'ADMIN',
    'GERENTE_GERAL',
    'GERENTE_FINANCEIRO',
    'GERENTE_RESERVAS',
    'GERENTE_RESTAURANTE',
    'GERENTE_OPERACIONAL',
  ])
  @IsNotEmpty()
  role: UserRole;
}

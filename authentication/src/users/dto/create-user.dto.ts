import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  UserRole as PrismaUserRole,
  UserUnit as PrismaUserUnit,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import { normalizeEmailInput } from '../../common/email';

// Cargos e unidades vêm do enum do Prisma (schema.online.prisma): uma unidade
// nova no schema passa a valer aqui sozinha, sem lista escrita à mão.
export type UserRole = PrismaUserRole;
export type UserUnit = PrismaUserUnit;

export class CreateUserDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'joao@email.com' })
  @Transform(normalizeEmailInput)
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

  // role e unit são obrigatórios só para quem recebe o Analytics (o service
  // confere: 400 ROLE_UNIT_REQUIRED); para os outros sistemas, opcionais.
  @ApiPropertyOptional({
    enum: PrismaUserUnit,
    example: PrismaUserUnit.LUSH_LAPA,
  })
  @IsOptional()
  @IsEnum(PrismaUserUnit)
  unit?: UserUnit;

  @ApiPropertyOptional({ enum: PrismaUserRole, example: PrismaUserRole.ADMIN })
  @IsOptional()
  @IsEnum(PrismaUserRole)
  role?: UserRole;

  // Sistemas que a pessoa recebe (nenhum é automático). Ausente = transição:
  // vale "analytics" se role e unit vierem, ou 400 SYSTEMS_REQUIRED quando
  // USERS_SYSTEMS_REQUIRED=true.
  @ApiPropertyOptional({
    description: 'Chaves de System ativas; [] = sem nenhum acesso',
    example: ['analytics'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  systems?: string[];

  constructor(
    name: string,
    email: string,
    password: string,
    cpf: string,
    unit?: UserUnit,
    role?: UserRole,
    systems?: string[],
  ) {
    this.name = name;
    this.email = email;
    this.password = password;
    this.cpf = cpf;
    this.unit = unit;
    this.role = role;
    this.systems = systems;
  }
}

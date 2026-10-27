import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
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

  @ApiProperty({ enum: PrismaUserUnit, example: PrismaUserUnit.LUSH_LAPA })
  @IsEnum(PrismaUserUnit)
  @IsNotEmpty()
  unit: UserUnit;

  @ApiProperty({ enum: PrismaUserRole, example: PrismaUserRole.ADMIN })
  @IsEnum(PrismaUserRole)
  @IsNotEmpty()
  role: UserRole;

  constructor(
    name: string,
    email: string,
    password: string,
    cpf: string,
    unit: UserUnit,
    role: UserRole,
  ) {
    this.name = name;
    this.email = email;
    this.password = password;
    this.cpf = cpf;
    this.unit = unit;
    this.role = role;
  }
}

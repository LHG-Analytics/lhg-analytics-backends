import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  UserRole as PrismaUserRole,
  UserUnit as PrismaUserUnit,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmailInput } from '../../common/email';
import { MaxBytes, PASSWORD_MIN_LENGTH } from '../../common/password';

/** Validade do convite, escolhida por quem convida. */
export const VALIDADES = ['7', '14', '30', 'never'] as const;
export type Validade = (typeof VALIDADES)[number];

export class CreateInvitationDto {
  @ApiProperty({ example: 'pessoa@exemplo.com' })
  @Transform(normalizeEmailInput)
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Pessoa Convidada' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiProperty({
    description: 'Flags que a pessoa recebe ao aceitar (pode ser [])',
    example: ['analytics'],
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  systems: string[];

  @ApiPropertyOptional({ enum: PrismaUserRole })
  @IsOptional()
  @IsEnum(PrismaUserRole)
  role?: PrismaUserRole;

  @ApiPropertyOptional({ enum: PrismaUserUnit })
  @IsOptional()
  @IsEnum(PrismaUserUnit)
  unit?: PrismaUserUnit;

  @ApiProperty({ enum: VALIDADES, description: 'Dias de validade ou "never"' })
  @IsIn(VALIDADES as unknown as string[])
  validity: Validade;

  @ApiPropertyOptional({
    description: 'Obrigatório com validity "never" (confirmação explícita)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  neverReason?: string;

  constructor(
    email: string,
    systems: string[],
    validity: Validade,
    name?: string,
  ) {
    this.email = email;
    this.systems = systems;
    this.validity = validity;
    this.name = name;
  }
}

/** O token do convite vai SEMPRE no corpo (nunca na URL, que cai em logs). */
export class InvitationTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  constructor(token: string) {
    this.token = token;
  }
}

export class AcceptByPasswordDto extends InvitationTokenDto {
  @ApiProperty({ description: `Mínimo ${PASSWORD_MIN_LENGTH} caracteres` })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  // bcrypt só usa os primeiros 72 BYTES; acima disso o resto seria ignorado.
  @MaxBytes()
  password: string;

  constructor(token: string, password: string) {
    super(token);
    this.password = password;
  }
}

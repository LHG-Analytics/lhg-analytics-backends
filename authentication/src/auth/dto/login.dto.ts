import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { normalizeEmailInput } from '../../common/email';

export class LoginDto {
  @ApiProperty({ description: 'Email do usuário' })
  // Normaliza antes de validar: "  FULANO@X.COM " entra como fulano@x.com.
  @Transform(normalizeEmailInput)
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Senha do usuário' })
  @IsString()
  @MinLength(8)
  password: string;

  constructor(email: string, password: string) {
    this.email = email;
    this.password = password;
  }
}

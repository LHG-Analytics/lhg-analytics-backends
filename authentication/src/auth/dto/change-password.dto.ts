import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH } from '../../common/password';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Senha atual' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  currentPassword: string;

  @ApiProperty({
    description: `Nova senha (mínimo ${PASSWORD_MIN_LENGTH} caracteres)`,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  // bcrypt só usa os primeiros 72 bytes; acima disso o resto seria ignorado.
  @MaxLength(72)
  newPassword: string;

  constructor(currentPassword: string, newPassword: string) {
    this.currentPassword = currentPassword;
    this.newPassword = newPassword;
  }
}

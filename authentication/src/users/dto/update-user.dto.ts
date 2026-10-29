import { OmitType, PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { MaxBytes } from '../../common/password';
import { CreateUserDto } from './create-user.dto';

// O PATCH não mexe em acessos: `systems` fica de fora (é só pelo
// PUT /users/:id/systems). Com o forbidNonWhitelisted do main.ts, mandar
// `systems` no PATCH dá 400 em vez de ser ignorado em silêncio.
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['systems', 'password'] as const),
) {
  // Senha opcional no PATCH: vazia ou só espaços = "não mudar" (a tela de
  // edição pode mandar o campo em branco). O service também ignora um hash
  // bcrypt devolvido pela tela.
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString()
  @MaxBytes()
  password?: string;
}

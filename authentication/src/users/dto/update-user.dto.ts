import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

// O PATCH não mexe em acessos: `systems` fica de fora (é só pelo
// PUT /users/:id/systems). Com o forbidNonWhitelisted do main.ts, mandar
// `systems` no PATCH dá 400 em vez de ser ignorado em silêncio.
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['systems'] as const),
) {}

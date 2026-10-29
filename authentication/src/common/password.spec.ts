import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { AcceptByPasswordDto } from '../invitations/dto/invitation.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';

// O bcrypt só usa os primeiros 72 BYTES: o limite é em bytes UTF-8, não em
// caracteres. 37 "ç" são 37 caracteres, mas 74 bytes.
const SETENTA_E_DOIS = 'a'.repeat(72);
const SETENTA_E_TRES = 'a'.repeat(73);
const CEDILHAS = 'ç'.repeat(37);

const erros = async (cls: any, obj: object, campo: string) =>
  (await validate(plainToInstance(cls, obj))).filter(
    (e) => e.property === campo,
  );

describe('senha: no máximo 72 BYTES (UTF-8) em todos os pontos de entrada', () => {
  it.each([
    [
      'troca de senha',
      ChangePasswordDto,
      { currentPassword: 'atual-123' },
      'newPassword',
    ],
    ['aceite do convite', AcceptByPasswordDto, { token: 'tok' }, 'password'],
    [
      'cadastro do admin',
      CreateUserDto,
      { name: 'N', email: 'a@exemplo.invalid', systems: [] },
      'password',
    ],
    ['PATCH do admin', UpdateUserDto, {}, 'password'],
  ])('%s', async (_nome, cls, base, campo) => {
    expect(
      await erros(cls, { ...base, [campo]: SETENTA_E_DOIS }, campo),
    ).toHaveLength(0);
    expect(
      await erros(cls, { ...base, [campo]: SETENTA_E_TRES }, campo),
    ).not.toHaveLength(0);
    const ced = await erros(cls, { ...base, [campo]: CEDILHAS }, campo);
    expect(ced).not.toHaveLength(0);
    expect(JSON.stringify(ced[0].constraints)).toContain('72 bytes');
  });
});

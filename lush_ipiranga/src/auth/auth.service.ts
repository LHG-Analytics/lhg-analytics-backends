import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt'; // Alterado para 'bcrypt' com exportação padrão

@Injectable()
export class AuthService {
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds); // Usando 'bcrypt' diretamente
    return hashedPassword;
  }

  async comparePasswords(
    plainTextPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainTextPassword, hashedPassword); // Usando 'bcrypt' diretamente
  }
}

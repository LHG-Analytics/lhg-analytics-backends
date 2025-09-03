import { Prisma, Role } from '@client-online';

export class User implements Prisma.UserUncheckedCreateInput {
  id?: number;
  email: string;
  name: string;
  cpf: string;
  password: string;
  role?: Role;
  company: string;
}

// User response type without sensitive data
export type UserResponse = Omit<User, 'password'>;

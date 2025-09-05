import { Prisma, Role } from '@client-online';

export class User implements Prisma.UserUncheckedCreateInput {
  id?: number;
  email: string;
  name: string;
  cpf: string;
  password: string;
  role?: Role | null;
  company: string;

  constructor(
    email: string,
    name: string,
    cpf: string,
    password: string,
    company: string,
    id?: number,
    role?: Role | null,
  ) {
    this.email = email;
    this.name = name;
    this.cpf = cpf;
    this.password = password;
    this.company = company;
    this.id = id;
    this.role = role || null;
  }
}

// User response type without sensitive data
export type UserResponse = Omit<User, 'password'>;
import { Exclude } from 'class-transformer';
import { Prisma, UserRole, UserUnit } from '@prisma/client';

export class User implements Prisma.UserUncheckedCreateInput {
  id?: number;
  email: string;
  name?: string;

  @Exclude()
  password: string;

  cpf: string;
  role: UserRole;
  unit: UserUnit;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    email: string,
    password: string,
    cpf: string,
    role: UserRole,
    unit: UserUnit,
    name?: string,
    id?: number,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.password = password;
    this.cpf = cpf;
    this.role = role;
    this.unit = unit;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

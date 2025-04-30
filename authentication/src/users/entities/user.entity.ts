import { Exclude } from 'class-transformer';
import {
  Prisma,
  UserRole,
  UserUnit,
} from '../../../dist/generated/client-online';

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
}

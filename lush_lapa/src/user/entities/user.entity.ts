import { Prisma, Role } from '../../../dist/generated/client-online';

export class User implements Prisma.UserUncheckedCreateInput {
  id?: number;
  email: string;
  name: string;
  cpf: string;
  password: string;
  role?: Role;
  company: string;
}

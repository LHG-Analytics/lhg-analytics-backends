import { PeriodEnum, Prisma } from '../../../dist/generated/client-online';

export class BookingsRepresentativeness
  implements Prisma.BookingsRepresentativenessUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalAllRepresentativeness: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

export class BookingsRepresentativenessByPeriod
  implements Prisma.BookingsRepresentativenessByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalRepresentativeness: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

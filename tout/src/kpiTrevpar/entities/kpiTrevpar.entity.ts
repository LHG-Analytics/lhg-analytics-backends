import { PeriodEnum, Prisma } from '@client-online';

export class KpiTrevpar implements Prisma.KpiTrevparUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  trevpar: Prisma.Decimal;
  totalTrevpar: Prisma.Decimal;
  period?: PeriodEnum;
  createdDate: Date;
  companyId: number;
}

export class KpiTrevparByPeriod
  implements Prisma.KpiTrevparByPeriodUncheckedCreateInput
{
  id?: number;
  totalTrevpar: Prisma.Decimal;
  period?: PeriodEnum;
  createdDate: Date;
  companyId: number;
}

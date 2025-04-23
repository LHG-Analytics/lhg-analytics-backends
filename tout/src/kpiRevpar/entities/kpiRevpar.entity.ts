import { PeriodEnum, Prisma } from '../../../dist/generated/client-online';

export class KpiRevpar implements Prisma.KpiRevparUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  revpar: Prisma.Decimal;
  period?: PeriodEnum;
  createdDate: Date;
  companyId: number;
  totalRevpar: Prisma.Decimal;
}

export class KpiRevparByPeriod
  implements Prisma.KpiRevparByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  createdDate: Date;
  companyId: number;
  totalRevpar: Prisma.Decimal;
}

import { PeriodEnum, Prisma } from '../../../dist/generated/client-online';

export class KpiGiro implements Prisma.KpiGiroUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  giro: Prisma.Decimal;
  period?: PeriodEnum;
  createdDate: Date;
  companyId: number;
  totalGiro: Prisma.Decimal;
}

export class KpiGiroByWeek implements Prisma.KpiGiroUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  giro: Prisma.Decimal;
  period?: PeriodEnum;
  createdDate: Date;
  companyId: number;
  totalGiro: Prisma.Decimal;
}

import { PeriodEnum, Prisma } from '@client-online';

export class KpiGiro implements Prisma.KpiGiroUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  giro: Prisma.Decimal;
  period?: PeriodEnum | null;
  createdDate: Date;
  companyId: number;
  totalGiro: Prisma.Decimal;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    giro: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    totalGiro: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.giro = giro;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.totalGiro = totalGiro;
    this.id = id;
    this.period = period ?? null;
  }
}

export class KpiGiroByWeek implements Prisma.KpiGiroUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  giro: Prisma.Decimal;
  period?: PeriodEnum | null;
  createdDate: Date;
  companyId: number;
  totalGiro: Prisma.Decimal;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    giro: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    totalGiro: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.giro = giro;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.totalGiro = totalGiro;
    this.id = id;
    this.period = period ?? null;
  }
}

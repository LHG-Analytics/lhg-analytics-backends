import { PeriodEnum, Prisma } from '@client-online';

export class KpiRevpar implements Prisma.KpiRevparUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  revpar: Prisma.Decimal;
  period?: PeriodEnum | null;
  createdDate: Date;
  companyId: number;
  totalRevpar: Prisma.Decimal;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    revpar: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    totalRevpar: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.revpar = revpar;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.totalRevpar = totalRevpar;
    this.id = id;
    this.period = period ?? null;
  }
}

export class KpiRevparByPeriod implements Prisma.KpiRevparByPeriodUncheckedCreateInput {
  id?: number;
  period?: PeriodEnum | null;
  createdDate: Date;
  companyId: number;
  totalRevpar: Prisma.Decimal;

  constructor(
    createdDate: Date,
    companyId: number,
    totalRevpar: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.totalRevpar = totalRevpar;
    this.id = id;
    this.period = period ?? null;
  }
}

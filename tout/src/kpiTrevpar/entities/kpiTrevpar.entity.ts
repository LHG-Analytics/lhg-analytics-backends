import { PeriodEnum, Prisma } from '@client-online';

export class KpiTrevpar implements Prisma.KpiTrevparUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  trevpar: Prisma.Decimal;
  totalTrevpar: Prisma.Decimal;
  period?: PeriodEnum | null;
  createdDate: Date;
  companyId: number;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    trevpar: Prisma.Decimal,
    totalTrevpar: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.trevpar = trevpar;
    this.totalTrevpar = totalTrevpar;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

export class KpiTrevparByPeriod implements Prisma.KpiTrevparByPeriodUncheckedCreateInput {
  id?: number;
  totalTrevpar: Prisma.Decimal;
  period?: PeriodEnum | null;
  createdDate: Date;
  companyId: number;

  constructor(
    totalTrevpar: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalTrevpar = totalTrevpar;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

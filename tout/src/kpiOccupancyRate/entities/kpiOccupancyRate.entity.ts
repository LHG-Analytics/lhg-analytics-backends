import { PeriodEnum, Prisma } from '@client-online';

export class KpiOccupancyRate implements Prisma.KpiOccupancyRateUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  occupancyRate: Prisma.Decimal;
  totalOccupancyRate: Prisma.Decimal;
  createdDate: Date;
  period?: PeriodEnum | null;
  companyId: number;
  companyName?: string;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    occupancyRate: Prisma.Decimal,
    totalOccupancyRate: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    companyName?: string,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.occupancyRate = occupancyRate;
    this.totalOccupancyRate = totalOccupancyRate;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.companyName = companyName;
  }
}

export class KpiOccupancyRateByWeek implements Prisma.KpiOccupancyRateByWeekUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  occupancyRate: Prisma.Decimal;
  totalOccupancyRate: Prisma.Decimal;
  createdDate: Date;
  period?: PeriodEnum | null;
  companyId: number;
  companyName?: string;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    occupancyRate: Prisma.Decimal,
    totalOccupancyRate: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    companyName?: string,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.occupancyRate = occupancyRate;
    this.totalOccupancyRate = totalOccupancyRate;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.companyName = companyName;
  }
}

export class KpiOccupancyRateByPeriod
  implements Prisma.KpiOccupancyRateByPeriodUncheckedCreateInput
{
  id?: number;
  totalOccupancyRate: Prisma.Decimal;
  createdDate: Date;
  period?: PeriodEnum | null;
  companyId: number;
  companyName?: string;

  constructor(
    totalOccupancyRate: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    companyName?: string,
  ) {
    this.totalOccupancyRate = totalOccupancyRate;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.companyName = companyName;
  }
}

export class KpiOccupancyRateBySuiteCategory
  implements Prisma.KpiOccupancyRateBySuiteCategoryUncheckedCreateInput
{
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  occupancyRate: Prisma.Decimal;
  createdDate: Date;
  period?: PeriodEnum | null;
  companyId: number;
  companyName?: string;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    occupancyRate: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    companyName?: string,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.occupancyRate = occupancyRate;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.companyName = companyName;
  }
}

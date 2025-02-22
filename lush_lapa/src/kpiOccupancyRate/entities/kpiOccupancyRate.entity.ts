import { PeriodEnum, Prisma } from '../../../dist/generated/client-online';

export class KpiOccupancyRate
  implements Prisma.KpiOccupancyRateUncheckedCreateInput
{
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  occupancyRate: Prisma.Decimal;
  totalOccupancyRate: Prisma.Decimal;
  createdDate: Date;
  period?: PeriodEnum;
  companyId: number;
  companyName?: string;
}

export class KpiOccupancyRateByWeek
  implements Prisma.KpiOccupancyRateByWeekUncheckedCreateInput
{
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  occupancyRate: Prisma.Decimal;
  totalOccupancyRate: Prisma.Decimal;
  createdDate: Date;
  period?: PeriodEnum;
  companyId: number;
  companyName?: string;
}

export class KpiOccupancyRateByPeriod
  implements Prisma.KpiOccupancyRateByPeriodUncheckedCreateInput
{
  id?: number;
  totalOccupancyRate: Prisma.Decimal;
  createdDate: Date;
  period?: PeriodEnum;
  companyId: number;
  companyName?: string;
}

export class KpiOccupancyRateBySuiteCategory
  implements Prisma.KpiOccupancyRateBySuiteCategoryUncheckedCreateInput
{
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  occupancyRate: Prisma.Decimal;
  createdDate: Date;
  period?: PeriodEnum;
  companyId: number;
  companyName?: string;
}

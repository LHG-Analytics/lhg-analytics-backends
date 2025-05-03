import { PeriodEnum, Prisma } from '@client-online';

export class cleanings implements Prisma.CleaningsUncheckedCreateInput {
  id?: number;
  employeeName: string;
  totalSuitesCleanings: number;
  totalAllSuitesCleanings: number;
  totalDaysWorked: number;
  shift: string;
  averageDailyCleaning: Prisma.Decimal;
  totalAllAverageDailyCleaning: number;
  period?: PeriodEnum;
  createdDate: Date;
  companyId: number;
}

export class cleaningsByPeriod
  implements Prisma.CleaningsByPeriodUncheckedCreateInput
{
  id?: number;
  totalSuitesCleanings: number;
  createdDate: Date;
  period?: PeriodEnum;
  companyId: number;
}

export class cleaningsByWeek
  implements Prisma.CleaningsByWeekUncheckedCreateInput
{
  id?: number;
  totalAverageDailyWeekCleaning: Prisma.Decimal;
  averageDailyWeekCleaning: Prisma.Decimal;
  totalSuitesCleanings: number;
  difference: number;
  idealShiftMaid: number;
  period?: PeriodEnum;
  realShiftMaid: number;
  shift: string;
  totalAverageShiftCleaning: Prisma.Decimal;
  totalAllAverageShiftCleaning: Prisma.Decimal;
  totalDifference: number;
  totalIdealShiftMaid: number;
  totalRealShiftMaid: number;
  companyId: number;
  createdDate: Date;
}

export class cleaningsByPeriodShift
  implements Prisma.CleaningsByPeriodShiftUncheckedCreateInput
{
  id?: number;
  totalSuitesCleanings: number;
  employeeName: string;
  shift: string;
  createdDate: Date;
  period: PeriodEnum;
  companyId: number;
}

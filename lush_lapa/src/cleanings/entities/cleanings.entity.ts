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
  period?: PeriodEnum | null;
  createdDate: Date;
  companyId: number;

  constructor(
    employeeName: string,
    totalSuitesCleanings: number,
    totalAllSuitesCleanings: number,
    totalDaysWorked: number,
    shift: string,
    averageDailyCleaning: Prisma.Decimal,
    totalAllAverageDailyCleaning: number,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.employeeName = employeeName;
    this.totalSuitesCleanings = totalSuitesCleanings;
    this.totalAllSuitesCleanings = totalAllSuitesCleanings;
    this.totalDaysWorked = totalDaysWorked;
    this.shift = shift;
    this.averageDailyCleaning = averageDailyCleaning;
    this.totalAllAverageDailyCleaning = totalAllAverageDailyCleaning;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

export class cleaningsByPeriod
  implements Prisma.CleaningsByPeriodUncheckedCreateInput
{
  id?: number;
  totalSuitesCleanings: number;
  createdDate: Date;
  period?: PeriodEnum | null;
  companyId: number;

  constructor(
    totalSuitesCleanings: number,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalSuitesCleanings = totalSuitesCleanings;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
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
  period?: PeriodEnum | null;
  realShiftMaid: number;
  shift: string;
  totalAverageShiftCleaning: Prisma.Decimal;
  totalAllAverageShiftCleaning: Prisma.Decimal;
  totalDifference: number;
  totalIdealShiftMaid: number;
  totalRealShiftMaid: number;
  companyId: number;
  createdDate: Date;

  constructor(
    totalAverageDailyWeekCleaning: Prisma.Decimal,
    averageDailyWeekCleaning: Prisma.Decimal,
    totalSuitesCleanings: number,
    difference: number,
    idealShiftMaid: number,
    realShiftMaid: number,
    shift: string,
    totalAverageShiftCleaning: Prisma.Decimal,
    totalAllAverageShiftCleaning: Prisma.Decimal,
    totalDifference: number,
    totalIdealShiftMaid: number,
    totalRealShiftMaid: number,
    companyId: number,
    createdDate: Date,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalAverageDailyWeekCleaning = totalAverageDailyWeekCleaning;
    this.averageDailyWeekCleaning = averageDailyWeekCleaning;
    this.totalSuitesCleanings = totalSuitesCleanings;
    this.difference = difference;
    this.idealShiftMaid = idealShiftMaid;
    this.realShiftMaid = realShiftMaid;
    this.shift = shift;
    this.totalAverageShiftCleaning = totalAverageShiftCleaning;
    this.totalAllAverageShiftCleaning = totalAllAverageShiftCleaning;
    this.totalDifference = totalDifference;
    this.totalIdealShiftMaid = totalIdealShiftMaid;
    this.totalRealShiftMaid = totalRealShiftMaid;
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.id = id;
    this.period = period;
  }
}

export class cleaningsByPeriodShift
  implements Prisma.CleaningsByPeriodShiftUncheckedCreateInput
{
  id?: number;
  totalSuitesCleanings: number;
  employeeName: string;
  shift: string;
  createdDate: Date;
  period?: PeriodEnum | null;
  companyId: number;

  constructor(
    totalSuitesCleanings: number,
    employeeName: string,
    shift: string,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalSuitesCleanings = totalSuitesCleanings;
    this.employeeName = employeeName;
    this.shift = shift;
    this.createdDate = createdDate;
    this.period = period ?? null; // obrigatório, sem null
    this.companyId = companyId;
    this.id = id;
  }
}

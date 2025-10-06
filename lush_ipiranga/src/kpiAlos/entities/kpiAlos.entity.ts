import { PeriodEnum, Prisma } from '@client-online';

export class KpiAlos implements Prisma.KpiAlosUncheckedCreateInput {
  id?: number;
  totalAverageOccupationTime?: string | null;
  suiteCategoryId: number;
  occupationTime: string;
  createdDate: Date;
  period?: PeriodEnum | null;
  suiteCategoryName: string;
  averageOccupationTime?: string | null;
  companyId: number;

  constructor(
    suiteCategoryId: number,
    occupationTime: string,
    createdDate: Date,
    suiteCategoryName: string,
    companyId: number,
    id?: number,
    totalAverageOccupationTime?: string | null,
    period?: PeriodEnum | null,
    averageOccupationTime?: string | null,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.occupationTime = occupationTime;
    this.createdDate = createdDate;
    this.suiteCategoryName = suiteCategoryName;
    this.companyId = companyId;
    this.id = id;
    this.totalAverageOccupationTime = totalAverageOccupationTime ?? null;
    this.period = period ?? null;
    this.averageOccupationTime = averageOccupationTime ?? null;
  }
}

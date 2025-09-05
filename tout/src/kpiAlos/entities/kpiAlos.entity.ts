import { PeriodEnum, Prisma } from '@client-online';

export class KpiAlos implements Prisma.KpiAlosUncheckedCreateInput {
  id?: number;
  totalAverageOccupationTime?: string;
  suiteCategoryId: number;
  occupationTime: string;
  createdDate: Date;
  period?: PeriodEnum | null;
  suiteCategoryName: string;
  averageOccupationTime?: string;
  companyId: number;

  constructor(
    suiteCategoryId: number,
    occupationTime: string,
    createdDate: Date,
    suiteCategoryName: string,
    companyId: number,
    totalAverageOccupationTime?: string,
    period?: PeriodEnum | null,
    averageOccupationTime?: string,
    id?: number,
  ) {
    this.id = id;
    this.totalAverageOccupationTime = totalAverageOccupationTime;
    this.suiteCategoryId = suiteCategoryId;
    this.occupationTime = occupationTime;
    this.createdDate = createdDate;
    this.period = period ?? null;
    this.suiteCategoryName = suiteCategoryName;
    this.averageOccupationTime = averageOccupationTime;
    this.companyId = companyId;
  }
}

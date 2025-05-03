import { PeriodEnum, Prisma } from '@client-online';

export class KpiAlos implements Prisma.KpiAlosUncheckedCreateInput {
  id?: number;
  totalAverageOccupationTime?: string;
  suiteCategoryId: number;
  occupationTime: string;
  createdDate: Date;
  period?: PeriodEnum;
  suiteCategoryName: string;
  averageOccupationTime?: string;
  companyId: number;
}

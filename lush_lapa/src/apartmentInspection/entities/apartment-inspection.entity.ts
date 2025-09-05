import { PeriodEnum, Prisma } from '@client-online';

export class ApartmentInspection
  implements Prisma.InspectionsUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  employeeName: string;
  period?: PeriodEnum | null;
  totalInspections: number;
  totalAllInspections: number;

  constructor(
    companyId: number,
    createdDate: Date,
    employeeName: string,
    totalInspections: number,
    totalAllInspections: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.employeeName = employeeName;
    this.totalInspections = totalInspections;
    this.totalAllInspections = totalAllInspections;
    this.id = id;
    this.period = period ?? null;
  }
}

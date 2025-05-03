import { PeriodEnum, Prisma } from '@client-online';

export class apartmentInspection
  implements Prisma.InspectionsUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  employeeName: string;
  period?: PeriodEnum;
  totalInspections: number;
  totalAllInspections: number;
}

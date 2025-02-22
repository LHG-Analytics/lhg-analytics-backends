import { PeriodEnum, Prisma } from '../../../dist/generated/client-online';

export class KpiTotalRentals
  implements Prisma.KpiTotalRentalsUncheckedCreateInput
{
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  createdDate: Date;
  totalRentalsApartments?: number;
  totalBookings?: number;
  totalAllBookings?: number;
  totalAllRentalsApartments?: number;
  period?: PeriodEnum;
  companyId: number;
}

export class KpiTotalRentalsByPeriod
  implements Prisma.KpiTotalRentalsByPeriodUncheckedCreateInput
{
  id?: number;
  createdDate: Date;
  totalAllRentalsApartments?: number;
  period?: PeriodEnum;
  companyId: number;
}

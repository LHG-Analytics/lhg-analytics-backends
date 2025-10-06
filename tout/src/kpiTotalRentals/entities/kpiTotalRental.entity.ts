import { PeriodEnum, Prisma } from '@client-online';

export class KpiTotalRentals implements Prisma.KpiTotalRentalsUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  createdDate: Date;
  totalRentalsApartments?: number;
  totalBookings?: number;
  totalAllBookings?: number;
  totalAllRentalsApartments?: number;
  period?: PeriodEnum | null;
  companyId: number;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    createdDate: Date,
    companyId: number,
    id?: number,
    totalRentalsApartments?: number,
    totalBookings?: number,
    totalAllBookings?: number,
    totalAllRentalsApartments?: number,
    period?: PeriodEnum | null,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.totalRentalsApartments = totalRentalsApartments;
    this.totalBookings = totalBookings;
    this.totalAllBookings = totalAllBookings;
    this.totalAllRentalsApartments = totalAllRentalsApartments;
    this.period = period ?? null;
  }
}

export class KpiTotalRentalsByPeriod implements Prisma.KpiTotalRentalsByPeriodUncheckedCreateInput {
  id?: number;
  createdDate: Date;
  totalAllRentalsApartments?: number;
  period?: PeriodEnum | null;
  companyId: number;

  constructor(
    createdDate: Date,
    companyId: number,
    id?: number,
    totalAllRentalsApartments?: number,
    period?: PeriodEnum | null,
  ) {
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.totalAllRentalsApartments = totalAllRentalsApartments;
    this.period = period ?? null;
  }
}

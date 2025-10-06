import { PeriodEnum, Prisma } from '@client-online';

export class KpiTotalRentals implements Prisma.KpiTotalRentalsUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  createdDate: Date;
  totalRentalsApartments?: number | null;
  totalBookings?: number | null;
  totalAllBookings?: number | null;
  totalAllRentalsApartments?: number | null;
  period?: PeriodEnum | null;
  companyId: number;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    createdDate: Date,
    companyId: number,
    id?: number,
    totalRentalsApartments?: number | null,
    totalBookings?: number | null,
    totalAllBookings?: number | null,
    totalAllRentalsApartments?: number | null,
    period?: PeriodEnum | null,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.totalRentalsApartments = totalRentalsApartments ?? null;
    this.totalBookings = totalBookings ?? null;
    this.totalAllBookings = totalAllBookings ?? null;
    this.totalAllRentalsApartments = totalAllRentalsApartments ?? null;
    this.period = period ?? null;
  }
}

export class KpiTotalRentalsByPeriod implements Prisma.KpiTotalRentalsByPeriodUncheckedCreateInput {
  id?: number;
  createdDate: Date;
  totalAllRentalsApartments?: number | null;
  period?: PeriodEnum | null;
  companyId: number;

  constructor(
    createdDate: Date,
    companyId: number,
    id?: number,
    totalAllRentalsApartments?: number | null,
    period?: PeriodEnum | null,
  ) {
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.totalAllRentalsApartments = totalAllRentalsApartments ?? null;
    this.period = period ?? null;
  }
}

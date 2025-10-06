import { PeriodEnum, Prisma } from '@client-online';

export class RestaurantTicketAverage implements Prisma.RestaurantTicketAverageUncheckedCreateInput {
  id?: number;
  period?: PeriodEnum | null;
  companyId: number;
  createdDate: Date;
  totalAllTicketAverage: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    totalAllTicketAverage: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.totalAllTicketAverage = totalAllTicketAverage;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantTicketAverageByTotalRentals
  implements Prisma.RestaurantTicketAverageByTotalRentalsUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  companyId: number;
  createdDate: Date;
  totalAllTicketAverageByTotalRentals: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    totalAllTicketAverageByTotalRentals: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.totalAllTicketAverageByTotalRentals = totalAllTicketAverageByTotalRentals;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantTicketAverageByPeriod
  implements Prisma.RestaurantTicketAverageByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  companyId: number;
  createdDate: Date;
  totalTicketAverage: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    totalTicketAverage: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.totalTicketAverage = totalTicketAverage;
    this.id = id;
    this.period = period ?? null;
  }
}

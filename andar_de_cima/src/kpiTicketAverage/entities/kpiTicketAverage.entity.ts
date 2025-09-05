import { PeriodEnum, Prisma } from '@client-online';

export class KpiTicketAverage
  implements Prisma.KpiTicketAverageUncheckedCreateInput
{
  id?: number;
  ticketAverageRental: Prisma.Decimal;
  ticketAverageSale: Prisma.Decimal;
  totalTicketAverage: Prisma.Decimal;
  suiteCategoryName: string;
  suiteCategoryId: number;
  ticketAverageAllRental: Prisma.Decimal;
  ticketAverageAllSale: Prisma.Decimal;
  totalAllTicketAverage: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  period?: PeriodEnum | null;

  constructor(
    ticketAverageRental: Prisma.Decimal,
    ticketAverageSale: Prisma.Decimal,
    totalTicketAverage: Prisma.Decimal,
    suiteCategoryName: string,
    suiteCategoryId: number,
    ticketAverageAllRental: Prisma.Decimal,
    ticketAverageAllSale: Prisma.Decimal,
    totalAllTicketAverage: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.ticketAverageRental = ticketAverageRental;
    this.ticketAverageSale = ticketAverageSale;
    this.totalTicketAverage = totalTicketAverage;
    this.suiteCategoryName = suiteCategoryName;
    this.suiteCategoryId = suiteCategoryId;
    this.ticketAverageAllRental = ticketAverageAllRental;
    this.ticketAverageAllSale = ticketAverageAllSale;
    this.totalAllTicketAverage = totalAllTicketAverage;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

export class KpiTicketAverageByPeriod
  implements Prisma.KpiTicketAverageByPeriodUncheckedCreateInput
{
  id?: number;
  totalAllTicketAverage: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  period?: PeriodEnum | null;

  constructor(
    totalAllTicketAverage: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalAllTicketAverage = totalAllTicketAverage;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

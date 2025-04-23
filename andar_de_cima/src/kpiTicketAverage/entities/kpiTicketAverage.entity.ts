import { PeriodEnum, Prisma } from '../../../dist/generated/client-online';

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
  period?: PeriodEnum;
}

export class KpiTicketAverageByPeriod
  implements Prisma.KpiTicketAverageByPeriodUncheckedCreateInput
{
  id?: number;
  totalAllTicketAverage: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  period?: PeriodEnum;
}

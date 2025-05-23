import { PeriodEnum, Prisma } from '@client-online';

export class RestaurantTicketAverage
  implements Prisma.RestaurantTicketAverageUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  totalAllTicketAverage: Prisma.Decimal;
}

export class RestaurantTicketAverageByTotalRentals
  implements Prisma.RestaurantTicketAverageByTotalRentalsUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  totalAllTicketAverageByTotalRentals: Prisma.Decimal;
}

export class RestaurantTicketAverageByPeriod
  implements Prisma.RestaurantTicketAverageByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  totalTicketAverage: Prisma.Decimal;
}

import { ChannelTypeEnum, PeriodEnum, Prisma } from '@client-online';

export class BookingsTicketAverage
  implements Prisma.BookingsTicketAverageUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalAllTicketAverage: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

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

export class BookingsTicketAverageByChannelType
  implements Prisma.BookingsTicketAverageByChannelTypeUncheckedCreateInput
{
  id?: number;
  channelType?: ChannelTypeEnum | null;
  period?: PeriodEnum | null;
  createdDate: Date;
  totalTicketAverage: Prisma.Decimal;
  totalAllTicketAverage: Prisma.Decimal;
  companyId: number;

  constructor(
    createdDate: Date,
    totalTicketAverage: Prisma.Decimal,
    totalAllTicketAverage: Prisma.Decimal,
    companyId: number,
    id?: number,
    channelType?: ChannelTypeEnum | null,
    period?: PeriodEnum | null,
  ) {
    this.createdDate = createdDate;
    this.totalTicketAverage = totalTicketAverage;
    this.totalAllTicketAverage = totalAllTicketAverage;
    this.companyId = companyId;
    this.id = id;
    this.channelType = channelType ?? null;
    this.period = period ?? null;
  }
}

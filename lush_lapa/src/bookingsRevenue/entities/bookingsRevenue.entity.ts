import { ChannelTypeEnum, PeriodEnum, Prisma } from '@client-online';

export class BookingsRevenue
  implements Prisma.BookingsRevenueUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalAllValue!: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

  constructor(
    totalAllValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalAllValue = totalAllValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

export class BookingsRevenueByChannelType
  implements Prisma.BookingsRevenueByChannelTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalValue: Prisma.Decimal;
  totalAllValue!: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  channelType?: ChannelTypeEnum | null;

  constructor(
    totalValue: Prisma.Decimal,
    totalAllValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    channelType?: ChannelTypeEnum | null,
  ) {
    this.totalValue = totalValue;
    this.totalAllValue = totalAllValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.channelType = channelType ?? null;
  }
}

export class BookingsRevenueByPeriod
  implements Prisma.BookingsRevenueByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

  constructor(
    totalValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalValue = totalValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

export class BookingsRevenueByPayment
  implements Prisma.BookingsRevenueByPaymentUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  channelType?: ChannelTypeEnum | null;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  paymentMethod: string;

  constructor(
    totalValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    paymentMethod: string,
    id?: number,
    period?: PeriodEnum | null,
    channelType?: ChannelTypeEnum | null,
  ) {
    this.totalValue = totalValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.paymentMethod = paymentMethod;
    this.id = id;
    this.period = period ?? null;
    this.channelType = channelType ?? null;
  }
}

export class BookingsRevenueByPeriodEcommerce
  implements Prisma.BookingsRevenueByPeriodEcommerceUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  channelType?: ChannelTypeEnum | null;

  constructor(
    totalValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    channelType?: ChannelTypeEnum | null,
  ) {
    this.totalValue = totalValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.channelType = channelType ?? null;
  }
}

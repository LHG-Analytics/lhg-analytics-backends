import { ChannelTypeEnum, PeriodEnum, Prisma } from '@client-online';

export class BookingsRevenue
  implements Prisma.BookingsRevenueUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalAllValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

export class BookingsRevenueByChannelType
  implements Prisma.BookingsRevenueByChannelTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalValue: Prisma.Decimal;
  totalAllValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  channelType?: ChannelTypeEnum;
}

export class BookingsRevenueByPeriod
  implements Prisma.BookingsRevenueByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

export class BookingsRevenueByPayment
  implements Prisma.BookingsRevenueByPaymentUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  channelType?: ChannelTypeEnum;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  paymentMethod: string;
}

export class BookingsRevenueByPeriodEcommerce
  implements Prisma.BookingsRevenueByPeriodEcommerceUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  channelType?: ChannelTypeEnum;
}

import {
  ChannelTypeEnum,
  PeriodEnum,
  Prisma,
  RentalTypeEnum,
} from '../../../dist/generated/client-online';

export class BookingsRevenue
  implements Prisma.BookingsRevenueUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  rentalType?: RentalTypeEnum;
  totalAllValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

export class BookingsRevenueByChannelType
  implements Prisma.BookingsByChannelTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  rentalType?: RentalTypeEnum;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  channelType?: ChannelTypeEnum;
  totalAllValue: Prisma.Decimal;
}

export class BookingsRevenueByPeriod
  implements Prisma.BookingsRevenueByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  rentalType?: RentalTypeEnum;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  channelType?: ChannelTypeEnum;
}

export class BookingsRevenueByPayment
  implements Prisma.BookingsRevenueByPaymentUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  rentalType?: RentalTypeEnum;
  channelType?: ChannelTypeEnum;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  paymentMethod: string;
}

import {
  ChannelTypeEnum,
  PeriodEnum,
  Prisma,
  RentalTypeEnum,
} from '@client-online';

export class BookingsTotalRental
  implements Prisma.BookingsTotalRentalsUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalAllBookings: number;
  createdDate: Date;
  companyId: number;

  constructor(
    totalAllBookings: number,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalAllBookings = totalAllBookings;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

export class BookingsTotalRentalByRentalType
  implements Prisma.BookingsTotalRentalsByRentalTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  rentalType?: RentalTypeEnum | null;
  totalBookings: number;
  createdDate: Date;
  companyId: number;

  constructor(
    totalBookings: number,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    rentalType?: RentalTypeEnum | null,
  ) {
    this.totalBookings = totalBookings;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.rentalType = rentalType ?? null;
  }
}

export class BookingsTotalRentalByPeriod
  implements Prisma.BookingsTotalRentalsByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalBookings: number;
  createdDate: Date;
  companyId: number;

  constructor(
    totalBookings: number,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalBookings = totalBookings;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

export class BookingsTotalRentalByChannelType
  implements Prisma.BookingsTotalRentalsByChannelTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  channelType?: ChannelTypeEnum | null;
  totalBookings: number;
  totalAllBookings: number;
  createdDate: Date;
  companyId: number;

  constructor(
    totalBookings: number,
    totalAllBookings: number,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    channelType?: ChannelTypeEnum | null,
  ) {
    this.totalBookings = totalBookings;
    this.totalAllBookings = totalAllBookings;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.channelType = channelType ?? null;
  }
}

export class BookingsTotalRentalsByPeriodEcommerce
  implements Prisma.BookingsTotalRentalsByPeriodEcommerceUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  channelType?: ChannelTypeEnum | null;
  totalBookings: number;
  createdDate: Date;
  companyId: number;

  constructor(
    totalBookings: number,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    channelType?: ChannelTypeEnum | null,
  ) {
    this.totalBookings = totalBookings;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.channelType = channelType ?? null;
  }
}

import {
  PeriodEnum,
  RentalTypeEnum,
  Prisma,
  ChannelTypeEnum,
} from '../../../dist/generated/client-online';

export class BookingsTotalRental
  implements Prisma.BookingsTotalRentalsUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalAllBookings: number;
  createdDate: Date;
  companyId: number;
}

export class BookingsTotalRentalByRentalType
  implements Prisma.BookingsTotalRentalsByRentalTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  rentalType?: RentalTypeEnum;
  totalBookings: number;
  createdDate: Date;
  companyId: number;
}

export class BookingsTotalRentalByPeriod
  implements Prisma.BookingsTotalRentalsByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalBookings: number;
  createdDate: Date;
  companyId: number;
}

export class BookingsTotalRentalByChannelType
  implements Prisma.BookingsTotalRentalsByChannelTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  channelType?: ChannelTypeEnum;
  totalBookings: number;
  totalAllBookings: number;
  createdDate: Date;
  companyId: number;
}

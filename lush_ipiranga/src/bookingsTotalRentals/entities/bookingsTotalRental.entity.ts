import {
  PeriodEnum,
  Prisma,
  RentalTypeEnum,
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

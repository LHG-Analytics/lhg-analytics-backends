import {
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

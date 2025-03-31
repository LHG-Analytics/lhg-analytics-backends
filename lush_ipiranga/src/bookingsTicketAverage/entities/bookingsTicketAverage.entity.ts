import { DecimalJsLike } from 'dist/generated/client-online/runtime/library';
import {
  ChannelTypeEnum,
  PeriodEnum,
  Prisma,
} from '../../../dist/generated/client-online';

export class BookingsTicketAverage
  implements Prisma.BookingsTicketAverageUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalAllTicketAverage: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

export class BookingsTicketAverageByChannelType
  implements Prisma.BookingsTicketAverageByChannelTypeUncheckedCreateInput
{
  id?: number;
  channelType?: ChannelTypeEnum;
  period?: PeriodEnum;
  createdDate: Date;
  totalTicketAverage: Prisma.Decimal;
  totalAllTicketAverage: Prisma.Decimal;
  companyId: number;
}

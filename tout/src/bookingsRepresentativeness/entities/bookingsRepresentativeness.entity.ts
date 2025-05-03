import { ChannelTypeEnum, PeriodEnum, Prisma } from '@client-online';

export class BookingsRepresentativeness
  implements Prisma.BookingsRepresentativenessUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalAllRepresentativeness: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

export class BookingsRepresentativenessByPeriod
  implements Prisma.BookingsRepresentativenessByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalRepresentativeness: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

export class BookingsRepresentativenessByChannelType
  implements Prisma.BookingsRepresentativenessByChannelTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  channelType?: ChannelTypeEnum;
  totalRepresentativeness: Prisma.Decimal;
  totalAllRepresentativeness: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

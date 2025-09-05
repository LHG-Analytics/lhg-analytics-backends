import { ChannelTypeEnum, PeriodEnum, Prisma } from '@client-online';

export class BookingsRepresentativeness
  implements Prisma.BookingsRepresentativenessUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalAllRepresentativeness: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

  constructor(
    totalAllRepresentativeness: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalAllRepresentativeness = totalAllRepresentativeness;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

export class BookingsRepresentativenessByPeriod
  implements Prisma.BookingsRepresentativenessByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalRepresentativeness: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

  constructor(
    totalRepresentativeness: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalRepresentativeness = totalRepresentativeness;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

export class BookingsRepresentativenessByChannelType
  implements Prisma.BookingsRepresentativenessByChannelTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  channelType?: ChannelTypeEnum | null;
  totalRepresentativeness: Prisma.Decimal;
  totalAllRepresentativeness: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

  constructor(
    totalRepresentativeness: Prisma.Decimal,
    totalAllRepresentativeness: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    channelType?: ChannelTypeEnum | null,
  ) {
    this.totalRepresentativeness = totalRepresentativeness;
    this.totalAllRepresentativeness = totalAllRepresentativeness;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.channelType = channelType ?? null;
  }
}
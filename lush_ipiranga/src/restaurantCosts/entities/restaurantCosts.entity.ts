import { PeriodEnum, Prisma } from '@client-online';

export class RestaurantCosts
  implements Prisma.RestaurantCMVUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalAllCMV: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
  restaurantId?: number | null;

  constructor(
    totalAllCMV: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    restaurantId?: number | null,
  ) {
    this.totalAllCMV = totalAllCMV;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period;
    this.restaurantId = restaurantId;
  }
}

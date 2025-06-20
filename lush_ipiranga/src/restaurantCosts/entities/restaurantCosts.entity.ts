import { PeriodEnum, Prisma } from '@client-online';

export class RestaurantCosts
  implements Prisma.RestaurantCMVUncheckedCreateInput
{
  id?: number;
  period: PeriodEnum;
  totalAllCMV: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

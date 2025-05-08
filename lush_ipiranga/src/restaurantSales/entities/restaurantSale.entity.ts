import { PeriodEnum, Prisma } from '@client-online';

export class RestaurantSales
  implements Prisma.RestaurantSalesUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  totalAllSales: number;
}

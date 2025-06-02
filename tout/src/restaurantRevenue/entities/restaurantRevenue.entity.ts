import { ConsumptionGroup, PeriodEnum, Prisma } from '@client-online';

export class RestaurantRevenue
  implements Prisma.RestaurantRevenueUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  totalAllValue: Prisma.Decimal;
}

export class RestaurantRevenueByPeriod
  implements Prisma.RestaurantRevenueByPeriodUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  period?: PeriodEnum;
  totalValue: Prisma.Decimal;
}

export class RestaurantRevenueByPeriodPercent
  implements Prisma.RestaurantRevenueByPeriodPercentUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  period?: PeriodEnum;
  totalValuePercent: Prisma.Decimal;
}

export class RestaurantRevenueByGroupByPeriod
  implements Prisma.RestaurantRevenueByGroupByPeriodUncheckedCreateInput
{
  id?: number;
  companyId: number;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  consumptionGroup: ConsumptionGroup;
  period?: PeriodEnum;
}

export class RestaurantRevenueByFoodCategory
  implements Prisma.RestaurantRevenueByFoodCategoryUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  foodCategory: string;
  period?: PeriodEnum;
  totalValue: Prisma.Decimal;
  totalAllValue: Prisma.Decimal;
  totalValuePercent: Prisma.Decimal;
}

export class RestaurantRevenueByDrinkCategory
  implements Prisma.RestaurantRevenueByDrinkCategoryUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  drinkCategory: string;
  period?: PeriodEnum;
  totalValue: Prisma.Decimal;
  totalAllValue: Prisma.Decimal;
  totalValuePercent: Prisma.Decimal;
}

export class RestaurantRevenueByOthersCategory
  implements Prisma.RestaurantRevenueByOthersCategoryUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  othersCategory: string;
  period?: PeriodEnum;
  totalValue: Prisma.Decimal;
  totalAllValue: Prisma.Decimal;
  totalValuePercent: Prisma.Decimal;
}

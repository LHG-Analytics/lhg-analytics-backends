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

export class RestaurantSalesRanking
  implements Prisma.RestaurantSalesRankingUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  productName: string;
  totalSales: number;
}

export class RestaurantSalesByFoodCategory
  implements Prisma.RestaurantSalesByFoodCategoryUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  foodCategory: string;
  totalSales: number;
  totalAllSales: number;
  totalSalesPercent: Prisma.Decimal;
}

export class RestaurantSalesByDrinkCategory
  implements Prisma.RestaurantSalesByDrinkCategoryUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  drinkCategory: string;
  totalSale: number;
  totalAllSales: number;
  totalSalePercent: Prisma.Decimal;
}

export class RestaurantSalesByOthersCategory
  implements Prisma.RestaurantSalesByOthersCategoryUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  totalAllSales: number;
  othersCategory: string;
  totalSales: number;
  totalSalesPercent: Prisma.Decimal;
}

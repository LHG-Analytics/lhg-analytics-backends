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
}

export class RestaurantSalesByFoodCategoryPercent
  implements Prisma.RestaurantSalesByFoodCategoryPercentUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  foodCategory: string;
  totalSalesPercent: number;
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
}

export class RestaurantSalesByDrinkCategoryPercent
  implements Prisma.RestaurantSalesByDrinkCategoryPercentUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  drinkCategory: string;
  totalSalePercent: number;
}

export class RestaurantSalesByOthersCategory
  implements Prisma.RestaurantSalesByOthersCategoryUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  othersCategory: string;
  totalSales: number;
}

export class RestaurantSalesByOthersCategoryPercent
  implements Prisma.RestaurantSalesByOthersCategoryPercentUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  companyId: number;
  createdDate: Date;
  othersCategory: string;
  totalSalesPercent: number;
}

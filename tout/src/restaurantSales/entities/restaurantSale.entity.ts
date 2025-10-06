import { PeriodEnum, Prisma } from '@client-online';

export class RestaurantSales implements Prisma.RestaurantSalesUncheckedCreateInput {
  id?: number;
  period?: PeriodEnum | null;
  companyId: number;
  createdDate: Date;
  totalAllSales: number;

  constructor(
    companyId: number,
    createdDate: Date,
    totalAllSales: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.totalAllSales = totalAllSales;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantSalesRanking implements Prisma.RestaurantSalesRankingUncheckedCreateInput {
  id?: number;
  period?: PeriodEnum | null;
  companyId: number;
  createdDate: Date;
  productName: string;
  totalSales: number;

  constructor(
    companyId: number,
    createdDate: Date,
    productName: string,
    totalSales: number,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.productName = productName;
    this.totalSales = totalSales;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantSalesByFoodCategory
  implements Prisma.RestaurantSalesByFoodCategoryUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  companyId: number;
  createdDate: Date;
  foodCategory: string;
  totalSales: number;
  totalAllSales: number;
  totalSalesPercent: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    foodCategory: string,
    totalSales: number,
    totalAllSales: number,
    totalSalesPercent: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.foodCategory = foodCategory;
    this.totalSales = totalSales;
    this.totalAllSales = totalAllSales;
    this.totalSalesPercent = totalSalesPercent;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantSalesByDrinkCategory
  implements Prisma.RestaurantSalesByDrinkCategoryUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  companyId: number;
  createdDate: Date;
  drinkCategory: string;
  totalSale: number;
  totalAllSales: number;
  totalSalePercent: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    drinkCategory: string,
    totalSale: number,
    totalAllSales: number,
    totalSalePercent: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.drinkCategory = drinkCategory;
    this.totalSale = totalSale;
    this.totalAllSales = totalAllSales;
    this.totalSalePercent = totalSalePercent;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantSalesByOthersCategory
  implements Prisma.RestaurantSalesByOthersCategoryUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  companyId: number;
  createdDate: Date;
  totalAllSales: number;
  othersCategory: string;
  totalSales: number;
  totalSalesPercent: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    totalAllSales: number,
    othersCategory: string,
    totalSales: number,
    totalSalesPercent: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.totalAllSales = totalAllSales;
    this.othersCategory = othersCategory;
    this.totalSales = totalSales;
    this.totalSalesPercent = totalSalesPercent;
    this.id = id;
    this.period = period ?? null;
  }
}

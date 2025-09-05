import { ConsumptionGroup, PeriodEnum, Prisma } from '@client-online';

export class RestaurantRevenue
  implements Prisma.RestaurantRevenueUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  companyId: number;
  createdDate: Date;
  totalAllValue: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    totalAllValue: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.totalAllValue = totalAllValue;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantRevenueByPeriod
  implements Prisma.RestaurantRevenueByPeriodUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  period?: PeriodEnum | null;
  totalValue: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    totalValue: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.totalValue = totalValue;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantRevenueByPeriodPercent
  implements Prisma.RestaurantRevenueByPeriodPercentUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  period?: PeriodEnum | null;
  totalValuePercent: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    totalValuePercent: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.totalValuePercent = totalValuePercent;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantRevenueByGroupByPeriod
  implements Prisma.RestaurantRevenueByGroupByPeriodUncheckedCreateInput
{
  id?: number;
  companyId: number;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  consumptionGroup: ConsumptionGroup;
  period?: PeriodEnum | null;

  constructor(
    companyId: number,
    totalValue: Prisma.Decimal,
    createdDate: Date,
    consumptionGroup: ConsumptionGroup,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.totalValue = totalValue;
    this.createdDate = createdDate;
    this.consumptionGroup = consumptionGroup;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantRevenueByFoodCategory
  implements Prisma.RestaurantRevenueByFoodCategoryUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  foodCategory: string;
  period?: PeriodEnum | null;
  totalValue: Prisma.Decimal;
  totalAllValue: Prisma.Decimal;
  totalValuePercent: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    foodCategory: string,
    totalValue: Prisma.Decimal,
    totalAllValue: Prisma.Decimal,
    totalValuePercent: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.foodCategory = foodCategory;
    this.totalValue = totalValue;
    this.totalAllValue = totalAllValue;
    this.totalValuePercent = totalValuePercent;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantRevenueByDrinkCategory
  implements Prisma.RestaurantRevenueByDrinkCategoryUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  drinkCategory: string;
  period?: PeriodEnum | null;
  totalValue: Prisma.Decimal;
  totalAllValue: Prisma.Decimal;
  totalValuePercent: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    drinkCategory: string,
    totalValue: Prisma.Decimal,
    totalAllValue: Prisma.Decimal,
    totalValuePercent: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.drinkCategory = drinkCategory;
    this.totalValue = totalValue;
    this.totalAllValue = totalAllValue;
    this.totalValuePercent = totalValuePercent;
    this.id = id;
    this.period = period ?? null;
  }
}

export class RestaurantRevenueByOthersCategory
  implements Prisma.RestaurantRevenueByOthersCategoryUncheckedCreateInput
{
  id?: number;
  companyId: number;
  createdDate: Date;
  othersCategory: string;
  period?: PeriodEnum | null;
  totalValue: Prisma.Decimal;
  totalAllValue: Prisma.Decimal;
  totalValuePercent: Prisma.Decimal;

  constructor(
    companyId: number,
    createdDate: Date,
    othersCategory: string,
    totalValue: Prisma.Decimal,
    totalAllValue: Prisma.Decimal,
    totalValuePercent: Prisma.Decimal,
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.companyId = companyId;
    this.createdDate = createdDate;
    this.othersCategory = othersCategory;
    this.totalValue = totalValue;
    this.totalAllValue = totalAllValue;
    this.totalValuePercent = totalValuePercent;
    this.id = id;
    this.period = period ?? null;
  }
}

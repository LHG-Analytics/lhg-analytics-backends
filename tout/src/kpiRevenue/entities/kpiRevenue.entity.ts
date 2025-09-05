import { PeriodEnum, Prisma, RentalTypeEnum } from '@client-online';

export class KpiRevenue implements Prisma.KpiRevenueUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  permanenceValueTotal: Prisma.Decimal;
  permanenceValueLiquid: Prisma.Decimal;
  period?: PeriodEnum | null;
  rentalType?: RentalTypeEnum;
  priceSale?: Prisma.Decimal;
  discountRental?: Prisma.Decimal;
  discountSale: Prisma.Decimal;
  totalDiscount: Prisma.Decimal;
  stockOutItemId?: number[];
  totalSaleDirect: Prisma.Decimal;
  totalValue: Prisma.Decimal;
  totalAllValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

  constructor(
    suiteCategoryId: number,
    suiteCategoryName: string,
    permanenceValueTotal: Prisma.Decimal,
    permanenceValueLiquid: Prisma.Decimal,
    discountSale: Prisma.Decimal,
    totalDiscount: Prisma.Decimal,
    totalSaleDirect: Prisma.Decimal,
    totalValue: Prisma.Decimal,
    totalAllValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    period?: PeriodEnum | null,
    rentalType?: RentalTypeEnum,
    priceSale?: Prisma.Decimal,
    discountRental?: Prisma.Decimal,
    stockOutItemId?: number[],
    id?: number,
  ) {
    this.id = id;
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.permanenceValueTotal = permanenceValueTotal;
    this.permanenceValueLiquid = permanenceValueLiquid;
    this.period = period ?? null;
    this.rentalType = rentalType;
    this.priceSale = priceSale;
    this.discountRental = discountRental;
    this.discountSale = discountSale;
    this.totalDiscount = totalDiscount;
    this.stockOutItemId = stockOutItemId;
    this.totalSaleDirect = totalSaleDirect;
    this.totalValue = totalValue;
    this.totalAllValue = totalAllValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
  }
}

export class KpiRevenueByRentalType
  implements Prisma.KpiRevenueByRentalTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  rentalType?: RentalTypeEnum;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

  constructor(
    totalValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    period?: PeriodEnum | null,
    rentalType?: RentalTypeEnum,
    id?: number,
  ) {
    this.id = id;
    this.period = period ?? null;
    this.rentalType = rentalType;
    this.totalValue = totalValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
  }
}

export class KpiRevenueByPeriod
  implements Prisma.KpiRevenueByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

  constructor(
    totalValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    period?: PeriodEnum | null,
    id?: number,
  ) {
    this.id = id;
    this.period = period ?? null;
    this.totalValue = totalValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
  }
}

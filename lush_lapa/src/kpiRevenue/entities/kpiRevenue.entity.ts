import { PeriodEnum, Prisma, RentalTypeEnum } from '@client-online';

export class KpiRevenue implements Prisma.KpiRevenueUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  permanenceValueTotal: Prisma.Decimal;
  permanenceValueLiquid: Prisma.Decimal;
  period?: PeriodEnum | null;
  rentalType?: RentalTypeEnum | null;
  priceSale?: Prisma.Decimal | null;
  discountRental?: Prisma.Decimal | null;
  discountSale: Prisma.Decimal;
  totalDiscount: Prisma.Decimal;
  stockOutItemId?: number[] | null;
  totalSaleDirect: Prisma.Decimal;
  totalValue: Prisma.Decimal;
  totalAllValue!: Prisma.Decimal;
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
    id?: number,
    period?: PeriodEnum | null,
    rentalType?: RentalTypeEnum | null,
    priceSale?: Prisma.Decimal | null,
    discountRental?: Prisma.Decimal,
    stockOutItemId?: number[] | null,
  ) {
    this.suiteCategoryId = suiteCategoryId;
    this.suiteCategoryName = suiteCategoryName;
    this.permanenceValueTotal = permanenceValueTotal;
    this.permanenceValueLiquid = permanenceValueLiquid;
    this.discountSale = discountSale;
    this.totalDiscount = totalDiscount;
    this.totalSaleDirect = totalSaleDirect;
    this.totalValue = totalValue;
    this.totalAllValue = totalAllValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.rentalType = rentalType ?? null;
    this.priceSale = priceSale ?? null;
    this.discountRental = discountRental ?? null;
    this.stockOutItemId = stockOutItemId ?? null;
  }
}

export class KpiRevenueByRentalType
  implements Prisma.KpiRevenueByRentalTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum | null;
  rentalType?: RentalTypeEnum | null;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;

  constructor(
    totalValue: Prisma.Decimal,
    createdDate: Date,
    companyId: number,
    id?: number,
    period?: PeriodEnum | null,
    rentalType?: RentalTypeEnum | null,
  ) {
    this.totalValue = totalValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
    this.rentalType = rentalType ?? null;
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
    id?: number,
    period?: PeriodEnum | null,
  ) {
    this.totalValue = totalValue;
    this.createdDate = createdDate;
    this.companyId = companyId;
    this.id = id;
    this.period = period ?? null;
  }
}

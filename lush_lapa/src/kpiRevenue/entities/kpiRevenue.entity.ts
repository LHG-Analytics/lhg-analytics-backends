import { PeriodEnum, Prisma, RentalTypeEnum } from '@client-online';

export class KpiRevenue implements Prisma.KpiRevenueUncheckedCreateInput {
  id?: number;
  suiteCategoryId: number;
  suiteCategoryName: string;
  permanenceValueTotal: Prisma.Decimal;
  permanenceValueLiquid: Prisma.Decimal;
  period?: PeriodEnum;
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
}

export class KpiRevenueByRentalType
  implements Prisma.KpiRevenueByRentalTypeUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  rentalType?: RentalTypeEnum;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

export class KpiRevenueByPeriod
  implements Prisma.KpiRevenueByPeriodUncheckedCreateInput
{
  id?: number;
  period?: PeriodEnum;
  totalValue: Prisma.Decimal;
  createdDate: Date;
  companyId: number;
}

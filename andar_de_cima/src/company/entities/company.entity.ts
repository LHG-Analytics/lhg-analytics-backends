import { Prisma } from '@client-online';

export class Company implements Prisma.CompanyUncheckedCreateInput {
  id: number;
  name: string;
  kpiRevenues?: Prisma.KpiRevenueUncheckedCreateNestedManyWithoutCompanyInput;
  kpiTotalRentals?: Prisma.KpiTotalRentalsUncheckedCreateNestedManyWithoutCompanyInput;
  kpiTicketAverages?: Prisma.KpiTicketAverageUncheckedCreateNestedManyWithoutCompanyInput;
  kpiAlos?: Prisma.KpiAlosUncheckedCreateNestedManyWithoutCompanyInput;
  KpiOccupancyRates?: Prisma.KpiOccupancyRateUncheckedCreateNestedManyWithoutCompanyInput;
  KpiGiros?: Prisma.KpiGiroUncheckedCreateNestedManyWithoutCompanyInput;
  KpiRevpars?: Prisma.KpiRevparUncheckedCreateNestedManyWithoutCompanyInput;
  KpiTrevpars?: Prisma.KpiTrevparUncheckedCreateNestedManyWithoutCompanyInput;

  constructor(
    id: number,
    name: string,
    kpiRevenues?: Prisma.KpiRevenueUncheckedCreateNestedManyWithoutCompanyInput,
    kpiTotalRentals?: Prisma.KpiTotalRentalsUncheckedCreateNestedManyWithoutCompanyInput,
    kpiTicketAverages?: Prisma.KpiTicketAverageUncheckedCreateNestedManyWithoutCompanyInput,
    kpiAlos?: Prisma.KpiAlosUncheckedCreateNestedManyWithoutCompanyInput,
    KpiOccupancyRates?: Prisma.KpiOccupancyRateUncheckedCreateNestedManyWithoutCompanyInput,
    KpiGiros?: Prisma.KpiGiroUncheckedCreateNestedManyWithoutCompanyInput,
    KpiRevpars?: Prisma.KpiRevparUncheckedCreateNestedManyWithoutCompanyInput,
    KpiTrevpars?: Prisma.KpiTrevparUncheckedCreateNestedManyWithoutCompanyInput,
  ) {
    this.id = id;
    this.name = name;
    this.kpiRevenues = kpiRevenues;
    this.kpiTotalRentals = kpiTotalRentals;
    this.kpiTicketAverages = kpiTicketAverages;
    this.kpiAlos = kpiAlos;
    this.KpiOccupancyRates = KpiOccupancyRates;
    this.KpiGiros = KpiGiros;
    this.KpiRevpars = KpiRevpars;
    this.KpiTrevpars = KpiTrevpars;
  }
}

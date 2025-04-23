import { Prisma } from '../../../dist/generated/client-online';

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
}

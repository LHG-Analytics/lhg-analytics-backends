import { Prisma } from '@client-online';

export class Governance implements Prisma.GovernanceUncheckedCreateInput {
  id?: number;
  Cleanings?: Prisma.CleaningsUncheckedCreateNestedManyWithoutGovernanceInput;
  CleaningsByPeriod?: Prisma.CleaningsByPeriodUncheckedCreateNestedManyWithoutGovernanceInput;
  CleaningsByWeek?: Prisma.CleaningsByWeekUncheckedCreateNestedManyWithoutGovernanceInput;
  Inspections?: Prisma.InspectionsUncheckedCreateNestedManyWithoutGovernanceInput;
  companyId: number;

  constructor(
    companyId: number,
    id?: number,
    Cleanings?: Prisma.CleaningsUncheckedCreateNestedManyWithoutGovernanceInput,
    CleaningsByPeriod?: Prisma.CleaningsByPeriodUncheckedCreateNestedManyWithoutGovernanceInput,
    CleaningsByWeek?: Prisma.CleaningsByWeekUncheckedCreateNestedManyWithoutGovernanceInput,
    Inspections?: Prisma.InspectionsUncheckedCreateNestedManyWithoutGovernanceInput,
  ) {
    this.companyId = companyId;
    this.id = id;
    this.Cleanings = Cleanings;
    this.CleaningsByPeriod = CleaningsByPeriod;
    this.CleaningsByWeek = CleaningsByWeek;
    this.Inspections = Inspections;
  }
}

import { Prisma } from '../../../dist/generated/client-online';

export class Governance implements Prisma.GovernanceUncheckedCreateInput {
  id?: number;
  Cleanings?: Prisma.CleaningsUncheckedCreateNestedManyWithoutGovernanceInput;
  CleaningsByPeriod?: Prisma.CleaningsByPeriodUncheckedCreateNestedManyWithoutGovernanceInput;
  CleaningsByWeek?: Prisma.CleaningsByWeekUncheckedCreateNestedManyWithoutGovernanceInput;
  Inspections?: Prisma.InspectionsUncheckedCreateNestedManyWithoutGovernanceInput;
  companyId: number;
}

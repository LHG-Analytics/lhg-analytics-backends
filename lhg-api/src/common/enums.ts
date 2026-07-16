// Enums locais que substituem os do Prisma Online deletado
export enum PeriodEnum {
  LAST_7_D = 'LAST_7_D',
  LAST_30_D = 'LAST_30_D',
  LAST_6_M = 'LAST_6_M',
}

export enum RentalTypeEnum {
  THREE_HOURS = 'THREE_HOURS',
  SIX_HOURS = 'SIX_HOURS',
  TWELVE_HOURS = 'TWELVE_HOURS',
  DAY_USE = 'DAY_USE',
  OVERNIGHT = 'OVERNIGHT',
  DAILY = 'DAILY',
}

export enum ChannelTypeEnum {
  WEBSITE_IMMEDIATE = 'WEBSITE_IMMEDIATE',
  WEBSITE_SCHEDULED = 'WEBSITE_SCHEDULED',
  INTERNAL = 'INTERNAL',
  GUIA_GO = 'GUIA_GO',
  GUIA_SCHEDULED = 'GUIA_SCHEDULED',
  BOOKING = 'BOOKING',
  EXPEDIA = 'EXPEDIA',
}

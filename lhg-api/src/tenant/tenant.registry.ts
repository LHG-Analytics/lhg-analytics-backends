/**
 * Registry das unidades (tenants).
 *
 * Fonte dos valores: inventário completo dos 6 backends por unidade
 * (docs/MIGRATION-MULTI-TENANT.md, seção 2.5) — validado em 2026-07-16.
 *
 * Para adicionar uma unidade (ex.: Goiânia):
 *   1. Adicionar a entrada aqui (IDs descobertos com as queries de diagnóstico do plano).
 *   2. Definir a env var DATABASE_URL_LOCAL_<UNIT> no ambiente.
 *   3. Adicionar o valor ao enum UserUnit no serviço authentication (migration Supabase).
 */
import { TenantConfig, RentalTypeThreshold } from './tenant.interfaces';

const TOLERANCE = 15 * 60; // 15 min de tolerância, igual ao código atual

/** Padrão da maioria das unidades: 3h / 6h / 12h (+DAY_USE/OVERNIGHT/DAILY resolvidos à parte) */
const DEFAULT_RENTAL_TYPES: RentalTypeThreshold[] = [
  { type: 'THREE_HOURS', maxSeconds: 3 * 3600 + TOLERANCE },
  { type: 'SIX_HOURS', maxSeconds: 6 * 3600 + TOLERANCE },
  { type: 'TWELVE_HOURS', maxSeconds: 12 * 3600 + TOLERANCE },
];

/** Altana: períodos de 1h / 2h / 4h / 12h */
const ALTANA_RENTAL_TYPES: RentalTypeThreshold[] = [
  { type: 'ONE_HOUR', maxSeconds: 1 * 3600 + TOLERANCE },
  { type: 'TWO_HOURS', maxSeconds: 2 * 3600 + TOLERANCE },
  { type: 'FOUR_HOURS', maxSeconds: 4 * 3600 + TOLERANCE },
  { type: 'TWELVE_HOURS', maxSeconds: 12 * 3600 + TOLERANCE },
];

/** CASE de rental type do BillingRentalType (company) — padrão Lush (3/6/12 + horários) */
const DEFAULT_BILLING_RENTAL_TYPE = {
  sqlCaseBody: `
          WHEN EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao) / 3600 BETWEEN 5.5 AND 6.5 THEN 'SIX_HOURS'
          WHEN EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao) / 3600 BETWEEN 11.5 AND 12.5 THEN 'TWELVE_HOURS'
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) = 13 THEN 'DAY_USE'
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) = 15 THEN 'DAILY'
          WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) = 20 THEN 'OVERNIGHT'
          ELSE 'THREE_HOURS'`,
  types: [
    { key: 'THREE_HOURS', label: '3 Horas' },
    { key: 'SIX_HOURS', label: '6 Horas' },
    { key: 'TWELVE_HOURS', label: '12 Horas' },
    { key: 'DAY_USE', label: 'Dayuse' },
    { key: 'DAILY', label: 'Diária' },
    { key: 'OVERNIGHT', label: 'Pernoite' },
  ],
};

/** Altana: 1h/2h/4h/12h por duração pura */
const ALTANA_BILLING_RENTAL_TYPE = {
  sqlCaseBody: `
          WHEN EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao) / 3600 <= 1.25 THEN 'ONE_HOUR'
          WHEN EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao) / 3600 <= 2.25 THEN 'TWO_HOURS'
          WHEN EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao) / 3600 <= 4.25 THEN 'FOUR_HOURS'
          ELSE 'TWELVE_HOURS'`,
  types: [
    { key: 'ONE_HOUR', label: '1 Hora' },
    { key: 'TWO_HOURS', label: '2 Horas' },
    { key: 'FOUR_HOURS', label: '4 Horas' },
    { key: 'TWELVE_HOURS', label: '12 Horas' },
  ],
};

/** Canais do BillingPerChannel — padrão (5 unidades) */
const DEFAULT_BOOKING_CHANNELS = [
  'EXPEDIA',
  'BOOKING',
  'GUIA_SCHEDULED',
  'GUIA_GO',
  'INTERNAL',
  'WEBSITE_IMMEDIATE',
  'WEBSITE_SCHEDULED',
];

export const TENANTS: Record<string, TenantConfig> = {
  lush_ipiranga: {
    slug: 'lush_ipiranga',
    unitEnum: 'LUSH_IPIRANGA',
    displayName: 'Lush Ipiranga',
    databaseUrlEnv: 'DATABASE_URL_LOCAL_IPIRANGA',
    suiteCategoryIds: [10, 11, 12, 15, 16, 17, 18, 19, 24],
    governance: {
      camareirasCargoIds: [4, 45],
      supervisorCargoId: 24,
      terceirizados: { kind: 'byEmployeeIds', ids: [998548, 1047691, 1047692] },
      teamSizingCargoIds: [4],
      excludedEmployeeIds: [1047694, 20388],
    },
    restaurant: {
      abProductTypeIds: [78, 64, 77, 57, 56, 79, 54, 55, 80, 53, 62, 59, 61, 58, 63],
      aProductTypeIds: [78, 64, 77, 57, 62, 59, 61, 58, 63],
      bProductTypeIds: [56, 79, 54, 55, 80, 53],
      aRankingIds: [64, 57, 62, 59, 61, 58],
      bRankingIds: [56, 79, 54, 55, 80, 53],
      aLeastRankingIds: [64, 62, 59, 61, 58],
      bLeastRankingIds: [56, 79, 54, 55, 80, 53],
    },
    rentalTypes: DEFAULT_RENTAL_TYPES,
    extendedRentalRules: true,
    billingRentalType: DEFAULT_BILLING_RENTAL_TYPE,
    bookingChannels: DEFAULT_BOOKING_CHANNELS,
  },

  lush_lapa: {
    slug: 'lush_lapa',
    unitEnum: 'LUSH_LAPA',
    displayName: 'Lush Lapa',
    databaseUrlEnv: 'DATABASE_URL_LOCAL_LAPA',
    suiteCategoryIds: [7, 8, 9, 10, 11, 12, 13, 14],
    governance: {
      camareirasCargoIds: [4, 20],
      supervisorCargoId: 19,
      terceirizados: { kind: 'byEmployeeIds', ids: [32118, 32120, 32121] },
      teamSizingCargoIds: [4],
      excludedEmployeeIds: [112857, 3361],
    },
    restaurant: {
      abProductTypeIds: [40, 47, 33, 34, 32, 15, 13, 44, 10, 11, 31, 41, 27, 26, 25, 35],
      aProductTypeIds: [47, 32, 13, 44, 10, 11, 31, 41, 27],
      bProductTypeIds: [40, 34, 15, 26, 25, 35],
      aRankingIds: [47, 13, 10, 11, 31, 41, 27],
      bRankingIds: [40, 34, 15, 26, 25, 35],
      aLeastRankingIds: [47, 13, 10, 11, 31, 41],
      bLeastRankingIds: [40, 34, 15, 26, 25, 35],
    },
    rentalTypes: DEFAULT_RENTAL_TYPES,
    extendedRentalRules: true,
    billingRentalType: DEFAULT_BILLING_RENTAL_TYPE,
    bookingChannels: DEFAULT_BOOKING_CHANNELS,
  },

  tout: {
    slug: 'tout',
    unitEnum: 'TOUT',
    displayName: 'Tout',
    databaseUrlEnv: 'DATABASE_URL_LOCAL_TOUT',
    suiteCategoryIds: [6, 7, 8, 9, 10, 12],
    governance: {
      camareirasCargoIds: [4, 20],
      supervisorCargoId: 2,
      terceirizados: { kind: 'none' },
      teamSizingCargoIds: [4],
      excludedEmployeeIds: [164635],
    },
    restaurant: {
      abProductTypeIds: [35, 59, 49, 50, 60, 62, 23, 1, 4, 12, 46, 11, 14, 42, 13],
      aProductTypeIds: [13, 1, 4, 12, 46, 11, 14, 42],
      bProductTypeIds: [49, 50, 60, 62, 23, 35, 59],
      aRankingIds: [13, 4, 12, 46, 11, 14, 42],
      bRankingIds: [49, 50, 60, 62, 23, 35],
      aLeastRankingIds: [13, 4, 12, 46, 11, 14, 42],
      bLeastRankingIds: [49, 50, 60, 62, 23, 35],
    },
    rentalTypes: DEFAULT_RENTAL_TYPES,
    extendedRentalRules: true,
    billingRentalType: DEFAULT_BILLING_RENTAL_TYPE,
    bookingChannels: DEFAULT_BOOKING_CHANNELS,
  },

  andar_de_cima: {
    slug: 'andar_de_cima',
    unitEnum: 'ANDAR_DE_CIMA',
    displayName: 'Andar de Cima',
    databaseUrlEnv: 'DATABASE_URL_LOCAL_ANDAR_DE_CIMA',
    suiteCategoryIds: [2, 3, 4, 5, 6, 7, 12],
    governance: {
      camareirasCargoIds: [7, 13],
      supervisorCargoId: 6,
      terceirizados: { kind: 'none' },
      teamSizingCargoIds: [7],
      excludedEmployeeIds: [11],
    },
    restaurant: {
      abProductTypeIds: [6, 13, 2, 4, 5, 3, 20, 14, 16, 18, 7, 15, 17],
      aProductTypeIds: [14, 16, 18, 7, 15, 17],
      bProductTypeIds: [6, 13, 2, 4, 5, 3, 20],
      aRankingIds: [14, 16, 18, 15, 17],
      bRankingIds: [6, 13, 2, 4, 5, 3, 20],
      aLeastRankingIds: [16, 18, 15, 17],
      bLeastRankingIds: [6, 13, 2, 4, 5, 3, 20],
    },
    rentalTypes: DEFAULT_RENTAL_TYPES,
    extendedRentalRules: false,
    billingRentalType: DEFAULT_BILLING_RENTAL_TYPE,
    bookingChannels: [
      'EXPEDIA',
      'BOOKING',
      'AIRBNB',
      'GUIA_SCHEDULED',
      'GUIA_GO',
      'INTERNAL',
      'WEBSITE_IMMEDIATE',
      'WEBSITE_SCHEDULED',
    ],
  },

  liv: {
    slug: 'liv',
    unitEnum: 'LIV',
    displayName: 'Liv',
    databaseUrlEnv: 'DATABASE_URL_LOCAL_LIV',
    suiteCategoryIds: [1, 2, 3, 4, 5, 7, 8, 9, 10, 11],
    governance: {
      camareirasCargoIds: [4],
      supervisorCargoId: 7,
      terceirizados: { kind: 'byNullSchedule' },
      teamSizingCargoIds: [4],
      excludedEmployeeIds: [],
    },
    restaurant: {
      abProductTypeIds: [26, 23, 24, 6, 7, 2, 22, 5, 31, 15, 12, 16, 9],
      aProductTypeIds: [26, 23, 24, 6, 7, 2, 22, 5],
      bProductTypeIds: [31, 15, 12, 16, 9],
      aRankingIds: [23, 24, 6, 7, 2, 22, 5],
      bRankingIds: [31, 15, 12, 16, 9],
      aLeastRankingIds: [23, 24, 6, 7, 2, 22, 5],
      bLeastRankingIds: [31, 15, 12, 16, 9],
    },
    rentalTypes: DEFAULT_RENTAL_TYPES,
    extendedRentalRules: true,
    billingRentalType: DEFAULT_BILLING_RENTAL_TYPE,
    bookingChannels: DEFAULT_BOOKING_CHANNELS,
  },

  altana: {
    slug: 'altana',
    unitEnum: 'ALTANA',
    displayName: 'Altana',
    databaseUrlEnv: 'DATABASE_URL_LOCAL_ALTANA',
    suiteCategoryIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    governance: {
      camareirasCargoIds: [6, 7],
      supervisorCargoId: 3,
      terceirizados: { kind: 'none' },
      teamSizingCargoIds: [6, 7],
      excludedEmployeeIds: [],
    },
    restaurant: {
      abProductTypeIds: [1, 2, 3, 4, 5, 7, 13, 14, 15, 16, 17, 19, 20, 23, 24],
      aProductTypeIds: [2, 3, 4, 5, 7, 13, 14, 15, 16],
      bProductTypeIds: [1, 17, 19, 20, 23, 24],
      aRankingIds: [2, 3, 4, 5, 14, 16],
      bRankingIds: [1, 17, 19, 20, 23, 24],
      aLeastRankingIds: [2, 3, 4, 5, 14, 16],
      bLeastRankingIds: [1, 17, 19, 20, 23, 24],
    },
    rentalTypes: ALTANA_RENTAL_TYPES,
    extendedRentalRules: false,
    billingRentalType: ALTANA_BILLING_RENTAL_TYPE,
    bookingChannels: [
      'GUIA_SCHEDULED',
      'GUIA_GO',
      'INTERNAL',
      'WEBSITE_IMMEDIATE',
      'WEBSITE_SCHEDULED',
    ],
  },
};

export function getTenant(slug: string): TenantConfig | undefined {
  return TENANTS[slug];
}

export function allTenants(): TenantConfig[] {
  return Object.values(TENANTS);
}

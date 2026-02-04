/**
 * Interfaces para conexões multi-tenant com bancos de dados das unidades
 */

export type UnitKey = 'lush_ipiranga' | 'lush_lapa' | 'tout' | 'andar_de_cima' | 'liv';

export interface UnitDatabaseConfig {
  key: UnitKey;
  name: string;
  connectionString: string;
  envVar: string;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface UnitQueryResult<T = any> {
  unit: UnitKey;
  unitName: string;
  success: boolean;
  data?: T;
  error?: string;
}

// Configuração das categorias de suítes por unidade
export interface UnitSuiteConfig {
  categoryIds: number[];
  categoryNames: string[];
  totalSuites: number;
}

// Configuração completa das unidades
export const UNIT_CONFIGS: Record<
  UnitKey,
  { name: string; envVar: string; suiteConfig: UnitSuiteConfig }
> = {
  lush_ipiranga: {
    name: 'Lush Ipiranga',
    envVar: 'DATABASE_URL_LOCAL_IPIRANGA',
    suiteConfig: {
      categoryIds: [10, 11, 12, 15, 16, 17, 18, 19, 24],
      categoryNames: [
        'LUSH',
        'LUSH POP',
        'LUSH HIDRO',
        'LUSH LOUNGE',
        'LUSH SPA',
        'LUSH CINE',
        'LUSH SPLASH',
        'LUSH SPA SPLASH',
        'CASA LUSH',
      ],
      totalSuites: 33,
    },
  },
  lush_lapa: {
    name: 'Lush Lapa',
    envVar: 'DATABASE_URL_LOCAL_LAPA',
    suiteConfig: {
      categoryIds: [7, 8, 9, 10, 11, 12],
      categoryNames: [
        'LUSH',
        'LUSH HIDRO',
        'LUSH LOUNGE HIDRO',
        'LUSH SPA',
        'LUSH SPLASH',
        'LUSH SPA SPLASH',
      ],
      totalSuites: 18,
    },
  },
  tout: {
    name: 'Tout',
    envVar: 'DATABASE_URL_LOCAL_TOUT',
    suiteConfig: {
      categoryIds: [6, 7, 8, 9, 10, 12],
      categoryNames: ['A', 'HIDRO', 'RELAX', 'SUBLIME', 'CLUB', 'GLAM'],
      totalSuites: 24,
    },
  },
  andar_de_cima: {
    name: 'Andar de Cima',
    envVar: 'DATABASE_URL_LOCAL_ANDAR_DE_CIMA',
    suiteConfig: {
      categoryIds: [2, 3, 4, 5, 6, 7, 12],
      categoryNames: [
        'POP',
        'POP COPAN',
        'LOVE',
        'ESPUMA',
        'ESPUMA LOUNGE',
        'ESPUMA COPAN',
        'CUBO',
      ],
      totalSuites: 16,
    },
  },
  liv: {
    name: 'Liv',
    envVar: 'DATABASE_URL_LOCAL_LIV',
    suiteConfig: {
      categoryIds: [1, 2, 3, 4, 5, 7, 8, 9, 10, 11],
      categoryNames: [
        'HIDRO + SAUNA',
        'HIDRO SEXY',
        'LOUNGE ACQUA',
        'VIP',
        'HIDRO PROMO',
        'LOUNGE',
        'LOUNGE-HIDRO',
        'DIAMOND',
        'LOUNGE SPA',
        'LOUNGE SPA 50 SOMBRAS',
      ],
      totalSuites: null, // Preencher com valor correto depois
    },
  },
};

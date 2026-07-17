/**
 * Interfaces para os KPIs unificados de Governance
 */

// Estrutura ApexCharts simples (categories + series numérico)
export interface ApexChartsData {
  categories: string[];
  series: number[];
}

// Estrutura ApexCharts com múltiplas séries nomeadas
export interface ApexChartsMultiSeriesData {
  categories: string[];
  series: Array<{
    name: string;
    data: number[];
  }>;
}

// Estrutura para ShiftCleaning por dia (séries agrupadas por turno com dados de cada unidade)
export interface ShiftCleaningByDayData {
  categories: string[]; // Datas no formato DD/MM/YYYY
  Manhã: Array<{
    name: string; // Nome da unidade
    data: number[];
  }>;
  Tarde: Array<{
    name: string; // Nome da unidade
    data: number[];
  }>;
  Noite: Array<{
    name: string; // Nome da unidade
    data: number[];
  }>;
}

// BigNumbers do Governance
export interface GovernanceBigNumbersData {
  currentDate: {
    totalAllSuitesCleanings: number;
    totalAllAverageDailyCleaning: number;
    totalAllInspections: number;
  };
  previousDate?: {
    totalAllSuitesCleaningsPreviousData: number;
    totalAllAverageDailyCleaningPreviousData: number;
    totalAllInspectionsPreviousData: number;
  };
  monthlyForecast?: {
    totalAllSuitesCleaningsForecast: number;
    totalAllAverageDailyCleaningForecast: number;
    totalAllInspectionsForecast: number;
  };
}

// Dados processados de uma unidade
export interface UnitGovernanceBigNumbers {
  totalCleanings: number;
  totalInspections: number;
  totalDays: number; // Para calcular média diária
}

// Dados de turno de uma unidade (total por turno)
export interface UnitShiftData {
  manha: number;
  tarde: number;
  noite: number;
  terceirizado: number;
}

// Dados de turno por dia de uma unidade
export interface UnitShiftDataByDay {
  date: string;
  manha: number;
  tarde: number;
  noite: number;
}

// Dados de KPI de uma unidade processados
export interface UnitGovernanceKpiData {
  unit: string;
  unitName: string;
  bigNumbers: UnitGovernanceBigNumbers;
  bigNumbersPrevious?: UnitGovernanceBigNumbers;
  bigNumbersMonthly?: UnitGovernanceBigNumbers;
  shiftData: UnitShiftData;
  shiftDataByDay?: UnitShiftDataByDay[]; // Dados de turno por dia
}

// Resposta unificada do Governance (consolidada)
export interface UnifiedGovernanceKpiResponse {
  Company: string;
  BigNumbers: GovernanceBigNumbersData[];
  CleaningsByCompany: ApexChartsMultiSeriesData; // Total de limpezas por unidade
  AverageCleaningByCompany: ApexChartsMultiSeriesData; // Média de limpeza por unidade
  InspectionsByCompany: ApexChartsMultiSeriesData; // Total de vistorias por unidade
  ShiftCleaning: ShiftCleaningByDayData; // Limpezas por turno por dia, com série nomeada por unidade
}

// Configuração de unidade
export interface UnitConfig {
  url: string;
  prefix: string;
  name: string;
  key: string;
}

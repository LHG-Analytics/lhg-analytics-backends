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

// Dados de turno de uma unidade
export interface UnitShiftData {
  manha: number;
  tarde: number;
  noite: number;
  terceirizado: number;
}

// Dados de KPI de uma unidade processados
export interface UnitGovernanceKpiData {
  unit: string;
  unitName: string;
  bigNumbers: UnitGovernanceBigNumbers;
  bigNumbersPrevious?: UnitGovernanceBigNumbers;
  bigNumbersMonthly?: UnitGovernanceBigNumbers;
  shiftData: UnitShiftData;
}

// Resposta unificada do Governance (consolidada)
export interface UnifiedGovernanceKpiResponse {
  Company: string;
  BigNumbers: GovernanceBigNumbersData[];
  CleaningsByCompany: ApexChartsMultiSeriesData; // Total de limpezas por unidade
  AverageCleaningByCompany: ApexChartsMultiSeriesData; // Média de limpeza por unidade
  InspectionsByCompany: ApexChartsMultiSeriesData; // Total de vistorias por unidade
  ShiftCleaning: ApexChartsMultiSeriesData; // Limpezas por turno com série nomeada por unidade
}

// Configuração de unidade
export interface UnitConfig {
  url: string;
  prefix: string;
  name: string;
  key: string;
}

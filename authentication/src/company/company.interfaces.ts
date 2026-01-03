/**
 * Interfaces para os KPIs unificados de Company
 */

// Estrutura ApexCharts simples (categories + series numérico)
export interface ApexChartsData {
  categories: string[];
  series: number[];
}

// BigNumbers consolidados
export interface BigNumbersDataSQL {
  currentDate: {
    totalAllValue: number;
    totalAllRentalsApartments: number;
    totalAllTicketAverage: number;
    totalAllTrevpar: number;
    totalAllGiro: number;
    totalAverageOccupationTime: string;
  };
  previousDate?: {
    totalAllValuePreviousData: number;
    totalAllRentalsApartmentsPreviousData: number;
    totalAllTicketAveragePreviousData: number;
    totalAllTrevparPreviousData: number;
    totalAllGiroPreviousData: number;
    totalAverageOccupationTimePreviousData: string;
  };
  monthlyForecast?: {
    totalAllValueForecast: number;
    totalAllRentalsApartmentsForecast: number;
    totalAllTicketAverageForecast: number;
    totalAllTrevparForecast: number;
    totalAllGiroForecast: number;
    totalAverageOccupationTimeForecast: string;
  };
}

// Resposta de uma unidade individual (vinda dos backends)
export interface UnitKpiResponse {
  Company: string;
  BigNumbers: BigNumbersDataSQL[];
  RevenueByDate: {
    categories: string[];
    series: number[];
  };
  RentalsByDate: {
    categories: string[];
    series: number[];
  };
  TicketAverageByDate: {
    categories: string[];
    series: number[];
  };
  OccupancyRateByDate: {
    categories: string[];
    series: number[];
  };
  TrevparByDate: {
    categories: string[];
    series: number[];
  };
  GiroByDate?: {
    categories: string[];
    series: number[];
  };
  [key: string]: any;
}

// Resposta unificada do Company (consolidada)
export interface UnifiedCompanyKpiResponse {
  Company: string;
  BigNumbers: BigNumbersDataSQL[];
  RevenueByCompany: ApexChartsData; // Faturamento total de cada unidade
  RevenueByDate: ApexChartsData; // Faturamento consolidado por data
  RentalsByDate: ApexChartsData; // Locações consolidadas por data
  TicketAverageByDate: ApexChartsData; // Ticket médio consolidado por data
  TrevparByDate: ApexChartsData; // TRevPAR consolidado por data
  OccupancyRateByDate: ApexChartsData; // Taxa de ocupação consolidada por data
}

// Configuração de unidade
export interface UnitConfig {
  url: string;
  prefix: string;
  name: string;
  key: string;
}

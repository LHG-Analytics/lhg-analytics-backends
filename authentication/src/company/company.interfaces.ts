/**
 * Interfaces para os KPIs unificados de Company
 */

// Estrutura ApexCharts simples (categories + series numérico)
export interface ApexChartsData {
  categories: string[];
  series: number[];
}

// Série nomeada para gráficos por unidade
export interface NamedSeries {
  name: string;
  data: number[];
}

// Estrutura ApexCharts com séries nomeadas por unidade
export interface ApexChartsSeriesData {
  categories: string[];
  series: NamedSeries[];
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
  RevparByDate: {
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
  RevenueByDate: ApexChartsSeriesData; // Faturamento por unidade por data
  RentalsByDate: ApexChartsSeriesData; // Locações por unidade por data
  RevparByDate: ApexChartsSeriesData; // RevPAR por unidade por data
  TicketAverageByDate: ApexChartsSeriesData; // Ticket médio por unidade por data
  TrevparByDate: ApexChartsSeriesData; // TRevPAR por unidade por data
  OccupancyRateByDate: ApexChartsSeriesData; // Taxa de ocupação por unidade por data
}

// Configuração de unidade
export interface UnitConfig {
  url: string;
  prefix: string;
  name: string;
  key: string;
}

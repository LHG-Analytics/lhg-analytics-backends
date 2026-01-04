/**
 * Interfaces para os KPIs unificados de Restaurant
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

// BigNumbers do Restaurant
export interface RestaurantBigNumbersData {
  currentDate: {
    totalAllValue: number;
    totalAllSales: number;
    totalAllTicketAverage: number;
    totalAllTicketAverageByTotalRentals: number;
  };
  previousDate?: {
    totalAllValuePreviousData: number;
    totalAllSalesPreviousData: number;
    totalAllTicketAveragePreviousData: number;
    totalAllTicketAverageByTotalRentalsPreviousData: number;
  };
  monthlyForecast?: {
    totalAllValueForecast: number;
    totalAllSalesForecast: number;
    totalAllTicketAverageForecast: number;
    totalAllTicketAverageByTotalRentalsForecast: number;
  };
}

// Dados processados de uma unidade
export interface UnitRestaurantBigNumbers {
  totalValue: number;
  totalSales: number;
  totalRentals: number;
}

// Resposta de uma unidade individual (vinda dos backends)
export interface UnitRestaurantKpiResponse {
  Company: string;
  BigNumbers: Array<{
    currentDate: {
      totalAllValue: number;
      totalAllSales: number;
      totalAllTicketAverage: number;
      totalAllTicketAverageByTotalRentals: number;
    };
    previousDate?: {
      totalAllValuePreviousData: number;
      totalAllSalesPreviousData: number;
      totalAllTicketAveragePreviousData: number;
      totalAllTicketAverageByTotalRentalsPreviousData: number;
    };
    monthlyForecast?: {
      totalAllValueForecast: number;
      totalAllSalesForecast: number;
      totalAllTicketAverageForecast: number;
      totalAllTicketAverageByTotalRentalsForecast: number;
    };
  }>;
  RevenueAbByPeriod: ApexChartsData;
  RevenueAbByPeriodPercent: ApexChartsData;
  TicketAverageByPeriod: ApexChartsData;
  [key: string]: any;
}

// Dados de KPI de uma unidade processados
export interface UnitRestaurantKpiData {
  unit: string;
  unitName: string;
  bigNumbers: UnitRestaurantBigNumbers;
  bigNumbersPrevious?: UnitRestaurantBigNumbers;
  bigNumbersMonthly?: UnitRestaurantBigNumbers; // Dados do mês atual para forecast
  revenueAbByDate: Map<string, number>;
  salesByDate: Map<string, number>;
  totalRevenueByDate: Map<string, number>;
  rentalsWithAbByDate: Map<string, number>;
}

// Resposta unificada do Restaurant (consolidada)
export interface UnifiedRestaurantKpiResponse {
  Company: string;
  BigNumbers: RestaurantBigNumbersData[];
  RevenueByCompany: ApexChartsMultiSeriesData; // Receita AB por unidade por data
  SalesByCompany: ApexChartsMultiSeriesData; // Quantidade de vendas por unidade por data
  RevenueAbByPeriod: ApexChartsMultiSeriesData; // Receita AB por unidade por data (com total consolidado)
  RevenueAbByPeriodPercent: ApexChartsMultiSeriesData; // Percentual AB por unidade por data
  TicketAverageByPeriod: ApexChartsMultiSeriesData; // Ticket médio por unidade por data
}

// Configuração de unidade
export interface UnitConfig {
  url: string;
  prefix: string;
  name: string;
  key: string;
}

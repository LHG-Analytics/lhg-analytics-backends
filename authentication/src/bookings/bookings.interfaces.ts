/**
 * Interfaces para os KPIs unificados de Bookings
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

// BigNumbers do Bookings
export interface BookingsBigNumbersData {
  currentDate: {
    totalAllValue: number;
    totalAllBookings: number;
    totalAllTicketAverage: number;
    totalAllRepresentativeness: number;
  };
  previousDate?: {
    totalAllValuePreviousData: number;
    totalAllBookingsPreviousData: number;
    totalAllTicketAveragePreviousData: number;
    totalAllRepresentativenessPreviousData: number;
  };
  monthlyForecast?: {
    totalAllValueForecast: number;
    totalAllBookingsForecast: number;
    totalAllTicketAverageForecast: number;
    totalAllRepresentativenessForecast: number;
  };
}

// BigNumbers do Ecommerce
export interface BookingsEcommerceBigNumbersData {
  currentDate: {
    totalAllValue: number;
    totalAllBookings: number;
    totalAllTicketAverage: number;
    totalAllRepresentativeness: number;
  };
  previousDate?: {
    totalAllValuePreviousData: number;
    totalAllBookingsPreviousData: number;
    totalAllTicketAveragePreviousData: number;
    totalAllRepresentativenessPreviousData: number;
  };
  monthlyForecast?: {
    totalAllValueForecast: number;
    totalAllBookingsForecast: number;
    totalAllTicketAverageForecast: number;
    totalAllRepresentativenessForecast: number;
  };
}

// Dados processados de uma unidade
export interface UnitBookingsBigNumbers {
  totalValue: number;
  totalBookings: number;
  totalRevenue: number; // Para cálculo de representatividade
}

// Dados de ecommerce de uma unidade
export interface UnitBookingsEcommerce {
  totalValue: number;
  totalBookings: number;
}

// Resposta de uma unidade individual (vinda dos backends)
export interface UnitBookingsKpiResponse {
  Company: string;
  BigNumbers: Array<{
    currentDate: {
      totalAllValue: number;
      totalAllBookings: number;
      totalAllTicketAverage: number;
      totalAllRepresentativeness: number;
    };
    previousDate?: {
      totalAllValuePreviousData: number;
      totalAllBookingsPreviousData: number;
      totalAllTicketAveragePreviousData: number;
      totalAllRepresentativenessPreviousData: number;
    };
    monthlyForecast?: {
      totalAllValueForecast: number;
      totalAllBookingsForecast: number;
      totalAllTicketAverageForecast: number;
      totalAllRepresentativenessForecast: number;
    };
  }>;
  BillingOfReservationsByPeriod: ApexChartsData;
  RepresentativenessOfReservesByPeriod: ApexChartsData;
  NumberOfReservationsPerPeriod: ApexChartsData;
  BigNumbersEcommerce: Array<BookingsEcommerceBigNumbersData>;
  ReservationsOfEcommerceByPeriod: ApexChartsData;
  BillingOfEcommerceByPeriod: ApexChartsData;
  [key: string]: any;
}

// Dados de KPI de uma unidade processados
export interface UnitBookingsKpiData {
  unit: string;
  unitName: string;
  bigNumbers: UnitBookingsBigNumbers;
  bigNumbersPrevious?: UnitBookingsBigNumbers;
  bigNumbersMonthly?: UnitBookingsBigNumbers; // Dados do mês atual para forecast
  ecommerce: UnitBookingsEcommerce;
  ecommercePrevious?: UnitBookingsEcommerce; // Dados de ecommerce do período anterior
  ecommerceMonthly?: UnitBookingsEcommerce; // Dados de ecommerce do mês atual para forecast
  // Dados por data para séries
  billingByDate: Map<string, number>;
  bookingsByDate: Map<string, number>;
  ecommerceBillingByDate: Map<string, number>;
  ecommerceBookingsByDate: Map<string, number>;
}

// Resposta unificada do Bookings (consolidada)
export interface UnifiedBookingsKpiResponse {
  Company: string;
  BigNumbers: BookingsBigNumbersData[];
  RevenueByCompany: ApexChartsData; // Faturamento total de reservas de cada unidade (consolidado)
  BookingsByCompany: ApexChartsData; // Quantidade de reservas de cada unidade (consolidado)
  BillingOfReservationsByPeriod: ApexChartsMultiSeriesData; // Faturamento de reservas por unidade por data (com total consolidado)
  RepresentativenessOfReservesByPeriod: ApexChartsMultiSeriesData; // Representatividade por unidade por data
  NumberOfReservationsPerPeriod: ApexChartsMultiSeriesData; // Número de reservas por unidade por data
  BigNumbersEcommerce: BookingsEcommerceBigNumbersData[];
  ReservationsOfEcommerceByPeriod: ApexChartsMultiSeriesData; // Reservas ecommerce por unidade por data
  BillingOfEcommerceByPeriod: ApexChartsMultiSeriesData; // Faturamento ecommerce por unidade por data
}

// Configuração de unidade
export interface UnitConfig {
  url: string;
  prefix: string;
  name: string;
  key: string;
}

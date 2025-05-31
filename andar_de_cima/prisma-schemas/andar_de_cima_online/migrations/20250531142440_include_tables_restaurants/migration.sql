-- CreateEnum
CREATE TYPE "ChannelTypeEnum" AS ENUM ('WEBSITE_SCHEDULED', 'WEBSITE_IMMEDIATE', 'INTERNAL', 'GUIA_GO', 'GUIA_SCHEDULED', 'BOOKING', 'EXPEDIA');

-- CreateEnum
CREATE TYPE "PeriodEnum" AS ENUM ('LAST_7_D', 'LAST_30_D', 'LAST_6_M', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RentalTypeEnum" AS ENUM ('THREE_HOURS', 'SIX_HOURS', 'TWELVE_HOURS', 'DAY_USE', 'DAILY', 'OVERNIGHT');

-- CreateEnum
CREATE TYPE "ConsumptionGroup" AS ENUM ('ALIMENTOS', 'BEBIDAS', 'OUTROS');

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Governance" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "Governance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiRevenue" (
    "id" SERIAL NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "suiteCategoryName" TEXT NOT NULL,
    "permanenceValueTotal" DECIMAL(10,2) NOT NULL,
    "permanenceValueLiquid" DECIMAL(10,2) NOT NULL,
    "period" "PeriodEnum",
    "priceSale" DECIMAL(10,2),
    "discountSale" DECIMAL(10,2) NOT NULL,
    "discountRental" DECIMAL(10,2),
    "totalValue" DECIMAL(10,2) NOT NULL,
    "totalAllValue" DECIMAL(10,2) NOT NULL,
    "totalDiscount" DECIMAL(10,2) NOT NULL,
    "totalSaleDirect" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiRevenueByRentalType" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "rentalType" "RentalTypeEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiRevenueByRentalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiRevenueByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiRevenueByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTotalRentals" (
    "id" SERIAL NOT NULL,
    "suiteCategoryName" TEXT NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "period" "PeriodEnum",
    "createdDate" TIMESTAMP(3) NOT NULL,
    "totalRentalsApartments" INTEGER,
    "totalBookings" INTEGER,
    "totalAllRentalsApartments" INTEGER,
    "totalAllBookings" INTEGER,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiTotalRentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTotalRentalsByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "createdDate" TIMESTAMP(3) NOT NULL,
    "totalAllRentalsApartments" INTEGER,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiTotalRentalsByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTicketAverage" (
    "id" SERIAL NOT NULL,
    "suiteCategoryName" TEXT NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "totalTicketAverage" DECIMAL(10,2) NOT NULL,
    "ticketAverageSale" DECIMAL(10,2) NOT NULL,
    "ticketAverageRental" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "totalAllTicketAverage" DECIMAL(10,2) NOT NULL,
    "ticketAverageAllSale" DECIMAL(10,2) NOT NULL,
    "ticketAverageAllRental" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiTicketAverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTicketAverageByPeriod" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "totalAllTicketAverage" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiTicketAverageByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiAlos" (
    "id" SERIAL NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "suiteCategoryName" TEXT NOT NULL,
    "period" "PeriodEnum",
    "occupationTime" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "averageOccupationTime" TEXT,
    "totalAverageOccupationTime" TEXT,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiAlos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiOccupancyRate" (
    "id" SERIAL NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "suiteCategoryName" TEXT NOT NULL,
    "period" "PeriodEnum",
    "occupancyRate" DECIMAL(10,2) NOT NULL,
    "totalOccupancyRate" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiOccupancyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiOccupancyRateByWeek" (
    "id" SERIAL NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "suiteCategoryName" TEXT NOT NULL,
    "period" "PeriodEnum",
    "occupancyRate" DECIMAL(10,2) NOT NULL,
    "totalOccupancyRate" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiOccupancyRateByWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiOccupancyRateByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalOccupancyRate" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiOccupancyRateByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiOccupancyRateBySuiteCategory" (
    "id" SERIAL NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "suiteCategoryName" TEXT NOT NULL,
    "period" "PeriodEnum",
    "occupancyRate" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiOccupancyRateBySuiteCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiGiro" (
    "id" SERIAL NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "period" "PeriodEnum",
    "suiteCategoryName" TEXT NOT NULL,
    "giro" DECIMAL(10,2) NOT NULL,
    "totalGiro" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiGiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiGiroByWeek" (
    "id" SERIAL NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "period" "PeriodEnum",
    "suiteCategoryName" TEXT NOT NULL,
    "giro" DECIMAL(10,2) NOT NULL,
    "totalGiro" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiGiroByWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiRevpar" (
    "id" SERIAL NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "period" "PeriodEnum",
    "suiteCategoryName" TEXT NOT NULL,
    "revpar" DECIMAL(10,2) NOT NULL,
    "totalRevpar" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiRevpar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiRevparByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalRevpar" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiRevparByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTrevpar" (
    "id" SERIAL NOT NULL,
    "suiteCategoryId" INTEGER NOT NULL,
    "period" "PeriodEnum",
    "suiteCategoryName" TEXT NOT NULL,
    "trevpar" DECIMAL(10,2) NOT NULL,
    "totalTrevpar" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiTrevpar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTrevparByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalTrevpar" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "KpiTrevparByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cleanings" (
    "id" SERIAL NOT NULL,
    "employeeName" TEXT NOT NULL,
    "totalSuitesCleanings" INTEGER NOT NULL,
    "totalAllSuitesCleanings" INTEGER NOT NULL,
    "totalDaysWorked" INTEGER NOT NULL,
    "shift" TEXT NOT NULL,
    "averageDailyCleaning" DECIMAL(65,30) NOT NULL,
    "totalAllAverageDailyCleaning" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "companyId" INTEGER NOT NULL,
    "governanceId" INTEGER,

    CONSTRAINT "Cleanings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningsByPeriod" (
    "id" SERIAL NOT NULL,
    "totalSuitesCleanings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "companyId" INTEGER NOT NULL,
    "governanceId" INTEGER,

    CONSTRAINT "CleaningsByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningsByPeriodShift" (
    "id" SERIAL NOT NULL,
    "totalSuitesCleanings" INTEGER NOT NULL,
    "employeeName" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "companyId" INTEGER NOT NULL,
    "governanceId" INTEGER,

    CONSTRAINT "CleaningsByPeriodShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningsByWeek" (
    "id" SERIAL NOT NULL,
    "totalAverageDailyWeekCleaning" DECIMAL(65,30) NOT NULL,
    "totalAverageShiftCleaning" DECIMAL(65,30) NOT NULL,
    "totalAllAverageShiftCleaning" DECIMAL(65,30) NOT NULL,
    "averageDailyWeekCleaning" DECIMAL(65,30) NOT NULL,
    "totalSuitesCleanings" INTEGER NOT NULL,
    "idealShiftMaid" INTEGER NOT NULL,
    "totalIdealShiftMaid" INTEGER NOT NULL,
    "realShiftMaid" INTEGER NOT NULL,
    "totalRealShiftMaid" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "totalDifference" INTEGER NOT NULL,
    "period" "PeriodEnum",
    "shift" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "governanceId" INTEGER,

    CONSTRAINT "CleaningsByWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspections" (
    "id" SERIAL NOT NULL,
    "employeeName" TEXT NOT NULL,
    "totalInspections" INTEGER NOT NULL,
    "totalAllInspections" INTEGER NOT NULL,
    "period" "PeriodEnum",
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "governanceId" INTEGER,

    CONSTRAINT "Inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookings" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "Bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRevenue" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRevenueByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRevenueByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRevenueByPeriodEcommerce" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRevenueByPeriodEcommerce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRevenueByChannelType" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "totalAllValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRevenueByChannelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRevenueByPayment" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "paymentMethod" TEXT NOT NULL,
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRevenueByPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTicketAverage" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "totalAllTicketAverage" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTicketAverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTicketAverageByChannelType" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalTicketAverage" DECIMAL(10,2) NOT NULL,
    "totalAllTicketAverage" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTicketAverageByChannelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRepresentativeness" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "totalAllRepresentativeness" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRepresentativeness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRepresentativenessByPeriod" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "totalRepresentativeness" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRepresentativenessByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRepresentativenessByChannelType" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalRepresentativeness" DECIMAL(10,2) NOT NULL,
    "totalAllRepresentativeness" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRepresentativenessByChannelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentals" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllBookings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentalsByRentalType" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "rentalType" "RentalTypeEnum",
    "totalBookings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentalsByRentalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentalsByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalBookings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentalsByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentalsByPeriodEcommerce" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalBookings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentalsByPeriodEcommerce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentalsByChannelType" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalBookings" INTEGER NOT NULL,
    "totalAllBookings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentalsByChannelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenue" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantRevenueByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByPeriodPercent" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValuePercent" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantRevenueByPeriodPercent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByGroupByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "consumptionGroup" "ConsumptionGroup" NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantRevenueByGroupByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByFoodCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "totalAllValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "foodCategory" TEXT NOT NULL,
    "totalValuePercent" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantRevenueByFoodCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByDrinkCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "totalAllValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "drinkCategory" TEXT NOT NULL,
    "totalValuePercent" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantRevenueByDrinkCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByOthersCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "totalAllValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "othersCategory" TEXT NOT NULL,
    "totalValuePercent" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantRevenueByOthersCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSales" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllSales" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantSales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesRanking" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSales" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantSalesRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesByFoodCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSales" INTEGER NOT NULL,
    "totalAllSales" INTEGER NOT NULL,
    "totalSalesPercent" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "foodCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantSalesByFoodCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesByDrinkCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSale" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "drinkCategory" TEXT NOT NULL,
    "totalAllSales" INTEGER NOT NULL,
    "totalSalePercent" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantSalesByDrinkCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesByOthersCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSales" INTEGER NOT NULL,
    "totalAllSales" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "othersCategory" TEXT NOT NULL,
    "totalSalesPercent" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantSalesByOthersCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTicketAverage" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllTicketAverage" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantTicketAverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTicketAverageByTotalRentals" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllTicketAverageByTotalRentals" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantTicketAverageByTotalRentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTicketAverageByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalTicketAverage" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantTicketAverageByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Governance_companyId_key" ON "Governance"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRevenue_suiteCategoryId_period_createdDate_key" ON "KpiRevenue"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRevenueByRentalType_period_createdDate_rentalType_key" ON "KpiRevenueByRentalType"("period", "createdDate", "rentalType");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRevenueByPeriod_period_createdDate_key" ON "KpiRevenueByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTotalRentals_suiteCategoryId_period_createdDate_key" ON "KpiTotalRentals"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTotalRentalsByPeriod_period_createdDate_key" ON "KpiTotalRentalsByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTicketAverage_suiteCategoryId_period_createdDate_key" ON "KpiTicketAverage"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTicketAverageByPeriod_period_createdDate_key" ON "KpiTicketAverageByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiAlos_suiteCategoryId_period_createdDate_key" ON "KpiAlos"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiOccupancyRate_suiteCategoryId_period_createdDate_key" ON "KpiOccupancyRate"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiOccupancyRateByWeek_suiteCategoryId_period_createdDate_key" ON "KpiOccupancyRateByWeek"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiOccupancyRateByPeriod_period_createdDate_key" ON "KpiOccupancyRateByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiOccupancyRateBySuiteCategory_suiteCategoryId_period_crea_key" ON "KpiOccupancyRateBySuiteCategory"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiGiro_suiteCategoryId_period_createdDate_key" ON "KpiGiro"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiGiroByWeek_suiteCategoryId_period_createdDate_key" ON "KpiGiroByWeek"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRevpar_suiteCategoryId_period_createdDate_key" ON "KpiRevpar"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRevparByPeriod_period_createdDate_key" ON "KpiRevparByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTrevpar_suiteCategoryId_period_createdDate_key" ON "KpiTrevpar"("suiteCategoryId", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTrevparByPeriod_period_createdDate_key" ON "KpiTrevparByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "Cleanings_employeeName_createdDate_period_key" ON "Cleanings"("employeeName", "createdDate", "period");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningsByPeriod_period_createdDate_key" ON "CleaningsByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningsByPeriodShift_period_createdDate_employeeName_key" ON "CleaningsByPeriodShift"("period", "createdDate", "employeeName");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningsByWeek_period_shift_createdDate_key" ON "CleaningsByWeek"("period", "shift", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "Inspections_employeeName_period_createdDate_key" ON "Inspections"("employeeName", "period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenue_period_createdDate_key" ON "BookingsRevenue"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByPeriod_period_createdDate_key" ON "BookingsRevenueByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByPeriodEcommerce_period_createdDate_key" ON "BookingsRevenueByPeriodEcommerce"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByChannelType_period_createdDate_channelType_key" ON "BookingsRevenueByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByPayment_period_createdDate_paymentMethod_key" ON "BookingsRevenueByPayment"("period", "createdDate", "paymentMethod");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTicketAverage_period_createdDate_key" ON "BookingsTicketAverage"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTicketAverageByChannelType_period_createdDate_chann_key" ON "BookingsTicketAverageByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRepresentativeness_period_createdDate_key" ON "BookingsRepresentativeness"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRepresentativenessByPeriod_period_createdDate_key" ON "BookingsRepresentativenessByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRepresentativenessByChannelType_period_createdDate__key" ON "BookingsRepresentativenessByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentals_period_createdDate_key" ON "BookingsTotalRentals"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByRentalType_period_createdDate_rentalT_key" ON "BookingsTotalRentalsByRentalType"("period", "createdDate", "rentalType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByPeriod_period_createdDate_key" ON "BookingsTotalRentalsByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByPeriodEcommerce_period_createdDate_key" ON "BookingsTotalRentalsByPeriodEcommerce"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByChannelType_period_createdDate_channe_key" ON "BookingsTotalRentalsByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenue_period_createdDate_key" ON "RestaurantRevenue"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByPeriod_period_createdDate_key" ON "RestaurantRevenueByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByPeriodPercent_period_createdDate_key" ON "RestaurantRevenueByPeriodPercent"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByGroupByPeriod_period_createdDate_consump_key" ON "RestaurantRevenueByGroupByPeriod"("period", "createdDate", "consumptionGroup");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByFoodCategory_period_createdDate_foodCate_key" ON "RestaurantRevenueByFoodCategory"("period", "createdDate", "foodCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByDrinkCategory_period_createdDate_drinkCa_key" ON "RestaurantRevenueByDrinkCategory"("period", "createdDate", "drinkCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByOthersCategory_period_createdDate_others_key" ON "RestaurantRevenueByOthersCategory"("period", "createdDate", "othersCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSales_period_createdDate_key" ON "RestaurantSales"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesRanking_period_createdDate_productName_key" ON "RestaurantSalesRanking"("period", "createdDate", "productName");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesByFoodCategory_period_createdDate_foodCatego_key" ON "RestaurantSalesByFoodCategory"("period", "createdDate", "foodCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesByDrinkCategory_period_createdDate_drinkCate_key" ON "RestaurantSalesByDrinkCategory"("period", "createdDate", "drinkCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesByOthersCategory_period_createdDate_othersCa_key" ON "RestaurantSalesByOthersCategory"("period", "createdDate", "othersCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTicketAverage_period_createdDate_key" ON "RestaurantTicketAverage"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTicketAverageByTotalRentals_period_createdDate_key" ON "RestaurantTicketAverageByTotalRentals"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTicketAverageByPeriod_period_createdDate_key" ON "RestaurantTicketAverageByPeriod"("period", "createdDate");

-- AddForeignKey
ALTER TABLE "Governance" ADD CONSTRAINT "Governance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiRevenue" ADD CONSTRAINT "KpiRevenue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiRevenueByRentalType" ADD CONSTRAINT "KpiRevenueByRentalType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiRevenueByPeriod" ADD CONSTRAINT "KpiRevenueByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTotalRentals" ADD CONSTRAINT "KpiTotalRentals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTotalRentalsByPeriod" ADD CONSTRAINT "KpiTotalRentalsByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTicketAverage" ADD CONSTRAINT "KpiTicketAverage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTicketAverageByPeriod" ADD CONSTRAINT "KpiTicketAverageByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiAlos" ADD CONSTRAINT "KpiAlos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiOccupancyRate" ADD CONSTRAINT "KpiOccupancyRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiOccupancyRateByWeek" ADD CONSTRAINT "KpiOccupancyRateByWeek_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiOccupancyRateByPeriod" ADD CONSTRAINT "KpiOccupancyRateByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiOccupancyRateBySuiteCategory" ADD CONSTRAINT "KpiOccupancyRateBySuiteCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiGiro" ADD CONSTRAINT "KpiGiro_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiGiroByWeek" ADD CONSTRAINT "KpiGiroByWeek_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiRevpar" ADD CONSTRAINT "KpiRevpar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiRevparByPeriod" ADD CONSTRAINT "KpiRevparByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTrevpar" ADD CONSTRAINT "KpiTrevpar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTrevparByPeriod" ADD CONSTRAINT "KpiTrevparByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cleanings" ADD CONSTRAINT "Cleanings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cleanings" ADD CONSTRAINT "Cleanings_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByPeriod" ADD CONSTRAINT "CleaningsByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByPeriod" ADD CONSTRAINT "CleaningsByPeriod_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByPeriodShift" ADD CONSTRAINT "CleaningsByPeriodShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByPeriodShift" ADD CONSTRAINT "CleaningsByPeriodShift_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByWeek" ADD CONSTRAINT "CleaningsByWeek_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByWeek" ADD CONSTRAINT "CleaningsByWeek_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspections" ADD CONSTRAINT "Inspections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspections" ADD CONSTRAINT "Inspections_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookings" ADD CONSTRAINT "Bookings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenue" ADD CONSTRAINT "BookingsRevenue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenue" ADD CONSTRAINT "BookingsRevenue_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPeriod" ADD CONSTRAINT "BookingsRevenueByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPeriod" ADD CONSTRAINT "BookingsRevenueByPeriod_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPeriodEcommerce" ADD CONSTRAINT "BookingsRevenueByPeriodEcommerce_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPeriodEcommerce" ADD CONSTRAINT "BookingsRevenueByPeriodEcommerce_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByChannelType" ADD CONSTRAINT "BookingsRevenueByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByChannelType" ADD CONSTRAINT "BookingsRevenueByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPayment" ADD CONSTRAINT "BookingsRevenueByPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPayment" ADD CONSTRAINT "BookingsRevenueByPayment_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverage" ADD CONSTRAINT "BookingsTicketAverage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverage" ADD CONSTRAINT "BookingsTicketAverage_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverageByChannelType" ADD CONSTRAINT "BookingsTicketAverageByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverageByChannelType" ADD CONSTRAINT "BookingsTicketAverageByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativeness" ADD CONSTRAINT "BookingsRepresentativeness_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativeness" ADD CONSTRAINT "BookingsRepresentativeness_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByPeriod" ADD CONSTRAINT "BookingsRepresentativenessByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByPeriod" ADD CONSTRAINT "BookingsRepresentativenessByPeriod_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByChannelType" ADD CONSTRAINT "BookingsRepresentativenessByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByChannelType" ADD CONSTRAINT "BookingsRepresentativenessByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentals" ADD CONSTRAINT "BookingsTotalRentals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentals" ADD CONSTRAINT "BookingsTotalRentals_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByRentalType" ADD CONSTRAINT "BookingsTotalRentalsByRentalType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByRentalType" ADD CONSTRAINT "BookingsTotalRentalsByRentalType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriod" ADD CONSTRAINT "BookingsTotalRentalsByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriod" ADD CONSTRAINT "BookingsTotalRentalsByPeriod_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriodEcommerce" ADD CONSTRAINT "BookingsTotalRentalsByPeriodEcommerce_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriodEcommerce" ADD CONSTRAINT "BookingsTotalRentalsByPeriodEcommerce_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByChannelType" ADD CONSTRAINT "BookingsTotalRentalsByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByChannelType" ADD CONSTRAINT "BookingsTotalRentalsByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenue" ADD CONSTRAINT "RestaurantRevenue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenue" ADD CONSTRAINT "RestaurantRevenue_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriod" ADD CONSTRAINT "RestaurantRevenueByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriod" ADD CONSTRAINT "RestaurantRevenueByPeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriodPercent" ADD CONSTRAINT "RestaurantRevenueByPeriodPercent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriodPercent" ADD CONSTRAINT "RestaurantRevenueByPeriodPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByGroupByPeriod" ADD CONSTRAINT "RestaurantRevenueByGroupByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByGroupByPeriod" ADD CONSTRAINT "RestaurantRevenueByGroupByPeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategory" ADD CONSTRAINT "RestaurantRevenueByFoodCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategory" ADD CONSTRAINT "RestaurantRevenueByFoodCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategory" ADD CONSTRAINT "RestaurantRevenueByDrinkCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategory" ADD CONSTRAINT "RestaurantRevenueByDrinkCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategory" ADD CONSTRAINT "RestaurantRevenueByOthersCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategory" ADD CONSTRAINT "RestaurantRevenueByOthersCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSales" ADD CONSTRAINT "RestaurantSales_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSales" ADD CONSTRAINT "RestaurantSales_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesRanking" ADD CONSTRAINT "RestaurantSalesRanking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesRanking" ADD CONSTRAINT "RestaurantSalesRanking_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByFoodCategory" ADD CONSTRAINT "RestaurantSalesByFoodCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByFoodCategory" ADD CONSTRAINT "RestaurantSalesByFoodCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategory" ADD CONSTRAINT "RestaurantSalesByDrinkCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategory" ADD CONSTRAINT "RestaurantSalesByDrinkCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByOthersCategory" ADD CONSTRAINT "RestaurantSalesByOthersCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByOthersCategory" ADD CONSTRAINT "RestaurantSalesByOthersCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverage" ADD CONSTRAINT "RestaurantTicketAverage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverage" ADD CONSTRAINT "RestaurantTicketAverage_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentals" ADD CONSTRAINT "RestaurantTicketAverageByTotalRentals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentals" ADD CONSTRAINT "RestaurantTicketAverageByTotalRentals_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByPeriod" ADD CONSTRAINT "RestaurantTicketAverageByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByPeriod" ADD CONSTRAINT "RestaurantTicketAverageByPeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

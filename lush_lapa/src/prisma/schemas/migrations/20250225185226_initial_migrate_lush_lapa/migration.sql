-- CreateEnum
CREATE TYPE "ChannelTypeEnum" AS ENUM ('WEBSITE_SCHEDULED', 'WEBSITE_IMMEDIATE', 'INTERNAL', 'GUIA_GO', 'GUIA_SCHEDULED', 'BOOKING', 'EXPEDIA');

-- CreateEnum
CREATE TYPE "PeriodEnum" AS ENUM ('LAST_7_D', 'LAST_30_D', 'LAST_6_M', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RentalTypeEnum" AS ENUM ('THREE_HOURS', 'SIX_HOURS', 'TWELVE_HOURS', 'DAY_USE', 'DAILY', 'OVERNIGHT');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER');

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
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" DEFAULT 'MANAGER',
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "BookingsByRentalType" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "rentalType" "RentalTypeEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsByRentalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsByChannelType" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "totalAllValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsByChannelType_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "BookingsRepresentativeness" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "totalAllRepresentativeness" DECIMAL(10,2) NOT NULL,
    "representativenessGoal" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRepresentativeness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRepresentativenessByPeriod" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "totalAllRepresentativeness" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRepresentativenessByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentals" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllRentalsApartments" INTEGER,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentalsByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalRentalsApartments" INTEGER,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentalsByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Governance_companyId_key" ON "Governance"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_cpf_key" ON "User"("cpf");

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
CREATE UNIQUE INDEX "BookingsByRentalType_period_createdDate_rentalType_key" ON "BookingsByRentalType"("period", "createdDate", "rentalType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsByChannelType_period_createdDate_channelType_key" ON "BookingsByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTicketAverage_period_createdDate_key" ON "BookingsTicketAverage"("period", "createdDate");

-- AddForeignKey
ALTER TABLE "Governance" ADD CONSTRAINT "Governance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "BookingsByRentalType" ADD CONSTRAINT "BookingsByRentalType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByRentalType" ADD CONSTRAINT "BookingsByRentalType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByChannelType" ADD CONSTRAINT "BookingsByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByChannelType" ADD CONSTRAINT "BookingsByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverage" ADD CONSTRAINT "BookingsTicketAverage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverage" ADD CONSTRAINT "BookingsTicketAverage_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativeness" ADD CONSTRAINT "BookingsRepresentativeness_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativeness" ADD CONSTRAINT "BookingsRepresentativeness_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByPeriod" ADD CONSTRAINT "BookingsRepresentativenessByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByPeriod" ADD CONSTRAINT "BookingsRepresentativenessByPeriod_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentals" ADD CONSTRAINT "BookingsTotalRentals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentals" ADD CONSTRAINT "BookingsTotalRentals_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriod" ADD CONSTRAINT "BookingsTotalRentalsByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriod" ADD CONSTRAINT "BookingsTotalRentalsByPeriod_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

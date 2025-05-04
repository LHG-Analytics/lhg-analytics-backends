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

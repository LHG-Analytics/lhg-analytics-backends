-- CreateEnum
CREATE TYPE "ChannelTypeEnum" AS ENUM ('WEBSITE_SCHEDULED', 'WEBSITE_IMMEDIATE', 'INTERNAL', 'GUIA_GO', 'GUIA_SCHEDULED', 'BOOKING', 'EXPEDIA');

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

    CONSTRAINT "BookingsRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRevenueByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

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

    CONSTRAINT "BookingsByRentalType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsByChannelType" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalTicketAverage" DECIMAL(10,2) NOT NULL,
    "totalValue" DECIMAL(10,2) NOT NULL,
    "representativeness" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "BookingsByChannelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTicketAverage" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "totalAllTicketAverage" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,

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

    CONSTRAINT "BookingsRepresentativeness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsRepresentativenessByPeriod" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "totalAllRepresentativeness" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "BookingsRepresentativenessByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentals" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllRentalsApartments" INTEGER,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "BookingsTotalRentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentalsByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalRentalsApartments" INTEGER,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "BookingsTotalRentalsByPeriod_pkey" PRIMARY KEY ("id")
);

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
ALTER TABLE "Bookings" ADD CONSTRAINT "Bookings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenue" ADD CONSTRAINT "BookingsRevenue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenue" ADD CONSTRAINT "BookingsRevenue_id_fkey" FOREIGN KEY ("id") REFERENCES "Bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPeriod" ADD CONSTRAINT "BookingsRevenueByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPeriod" ADD CONSTRAINT "BookingsRevenueByPeriod_id_fkey" FOREIGN KEY ("id") REFERENCES "Bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByRentalType" ADD CONSTRAINT "BookingsByRentalType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByRentalType" ADD CONSTRAINT "BookingsByRentalType_id_fkey" FOREIGN KEY ("id") REFERENCES "Bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByChannelType" ADD CONSTRAINT "BookingsByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByChannelType" ADD CONSTRAINT "BookingsByChannelType_id_fkey" FOREIGN KEY ("id") REFERENCES "Bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverage" ADD CONSTRAINT "BookingsTicketAverage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverage" ADD CONSTRAINT "BookingsTicketAverage_id_fkey" FOREIGN KEY ("id") REFERENCES "Bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativeness" ADD CONSTRAINT "BookingsRepresentativeness_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativeness" ADD CONSTRAINT "BookingsRepresentativeness_id_fkey" FOREIGN KEY ("id") REFERENCES "Bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByPeriod" ADD CONSTRAINT "BookingsRepresentativenessByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByPeriod" ADD CONSTRAINT "BookingsRepresentativenessByPeriod_id_fkey" FOREIGN KEY ("id") REFERENCES "Bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentals" ADD CONSTRAINT "BookingsTotalRentals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentals" ADD CONSTRAINT "BookingsTotalRentals_id_fkey" FOREIGN KEY ("id") REFERENCES "Bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriod" ADD CONSTRAINT "BookingsTotalRentalsByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriod" ADD CONSTRAINT "BookingsTotalRentalsByPeriod_id_fkey" FOREIGN KEY ("id") REFERENCES "Bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the column `representativenessGoal` on the `BookingsRepresentativeness` table. All the data in the column will be lost.
  - You are about to drop the column `totalAllRepresentativeness` on the `BookingsRepresentativenessByPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `totalAllRentalsApartments` on the `BookingsTotalRentals` table. All the data in the column will be lost.
  - You are about to drop the column `totalRentalsApartments` on the `BookingsTotalRentalsByPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `totalRentalsApartments` on the `BookingsTotalRentalsByRentalType` table. All the data in the column will be lost.
  - You are about to drop the `BookingsByChannelType` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[period,createdDate]` on the table `BookingsRepresentativeness` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[period,createdDate]` on the table `BookingsRepresentativenessByPeriod` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[period,createdDate]` on the table `BookingsTotalRentals` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[period,createdDate]` on the table `BookingsTotalRentalsByPeriod` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `totalRepresentativeness` to the `BookingsRepresentativenessByPeriod` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAllBookings` to the `BookingsTotalRentals` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalBookings` to the `BookingsTotalRentalsByPeriod` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalBookings` to the `BookingsTotalRentalsByRentalType` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BookingsByChannelType" DROP CONSTRAINT "BookingsByChannelType_bookingsId_fkey";

-- DropForeignKey
ALTER TABLE "BookingsByChannelType" DROP CONSTRAINT "BookingsByChannelType_companyId_fkey";

-- AlterTable
ALTER TABLE "BookingsRepresentativeness" DROP COLUMN "representativenessGoal";

-- AlterTable
ALTER TABLE "BookingsRepresentativenessByPeriod" DROP COLUMN "totalAllRepresentativeness",
ADD COLUMN     "totalRepresentativeness" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "BookingsTotalRentals" DROP COLUMN "totalAllRentalsApartments",
ADD COLUMN     "totalAllBookings" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "BookingsTotalRentalsByPeriod" DROP COLUMN "totalRentalsApartments",
ADD COLUMN     "totalBookings" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "BookingsTotalRentalsByRentalType" DROP COLUMN "totalRentalsApartments",
ADD COLUMN     "totalBookings" INTEGER NOT NULL;

-- DropTable
DROP TABLE "BookingsByChannelType";

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

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByPeriodEcommerce_period_createdDate_key" ON "BookingsRevenueByPeriodEcommerce"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByChannelType_period_createdDate_channelType_key" ON "BookingsRevenueByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByPayment_period_createdDate_paymentMethod_key" ON "BookingsRevenueByPayment"("period", "createdDate", "paymentMethod");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTicketAverageByChannelType_period_createdDate_chann_key" ON "BookingsTicketAverageByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRepresentativenessByChannelType_period_createdDate__key" ON "BookingsRepresentativenessByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByPeriodEcommerce_period_createdDate_key" ON "BookingsTotalRentalsByPeriodEcommerce"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByChannelType_period_createdDate_channe_key" ON "BookingsTotalRentalsByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRepresentativeness_period_createdDate_key" ON "BookingsRepresentativeness"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRepresentativenessByPeriod_period_createdDate_key" ON "BookingsRepresentativenessByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentals_period_createdDate_key" ON "BookingsTotalRentals"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByPeriod_period_createdDate_key" ON "BookingsTotalRentalsByPeriod"("period", "createdDate");

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
ALTER TABLE "BookingsTicketAverageByChannelType" ADD CONSTRAINT "BookingsTicketAverageByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverageByChannelType" ADD CONSTRAINT "BookingsTicketAverageByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByChannelType" ADD CONSTRAINT "BookingsRepresentativenessByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByChannelType" ADD CONSTRAINT "BookingsRepresentativenessByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriodEcommerce" ADD CONSTRAINT "BookingsTotalRentalsByPeriodEcommerce_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriodEcommerce" ADD CONSTRAINT "BookingsTotalRentalsByPeriodEcommerce_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByChannelType" ADD CONSTRAINT "BookingsTotalRentalsByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByChannelType" ADD CONSTRAINT "BookingsTotalRentalsByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the `BookingsByChannelType` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `totalAllRepresentativeness` to the `BookingsRepresentativenessByChannelType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalTicketAverage` to the `BookingsTicketAverageByChannelType` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAllBookings` to the `BookingsTotalRentalsByChannelType` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BookingsByChannelType" DROP CONSTRAINT "BookingsByChannelType_bookingsId_fkey";

-- DropForeignKey
ALTER TABLE "BookingsByChannelType" DROP CONSTRAINT "BookingsByChannelType_companyId_fkey";

-- AlterTable
ALTER TABLE "BookingsRepresentativenessByChannelType" ADD COLUMN     "totalAllRepresentativeness" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "BookingsTicketAverageByChannelType" ADD COLUMN     "totalTicketAverage" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "BookingsTotalRentalsByChannelType" ADD COLUMN     "totalAllBookings" INTEGER NOT NULL;

-- DropTable
DROP TABLE "BookingsByChannelType";

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

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByChannelType_period_createdDate_channelType_key" ON "BookingsRevenueByChannelType"("period", "createdDate", "channelType");

-- AddForeignKey
ALTER TABLE "BookingsRevenueByChannelType" ADD CONSTRAINT "BookingsRevenueByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByChannelType" ADD CONSTRAINT "BookingsRevenueByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the `BookingsByRentalType` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `totalAllRentalsApartments` on table `BookingsTotalRentals` required. This step will fail if there are existing NULL values in that column.
  - Made the column `totalRentalsApartments` on table `BookingsTotalRentalsByPeriod` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "BookingsByRentalType" DROP CONSTRAINT "BookingsByRentalType_bookingsId_fkey";

-- DropForeignKey
ALTER TABLE "BookingsByRentalType" DROP CONSTRAINT "BookingsByRentalType_companyId_fkey";

-- AlterTable
ALTER TABLE "BookingsTotalRentals" ALTER COLUMN "totalAllRentalsApartments" SET NOT NULL;

-- AlterTable
ALTER TABLE "BookingsTotalRentalsByPeriod" ALTER COLUMN "totalRentalsApartments" SET NOT NULL;

-- DropTable
DROP TABLE "BookingsByRentalType";

-- CreateTable
CREATE TABLE "BookingsTotalRentalsByRentalType" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "rentalType" "RentalTypeEnum",
    "totalRentalsApartments" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentalsByRentalType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByRentalType_period_createdDate_rentalT_key" ON "BookingsTotalRentalsByRentalType"("period", "createdDate", "rentalType");

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByRentalType" ADD CONSTRAINT "BookingsTotalRentalsByRentalType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByRentalType" ADD CONSTRAINT "BookingsTotalRentalsByRentalType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

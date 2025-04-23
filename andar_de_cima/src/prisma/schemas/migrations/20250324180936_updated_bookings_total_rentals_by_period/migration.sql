/*
  Warnings:

  - You are about to drop the column `totalRentalsApartments` on the `BookingsTotalRentalsByPeriod` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[period,createdDate]` on the table `BookingsTotalRentalsByPeriod` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `totalBookings` to the `BookingsTotalRentalsByPeriod` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BookingsTotalRentalsByPeriod" DROP COLUMN "totalRentalsApartments",
ADD COLUMN     "totalBookings" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByPeriod_period_createdDate_key" ON "BookingsTotalRentalsByPeriod"("period", "createdDate");

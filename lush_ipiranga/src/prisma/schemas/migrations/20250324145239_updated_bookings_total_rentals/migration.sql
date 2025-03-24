/*
  Warnings:

  - You are about to drop the column `totalAllRentalsApartments` on the `BookingsTotalRentals` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[period,createdDate]` on the table `BookingsTotalRentals` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `totalAllBookings` to the `BookingsTotalRentals` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BookingsTotalRentals" DROP COLUMN "totalAllRentalsApartments",
ADD COLUMN     "totalAllBookings" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentals_period_createdDate_key" ON "BookingsTotalRentals"("period", "createdDate");

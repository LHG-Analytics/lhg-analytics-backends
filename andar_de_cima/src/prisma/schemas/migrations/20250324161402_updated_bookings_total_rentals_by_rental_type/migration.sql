/*
  Warnings:

  - You are about to drop the column `totalRentalsApartments` on the `BookingsTotalRentalsByRentalType` table. All the data in the column will be lost.
  - Added the required column `totalBookings` to the `BookingsTotalRentalsByRentalType` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BookingsTotalRentalsByRentalType" DROP COLUMN "totalRentalsApartments",
ADD COLUMN     "totalBookings" INTEGER NOT NULL;

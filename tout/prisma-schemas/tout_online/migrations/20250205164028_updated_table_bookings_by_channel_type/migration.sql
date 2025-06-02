/*
  Warnings:

  - You are about to drop the column `representativeness` on the `BookingsByChannelType` table. All the data in the column will be lost.
  - You are about to drop the column `totalTicketAverage` on the `BookingsByChannelType` table. All the data in the column will be lost.
  - Added the required column `totalAllValue` to the `BookingsByChannelType` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BookingsByChannelType" DROP COLUMN "representativeness",
DROP COLUMN "totalTicketAverage",
ADD COLUMN     "totalAllValue" DECIMAL(10,2) NOT NULL;

/*
  Warnings:

  - A unique constraint covering the columns `[period,createdDate,channelType]` on the table `BookingsTotalRentalsByChannelType` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "BookingsTotalRentalsByChannelType_period_createdDate_key";

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByChannelType_period_createdDate_channe_key" ON "BookingsTotalRentalsByChannelType"("period", "createdDate", "channelType");

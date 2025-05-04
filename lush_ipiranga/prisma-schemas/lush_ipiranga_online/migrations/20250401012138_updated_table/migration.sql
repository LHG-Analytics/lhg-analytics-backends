/*
  Warnings:

  - A unique constraint covering the columns `[period,createdDate]` on the table `BookingsTotalRentalsByPeriodEcommerce` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "BookingsTotalRentalsByPeriodEcommerce_period_createdDate_ch_key";

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByPeriodEcommerce_period_createdDate_key" ON "BookingsTotalRentalsByPeriodEcommerce"("period", "createdDate");

/*
  Warnings:

  - You are about to drop the `RestaurantTicketAverageByTotalRentalsByPeriod` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentalsByPeriod" DROP CONSTRAINT "RestaurantTicketAverageByTotalRentalsByPeriod_companyId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentalsByPeriod" DROP CONSTRAINT "RestaurantTicketAverageByTotalRentalsByPeriod_restaurantId_fkey";

-- DropTable
DROP TABLE "RestaurantTicketAverageByTotalRentalsByPeriod";

-- CreateTable
CREATE TABLE "RestaurantTicketAverageByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalTicketAverage" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantTicketAverageByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTicketAverageByPeriod_period_createdDate_key" ON "RestaurantTicketAverageByPeriod"("period", "createdDate");

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByPeriod" ADD CONSTRAINT "RestaurantTicketAverageByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByPeriod" ADD CONSTRAINT "RestaurantTicketAverageByPeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

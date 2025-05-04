/*
  Warnings:

  - You are about to drop the `RestaurantSalesPercentGroup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "RestaurantSalesPercentGroup" DROP CONSTRAINT "RestaurantSalesPercentGroup_companyId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesPercentGroup" DROP CONSTRAINT "RestaurantSalesPercentGroup_restaurantId_fkey";

-- DropTable
DROP TABLE "RestaurantSalesPercentGroup";

-- CreateTable
CREATE TABLE "RestaurantRevenueByGroupByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "consumptionGroup" "ConsumptionGroup" NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantRevenueByGroupByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByGroupByPeriod_period_createdDate_consump_key" ON "RestaurantRevenueByGroupByPeriod"("period", "createdDate", "consumptionGroup");

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByGroupByPeriod" ADD CONSTRAINT "RestaurantRevenueByGroupByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByGroupByPeriod" ADD CONSTRAINT "RestaurantRevenueByGroupByPeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

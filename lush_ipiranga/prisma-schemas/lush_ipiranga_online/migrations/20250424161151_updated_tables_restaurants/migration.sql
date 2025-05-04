-- DropForeignKey
ALTER TABLE "RestaurantRevenue" DROP CONSTRAINT "RestaurantRevenue_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategory" DROP CONSTRAINT "RestaurantRevenueByDrinkCategory_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategoryPercent" DROP CONSTRAINT "RestaurantRevenueByDrinkCategoryPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategory" DROP CONSTRAINT "RestaurantRevenueByFoodCategory_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategoryPercent" DROP CONSTRAINT "RestaurantRevenueByFoodCategoryPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategory" DROP CONSTRAINT "RestaurantRevenueByOthersCategory_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategoryPercent" DROP CONSTRAINT "RestaurantRevenueByOthersCategoryPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByPeriod" DROP CONSTRAINT "RestaurantRevenueByPeriod_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByPeriodPercent" DROP CONSTRAINT "RestaurantRevenueByPeriodPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSales" DROP CONSTRAINT "RestaurantSales_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategory" DROP CONSTRAINT "RestaurantSalesByDrinkCategory_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategoryPercent" DROP CONSTRAINT "RestaurantSalesByDrinkCategoryPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByFoodCategory" DROP CONSTRAINT "RestaurantSalesByFoodCategory_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByFoodCategoryPercent" DROP CONSTRAINT "RestaurantSalesByFoodCategoryPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByOthersCategory" DROP CONSTRAINT "RestaurantSalesByOthersCategory_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByOthersCategoryPercent" DROP CONSTRAINT "RestaurantSalesByOthersCategoryPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesPercentGroup" DROP CONSTRAINT "RestaurantSalesPercentGroup_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesRanking" DROP CONSTRAINT "RestaurantSalesRanking_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantTicketAverage" DROP CONSTRAINT "RestaurantTicketAverage_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentals" DROP CONSTRAINT "RestaurantTicketAverageByTotalRentals_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentalsByPeriod" DROP CONSTRAINT "RestaurantTicketAverageByTotalRentalsByPeriod_restaurantId_fkey";

-- AlterTable
ALTER TABLE "RestaurantRevenue" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantRevenueByDrinkCategory" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantRevenueByDrinkCategoryPercent" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantRevenueByFoodCategory" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantRevenueByFoodCategoryPercent" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantRevenueByOthersCategory" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantRevenueByOthersCategoryPercent" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantRevenueByPeriod" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantRevenueByPeriodPercent" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSales" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSalesByDrinkCategory" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSalesByDrinkCategoryPercent" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSalesByFoodCategory" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSalesByFoodCategoryPercent" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSalesByOthersCategory" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSalesByOthersCategoryPercent" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSalesPercentGroup" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSalesRanking" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantTicketAverage" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantTicketAverageByTotalRentals" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantTicketAverageByTotalRentalsByPeriod" ALTER COLUMN "restaurantId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "RestaurantRevenue" ADD CONSTRAINT "RestaurantRevenue_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriod" ADD CONSTRAINT "RestaurantRevenueByPeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriodPercent" ADD CONSTRAINT "RestaurantRevenueByPeriodPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategory" ADD CONSTRAINT "RestaurantRevenueByFoodCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategoryPercent" ADD CONSTRAINT "RestaurantRevenueByFoodCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategory" ADD CONSTRAINT "RestaurantRevenueByDrinkCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategoryPercent" ADD CONSTRAINT "RestaurantRevenueByDrinkCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategory" ADD CONSTRAINT "RestaurantRevenueByOthersCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategoryPercent" ADD CONSTRAINT "RestaurantRevenueByOthersCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSales" ADD CONSTRAINT "RestaurantSales_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesRanking" ADD CONSTRAINT "RestaurantSalesRanking_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesPercentGroup" ADD CONSTRAINT "RestaurantSalesPercentGroup_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByFoodCategory" ADD CONSTRAINT "RestaurantSalesByFoodCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByFoodCategoryPercent" ADD CONSTRAINT "RestaurantSalesByFoodCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategory" ADD CONSTRAINT "RestaurantSalesByDrinkCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategoryPercent" ADD CONSTRAINT "RestaurantSalesByDrinkCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByOthersCategory" ADD CONSTRAINT "RestaurantSalesByOthersCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByOthersCategoryPercent" ADD CONSTRAINT "RestaurantSalesByOthersCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverage" ADD CONSTRAINT "RestaurantTicketAverage_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentals" ADD CONSTRAINT "RestaurantTicketAverageByTotalRentals_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentalsByPeriod" ADD CONSTRAINT "RestaurantTicketAverageByTotalRentalsByPeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

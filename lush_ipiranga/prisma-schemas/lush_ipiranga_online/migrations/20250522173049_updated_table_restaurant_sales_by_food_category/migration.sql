/*
  Warnings:

  - You are about to drop the `RestaurantSalesByFoodCategoryPercent` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `totalSalesPercent` to the `RestaurantSalesByFoodCategory` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RestaurantSalesByFoodCategoryPercent" DROP CONSTRAINT "RestaurantSalesByFoodCategoryPercent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByFoodCategoryPercent" DROP CONSTRAINT "RestaurantSalesByFoodCategoryPercent_restaurantId_fkey";

-- AlterTable
ALTER TABLE "RestaurantSalesByFoodCategory" ADD COLUMN     "totalSalesPercent" DECIMAL(10,2) NOT NULL;

-- DropTable
DROP TABLE "RestaurantSalesByFoodCategoryPercent";

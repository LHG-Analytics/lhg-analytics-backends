/*
  Warnings:

  - You are about to drop the `RestaurantSalesByDrinkCategoryPercent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RestaurantSalesByOthersCategoryPercent` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `totalSalePercent` to the `RestaurantSalesByDrinkCategory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalSalesPercent` to the `RestaurantSalesByOthersCategory` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategoryPercent" DROP CONSTRAINT "RestaurantSalesByDrinkCategoryPercent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategoryPercent" DROP CONSTRAINT "RestaurantSalesByDrinkCategoryPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByOthersCategoryPercent" DROP CONSTRAINT "RestaurantSalesByOthersCategoryPercent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantSalesByOthersCategoryPercent" DROP CONSTRAINT "RestaurantSalesByOthersCategoryPercent_restaurantId_fkey";

-- AlterTable
ALTER TABLE "RestaurantSalesByDrinkCategory" ADD COLUMN     "totalSalePercent" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantSalesByOthersCategory" ADD COLUMN     "totalSalesPercent" DECIMAL(10,2) NOT NULL;

-- DropTable
DROP TABLE "RestaurantSalesByDrinkCategoryPercent";

-- DropTable
DROP TABLE "RestaurantSalesByOthersCategoryPercent";

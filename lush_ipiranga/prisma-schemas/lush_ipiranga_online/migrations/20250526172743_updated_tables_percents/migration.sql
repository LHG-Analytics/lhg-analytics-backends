/*
  Warnings:

  - You are about to drop the `RestaurantRevenueByDrinkCategoryPercent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RestaurantRevenueByFoodCategoryPercent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RestaurantRevenueByOthersCategoryPercent` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `totalValuePercent` to the `RestaurantRevenueByDrinkCategory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalValuePercent` to the `RestaurantRevenueByOthersCategory` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategoryPercent" DROP CONSTRAINT "RestaurantRevenueByDrinkCategoryPercent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategoryPercent" DROP CONSTRAINT "RestaurantRevenueByDrinkCategoryPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategoryPercent" DROP CONSTRAINT "RestaurantRevenueByFoodCategoryPercent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategoryPercent" DROP CONSTRAINT "RestaurantRevenueByFoodCategoryPercent_restaurantId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategoryPercent" DROP CONSTRAINT "RestaurantRevenueByOthersCategoryPercent_companyId_fkey";

-- DropForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategoryPercent" DROP CONSTRAINT "RestaurantRevenueByOthersCategoryPercent_restaurantId_fkey";

-- AlterTable
ALTER TABLE "RestaurantRevenueByDrinkCategory" ADD COLUMN     "totalValuePercent" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "RestaurantRevenueByOthersCategory" ADD COLUMN     "totalValuePercent" DECIMAL(10,2) NOT NULL;

-- DropTable
DROP TABLE "RestaurantRevenueByDrinkCategoryPercent";

-- DropTable
DROP TABLE "RestaurantRevenueByFoodCategoryPercent";

-- DropTable
DROP TABLE "RestaurantRevenueByOthersCategoryPercent";

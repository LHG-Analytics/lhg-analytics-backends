/*
  Warnings:

  - Added the required column `totalValuePercent` to the `RestaurantRevenueByFoodCategory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RestaurantRevenueByFoodCategory" ADD COLUMN     "totalValuePercent" DECIMAL(10,2) NOT NULL;

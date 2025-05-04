/*
  Warnings:

  - Added the required column `totalAllValue` to the `RestaurantRevenueByFoodCategory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RestaurantRevenueByFoodCategory" ADD COLUMN     "totalAllValue" DECIMAL(10,2) NOT NULL;

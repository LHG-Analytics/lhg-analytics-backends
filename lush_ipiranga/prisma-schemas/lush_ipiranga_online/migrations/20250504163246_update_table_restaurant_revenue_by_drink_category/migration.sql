/*
  Warnings:

  - Added the required column `totalAllValue` to the `RestaurantRevenueByDrinkCategory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RestaurantRevenueByDrinkCategory" ADD COLUMN     "totalAllValue" DECIMAL(10,2) NOT NULL;

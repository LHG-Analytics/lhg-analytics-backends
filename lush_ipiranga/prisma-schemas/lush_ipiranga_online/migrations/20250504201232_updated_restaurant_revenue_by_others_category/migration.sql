/*
  Warnings:

  - Added the required column `totalAllValue` to the `RestaurantRevenueByOthersCategory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RestaurantRevenueByOthersCategory" ADD COLUMN     "totalAllValue" DECIMAL(10,2) NOT NULL;

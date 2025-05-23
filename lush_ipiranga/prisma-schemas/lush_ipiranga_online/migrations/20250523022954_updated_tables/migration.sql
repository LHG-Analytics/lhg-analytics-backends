/*
  Warnings:

  - Added the required column `totalAllSales` to the `RestaurantSalesByOthersCategory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RestaurantSalesByOthersCategory" ADD COLUMN     "totalAllSales" INTEGER NOT NULL;

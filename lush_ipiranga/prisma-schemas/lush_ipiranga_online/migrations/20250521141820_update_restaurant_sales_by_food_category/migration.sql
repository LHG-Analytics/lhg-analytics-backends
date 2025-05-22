/*
  Warnings:

  - Added the required column `totalAllSales` to the `RestaurantSalesByFoodCategory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RestaurantSalesByFoodCategory" ADD COLUMN     "totalAllSales" INTEGER NOT NULL;

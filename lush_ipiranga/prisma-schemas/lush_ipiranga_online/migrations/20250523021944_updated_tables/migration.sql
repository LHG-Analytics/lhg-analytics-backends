/*
  Warnings:

  - Added the required column `totalAllSales` to the `RestaurantSalesByDrinkCategory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RestaurantSalesByDrinkCategory" ADD COLUMN     "totalAllSales" INTEGER NOT NULL;

/*
  Warnings:

  - Added the required column `totalAllAverageShiftCleaning` to the `CleaningsByWeek` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalSuitesCleanings` to the `CleaningsByWeek` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CleaningsByWeek" ADD COLUMN     "totalAllAverageShiftCleaning" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "totalSuitesCleanings" INTEGER NOT NULL;

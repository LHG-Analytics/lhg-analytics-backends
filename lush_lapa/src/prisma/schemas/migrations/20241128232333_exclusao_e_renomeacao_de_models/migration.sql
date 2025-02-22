/*
  Warnings:

  - You are about to drop the `CleaningInspections` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CleaningInspectionsByPeriod` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CleaningInspectionsByPeriodAverageClean` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CleaningInspections" DROP CONSTRAINT "CleaningInspections_companyId_fkey";

-- DropForeignKey
ALTER TABLE "CleaningInspectionsByPeriod" DROP CONSTRAINT "CleaningInspectionsByPeriod_companyId_fkey";

-- DropForeignKey
ALTER TABLE "CleaningInspectionsByPeriodAverageClean" DROP CONSTRAINT "CleaningInspectionsByPeriodAverageClean_companyId_fkey";

-- DropTable
DROP TABLE "CleaningInspections";

-- DropTable
DROP TABLE "CleaningInspectionsByPeriod";

-- DropTable
DROP TABLE "CleaningInspectionsByPeriodAverageClean";

-- CreateTable
CREATE TABLE "Cleanings" (
    "id" SERIAL NOT NULL,
    "employeeName" TEXT NOT NULL,
    "totalSuitesCleanings" INTEGER NOT NULL,
    "totalDaysWorked" INTEGER NOT NULL,
    "shift" TEXT NOT NULL,
    "averageDailyCleaning" DECIMAL(65,30) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "Cleanings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningsByPeriod" (
    "id" SERIAL NOT NULL,
    "totalSuitesCleanings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "CleaningsByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cleanings_employeeName_createdDate_period_key" ON "Cleanings"("employeeName", "createdDate", "period");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningsByPeriod_period_createdDate_key" ON "CleaningsByPeriod"("period", "createdDate");

-- AddForeignKey
ALTER TABLE "Cleanings" ADD CONSTRAINT "Cleanings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByPeriod" ADD CONSTRAINT "CleaningsByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

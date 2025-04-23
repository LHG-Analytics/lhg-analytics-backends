/*
  Warnings:

  - Added the required column `totalAllAverageDailyCleaning` to the `Cleanings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAllSuitesCleanings` to the `Cleanings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Cleanings" ADD COLUMN     "governanceId" INTEGER,
ADD COLUMN     "totalAllAverageDailyCleaning" INTEGER NOT NULL,
ADD COLUMN     "totalAllSuitesCleanings" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "CleaningsByPeriod" ADD COLUMN     "governanceId" INTEGER;

-- CreateTable
CREATE TABLE "Governance" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "Governance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningsByPeriodShift" (
    "id" SERIAL NOT NULL,
    "totalSuitesCleanings" INTEGER NOT NULL,
    "employeeName" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "companyId" INTEGER NOT NULL,
    "governanceId" INTEGER,

    CONSTRAINT "CleaningsByPeriodShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningsByWeek" (
    "id" SERIAL NOT NULL,
    "totalAverageDailyWeekCleaning" DECIMAL(65,30) NOT NULL,
    "totalAverageShiftCleaning" DECIMAL(65,30) NOT NULL,
    "averageDailyWeekCleaning" DECIMAL(65,30) NOT NULL,
    "idealShiftMaid" INTEGER NOT NULL,
    "totalIdealShiftMaid" INTEGER NOT NULL,
    "realShiftMaid" INTEGER NOT NULL,
    "totalRealShiftMaid" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "totalDifference" INTEGER NOT NULL,
    "period" "PeriodEnum",
    "shift" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "governanceId" INTEGER,

    CONSTRAINT "CleaningsByWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspections" (
    "id" SERIAL NOT NULL,
    "employeeName" TEXT NOT NULL,
    "totalInspections" INTEGER NOT NULL,
    "totalAllInspections" INTEGER NOT NULL,
    "period" "PeriodEnum",
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "governanceId" INTEGER,

    CONSTRAINT "Inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Governance_companyId_key" ON "Governance"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningsByPeriodShift_period_createdDate_employeeName_key" ON "CleaningsByPeriodShift"("period", "createdDate", "employeeName");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningsByWeek_period_shift_createdDate_key" ON "CleaningsByWeek"("period", "shift", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "Inspections_employeeName_period_createdDate_key" ON "Inspections"("employeeName", "period", "createdDate");

-- AddForeignKey
ALTER TABLE "Governance" ADD CONSTRAINT "Governance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cleanings" ADD CONSTRAINT "Cleanings_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByPeriod" ADD CONSTRAINT "CleaningsByPeriod_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByPeriodShift" ADD CONSTRAINT "CleaningsByPeriodShift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByPeriodShift" ADD CONSTRAINT "CleaningsByPeriodShift_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByWeek" ADD CONSTRAINT "CleaningsByWeek_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningsByWeek" ADD CONSTRAINT "CleaningsByWeek_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspections" ADD CONSTRAINT "Inspections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspections" ADD CONSTRAINT "Inspections_governanceId_fkey" FOREIGN KEY ("governanceId") REFERENCES "Governance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

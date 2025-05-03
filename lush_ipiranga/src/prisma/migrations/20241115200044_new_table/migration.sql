-- CreateTable
CREATE TABLE "CleaningInspections" (
    "id" SERIAL NOT NULL,
    "employeeName" TEXT NOT NULL,
    "totalSuitesCleanings" INTEGER NOT NULL,
    "totalDaysWorked" INTEGER NOT NULL,
    "shift" TEXT NOT NULL,
    "averageDailyCleaning" DECIMAL(65,30) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "CleaningInspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningInspectionsByPeriod" (
    "id" SERIAL NOT NULL,
    "totalSuitesCleanings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "CleaningInspectionsByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningInspectionsByPeriodAverageClean" (
    "id" SERIAL NOT NULL,
    "averageDailyCleaning" DECIMAL(65,30) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "CleaningInspectionsByPeriodAverageClean_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CleaningInspections_employeeName_createdDate_period_key" ON "CleaningInspections"("employeeName", "createdDate", "period");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningInspectionsByPeriod_period_createdDate_key" ON "CleaningInspectionsByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningInspectionsByPeriodAverageClean_period_createdDate_key" ON "CleaningInspectionsByPeriodAverageClean"("period", "createdDate");

-- AddForeignKey
ALTER TABLE "CleaningInspections" ADD CONSTRAINT "CleaningInspections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningInspectionsByPeriod" ADD CONSTRAINT "CleaningInspectionsByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningInspectionsByPeriodAverageClean" ADD CONSTRAINT "CleaningInspectionsByPeriodAverageClean_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

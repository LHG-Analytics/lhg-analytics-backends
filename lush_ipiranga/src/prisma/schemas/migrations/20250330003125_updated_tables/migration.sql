/*
  Warnings:

  - You are about to drop the column `representativenessGoal` on the `BookingsRepresentativeness` table. All the data in the column will be lost.
  - You are about to drop the column `totalAllRepresentativeness` on the `BookingsRepresentativenessByPeriod` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[period,createdDate]` on the table `BookingsRepresentativeness` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[period,createdDate]` on the table `BookingsRepresentativenessByPeriod` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `totalRepresentativeness` to the `BookingsRepresentativenessByPeriod` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BookingsRepresentativeness" DROP COLUMN "representativenessGoal";

-- AlterTable
ALTER TABLE "BookingsRepresentativenessByPeriod" DROP COLUMN "totalAllRepresentativeness",
ADD COLUMN     "totalRepresentativeness" DECIMAL(10,2) NOT NULL;

-- CreateTable
CREATE TABLE "BookingsRepresentativenessByChannelType" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalRepresentativeness" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRepresentativenessByChannelType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRepresentativenessByChannelType_period_createdDate__key" ON "BookingsRepresentativenessByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRepresentativeness_period_createdDate_key" ON "BookingsRepresentativeness"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRepresentativenessByPeriod_period_createdDate_key" ON "BookingsRepresentativenessByPeriod"("period", "createdDate");

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByChannelType" ADD CONSTRAINT "BookingsRepresentativenessByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByChannelType" ADD CONSTRAINT "BookingsRepresentativenessByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the `BookingsByPayment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BookingsByPayment" DROP CONSTRAINT "BookingsByPayment_bookingsId_fkey";

-- DropForeignKey
ALTER TABLE "BookingsByPayment" DROP CONSTRAINT "BookingsByPayment_companyId_fkey";

-- DropTable
DROP TABLE "BookingsByPayment";

-- CreateTable
CREATE TABLE "BookingsRevenueByPayment" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "paymentMethod" TEXT NOT NULL,
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRevenueByPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByPayment_period_createdDate_paymentMethod_key" ON "BookingsRevenueByPayment"("period", "createdDate", "paymentMethod");

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPayment" ADD CONSTRAINT "BookingsRevenueByPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPayment" ADD CONSTRAINT "BookingsRevenueByPayment_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

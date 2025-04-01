-- CreateTable
CREATE TABLE "BookingsRevenueByPeriodEcommerce" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsRevenueByPeriodEcommerce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsTotalRentalsByPeriodEcommerce" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalBookings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentalsByPeriodEcommerce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingsRevenueByPeriodEcommerce_period_createdDate_key" ON "BookingsRevenueByPeriodEcommerce"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByPeriodEcommerce_period_createdDate_ch_key" ON "BookingsTotalRentalsByPeriodEcommerce"("period", "createdDate", "channelType");

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPeriodEcommerce" ADD CONSTRAINT "BookingsRevenueByPeriodEcommerce_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPeriodEcommerce" ADD CONSTRAINT "BookingsRevenueByPeriodEcommerce_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriodEcommerce" ADD CONSTRAINT "BookingsTotalRentalsByPeriodEcommerce_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriodEcommerce" ADD CONSTRAINT "BookingsTotalRentalsByPeriodEcommerce_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

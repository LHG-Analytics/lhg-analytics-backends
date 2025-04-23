-- CreateTable
CREATE TABLE "BookingsTotalRentalsByChannelType" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalBookings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTotalRentalsByChannelType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTotalRentalsByChannelType_period_createdDate_key" ON "BookingsTotalRentalsByChannelType"("period", "createdDate");

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByChannelType" ADD CONSTRAINT "BookingsTotalRentalsByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByChannelType" ADD CONSTRAINT "BookingsTotalRentalsByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

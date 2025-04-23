-- CreateTable
CREATE TABLE "BookingsTicketAverageByChannelType" (
    "id" SERIAL NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "period" "PeriodEnum",
    "channelType" "ChannelTypeEnum",
    "totalAllTicketAverage" DECIMAL(10,2) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsTicketAverageByChannelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingsByPayment" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "paymentMethod" TEXT NOT NULL,
    "totalBookings" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bookingsId" INTEGER,

    CONSTRAINT "BookingsByPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingsTicketAverageByChannelType_period_createdDate_chann_key" ON "BookingsTicketAverageByChannelType"("period", "createdDate", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "BookingsByPayment_period_createdDate_paymentMethod_key" ON "BookingsByPayment"("period", "createdDate", "paymentMethod");

-- AddForeignKey
ALTER TABLE "BookingsTicketAverageByChannelType" ADD CONSTRAINT "BookingsTicketAverageByChannelType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverageByChannelType" ADD CONSTRAINT "BookingsTicketAverageByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByPayment" ADD CONSTRAINT "BookingsByPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByPayment" ADD CONSTRAINT "BookingsByPayment_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

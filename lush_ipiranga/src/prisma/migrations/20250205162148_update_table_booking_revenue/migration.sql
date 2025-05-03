-- DropForeignKey
ALTER TABLE "BookingsByChannelType" DROP CONSTRAINT "BookingsByChannelType_id_fkey";

-- DropForeignKey
ALTER TABLE "BookingsByRentalType" DROP CONSTRAINT "BookingsByRentalType_id_fkey";

-- DropForeignKey
ALTER TABLE "BookingsRepresentativeness" DROP CONSTRAINT "BookingsRepresentativeness_id_fkey";

-- DropForeignKey
ALTER TABLE "BookingsRepresentativenessByPeriod" DROP CONSTRAINT "BookingsRepresentativenessByPeriod_id_fkey";

-- DropForeignKey
ALTER TABLE "BookingsRevenueByPeriod" DROP CONSTRAINT "BookingsRevenueByPeriod_id_fkey";

-- DropForeignKey
ALTER TABLE "BookingsTicketAverage" DROP CONSTRAINT "BookingsTicketAverage_id_fkey";

-- DropForeignKey
ALTER TABLE "BookingsTotalRentals" DROP CONSTRAINT "BookingsTotalRentals_id_fkey";

-- DropForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriod" DROP CONSTRAINT "BookingsTotalRentalsByPeriod_id_fkey";

-- AlterTable
ALTER TABLE "BookingsByChannelType" ADD COLUMN     "bookingsId" INTEGER;

-- AlterTable
ALTER TABLE "BookingsByRentalType" ADD COLUMN     "bookingsId" INTEGER;

-- AlterTable
ALTER TABLE "BookingsRepresentativeness" ADD COLUMN     "bookingsId" INTEGER;

-- AlterTable
ALTER TABLE "BookingsRepresentativenessByPeriod" ADD COLUMN     "bookingsId" INTEGER;

-- AlterTable
ALTER TABLE "BookingsRevenueByPeriod" ADD COLUMN     "bookingsId" INTEGER;

-- AlterTable
ALTER TABLE "BookingsTicketAverage" ADD COLUMN     "bookingsId" INTEGER;

-- AlterTable
ALTER TABLE "BookingsTotalRentals" ADD COLUMN     "bookingsId" INTEGER;

-- AlterTable
ALTER TABLE "BookingsTotalRentalsByPeriod" ADD COLUMN     "bookingsId" INTEGER;

-- AddForeignKey
ALTER TABLE "BookingsRevenueByPeriod" ADD CONSTRAINT "BookingsRevenueByPeriod_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByRentalType" ADD CONSTRAINT "BookingsByRentalType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsByChannelType" ADD CONSTRAINT "BookingsByChannelType_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTicketAverage" ADD CONSTRAINT "BookingsTicketAverage_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativeness" ADD CONSTRAINT "BookingsRepresentativeness_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsRepresentativenessByPeriod" ADD CONSTRAINT "BookingsRepresentativenessByPeriod_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentals" ADD CONSTRAINT "BookingsTotalRentals_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingsTotalRentalsByPeriod" ADD CONSTRAINT "BookingsTotalRentalsByPeriod_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

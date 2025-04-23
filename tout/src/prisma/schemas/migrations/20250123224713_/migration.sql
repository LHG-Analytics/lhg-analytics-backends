-- DropForeignKey
ALTER TABLE "BookingsRevenue" DROP CONSTRAINT "BookingsRevenue_id_fkey";

-- AlterTable
ALTER TABLE "BookingsRevenue" ADD COLUMN     "bookingsId" INTEGER;

-- AddForeignKey
ALTER TABLE "BookingsRevenue" ADD CONSTRAINT "BookingsRevenue_bookingsId_fkey" FOREIGN KEY ("bookingsId") REFERENCES "Bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

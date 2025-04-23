import { Module } from '@nestjs/common';
import { CronJobsService } from './cron-jobs.service';
import { CronJobsController } from './cron-jobs.controller';
import { KpiAlosService } from './kpiAlos/kpiAlos.service';
import { KpiGiroService } from './kpiGiro/kpiGiro.service';
import { KpiOccupancyRateService } from './kpiOccupancyRate/kpiOccupancyRate.service';
import { KpiRevenueService } from './kpiRevenue/kpiRevenue.service';
import { KpiRevparService } from './kpiRevpar/kpiRevpar.service';
import { KpiTicketAverageService } from './kpiTicketAverage/kpiTicketAverage.service';
import { KpiTotalRentalsService } from './kpiTotalRentals/kpiTotalRentals.service';
import { KpiTrevparService } from './kpiTrevpar/kpiTrevpar.service';
import { CleaningsService } from './cleanings/cleanings.service';
import { ApartmentInspectionService } from './apartmentInspection/apartment-inspection.service';
import { BookingsTotalRentalsService } from './bookingsTotalRentals/bookingsTotalRentals.service';
import { BookingsTicketAverageService } from './bookingsTicketAverage/bookingsTicketAverage.service';
import { BookingsRepresentativenessService } from './bookingsRepresentativeness/bookingsRepresentativeness.service';
import { BookingsRevenueService } from './bookingsRevenue/bookingsRevenue.service';

@Module({
  imports: [],
  controllers: [CronJobsController],
  providers: [
    CronJobsService,
    KpiAlosService,
    KpiGiroService,
    KpiOccupancyRateService,
    KpiRevenueService,
    KpiRevparService,
    KpiTicketAverageService,
    KpiTotalRentalsService,
    KpiTrevparService,
    CleaningsService,
    ApartmentInspectionService,
    BookingsRevenueService,
    BookingsTotalRentalsService,
    BookingsTicketAverageService,
    BookingsRepresentativenessService,
  ],
})
export class CronJobsModule {}

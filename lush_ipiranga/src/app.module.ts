import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { KpiAlosModule } from './kpiAlos/kpiAlos.module';
import { KpiRevenueModule } from './kpiRevenue/kpiRevenue.module';
import { KpiTotalRentalsModule } from './kpiTotalRentals/kpiTotalRentals.module';
import { KpiTicketAverageModule } from './kpiTicketAverage/kpiTicketAverage.module';
import { KpiOccupancyRateModule } from './kpiOccupancyRate/kpiOccupancyRate.module';
import { KpiGiroModule } from './kpiGiro/kpiGiro.module';
import { KpiRevparModule } from './kpiRevpar/kpiRevpar.module';
import { KpiTrevparModule } from './kpiTrevpar/kpiTrevpar.module';
import { CompanyModule } from './company/company.module';
import { CronJobsService } from './cron-jobs.service';
import { CronJobsModule } from './cron-jobs.module';
import { CleaningsModule } from './cleanings/cleanings.module';
import { ApartmentInspectionModule } from './apartmentInspection/apartment-inspection.module';
import { GovernanceModule } from './governance/governance.module';
import { BookingsRevenueModule } from './bookingsRevenue/bookingsRevenue.module';
import { BookingsTotalRentalsModule } from './bookingsTotalRentals/bookingsTotalRentals.module';
import { BookingsTicketAverageModule } from './bookingsTicketAverage/bookingsTicketAverage.module';
import { BookingsRepresentativenessModule } from './bookingsRepresentativeness/bookingsRepresentativeness.module';
import { BookingsModule } from './bookings/bookings.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard'; // Importa o guard de autenticação
import { RestaurantModule } from './restaurant/restaurant.module';
import { RestaurantRevenueModule } from './restaurantRevenue/restaurantRevenue.module';
import { RestaurantSalesModule } from './restaurantSales/restaurantSales.module';
import { RestaurantTicketAverageModule } from './restaurantTicketAverage/restaurantTicketAverage.module';
import { RestaurantCostsModule } from './restaurantCosts/restaurantCosts.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    UserModule,
    PrismaModule,
    KpiAlosModule,
    KpiRevenueModule,
    KpiTotalRentalsModule,
    KpiTicketAverageModule,
    KpiOccupancyRateModule,
    KpiGiroModule,
    KpiRevparModule,
    KpiTrevparModule,
    CompanyModule,
    CronJobsModule,
    CleaningsModule,
    ApartmentInspectionModule,
    GovernanceModule,
    BookingsRevenueModule,
    BookingsTotalRentalsModule,
    BookingsTicketAverageModule,
    BookingsRepresentativenessModule,
    BookingsModule,
    RestaurantModule,
    RestaurantRevenueModule,
    RestaurantSalesModule,
    RestaurantTicketAverageModule,
    RestaurantCostsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    CronJobsService,
    //{
    //provide: APP_GUARD,
    // useClass: JwtAuthGuard, // Aplicado o guard de autenticação globalmente
    // },
  ],
})
export class AppModule {}

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
import * as moment from 'moment-timezone';
import { BookingsRevenueService } from './bookingsRevenue/bookingsRevenue.service';
import { BookingsTotalRentalsService } from './bookingsTotalRentals/bookingsTotalRentals.service';
import { BookingsTicketAverageService } from './bookingsTicketAverage/bookingsTicketAverage.service';
import { BookingsRepresentativenessService } from './bookingsRepresentativeness/bookingsRepresentativeness.service';

@Injectable()
export class CronJobsService {
  private isJobRunning = false; // Flag para verificar se o job está em execução

  constructor(
    private readonly kpiAlosService: KpiAlosService,
    private readonly kpiGiroService: KpiGiroService,
    private readonly kpiOccupancyRateService: KpiOccupancyRateService,
    private readonly kpiRevenueService: KpiRevenueService,
    private readonly kpiRevparService: KpiRevparService,
    private readonly kpiTicketAverageService: KpiTicketAverageService,
    private readonly kpiTotalRentalsService: KpiTotalRentalsService,
    private readonly kpiTrevparService: KpiTrevparService,
    private readonly cleaningsService: CleaningsService,
    private readonly apartmentInspectionService: ApartmentInspectionService,
    private readonly bookingsRevenue: BookingsRevenueService,
    private readonly bookingsTotalRental: BookingsTotalRentalsService,
    private readonly bookingsTicketAverage: BookingsTicketAverageService,
    private readonly bookingsRepresentativeness: BookingsRepresentativenessService,
  ) {}

  //@Cron('0 0,6,16 * * *', { timeZone: 'America/Sao_Paulo' })
  async scheduleDailyJobs() {
    if (this.isJobRunning) {
      console.log('O cron job já está em execução. Ignorando nova execução.');
      return; // Se o job já está em execução, não faz nada
    }

    this.isJobRunning = true; // Define a flag como true
    const startTime = moment()
      .tz('America/Sao_Paulo')
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início da execução dos CronJobs do Andar de Cima: ${startTime}`,
    );

    try {
      await this.kpiAlosService.handleCron();
      await this.kpiGiroService.handleCron();
      await this.kpiRevparService.handleCron();
      await this.kpiTotalRentalsService.handleCron();
      await this.kpiTicketAverageService.handleCron();
      await this.kpiTrevparService.handleCron();
      await this.kpiRevenueService.handleCron();
      await this.kpiOccupancyRateService.handleCron();
      await this.cleaningsService.handleCron();
      await this.apartmentInspectionService.handleCron();
      await this.bookingsRevenue.handleCron();
      await this.bookingsTotalRental.handleCron();
      await this.bookingsTicketAverage.handleCron();
      await this.bookingsRepresentativeness.handleCron();
    } catch (error) {
      console.error('Erro ao executar os CronJobs do Andar de Cima:', error);
    } finally {
      this.isJobRunning = false; // Define a flag como false no final
    }

    const endTime = moment()
      .tz('America/Sao_Paulo')
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(`Fim da execução dos CronJobs do Andar de Cima: ${endTime}`);
  }
}

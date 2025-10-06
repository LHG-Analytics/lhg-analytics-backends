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
import { RestaurantRevenueService } from './restaurantRevenue/restaurantRevenue.service';
import { RestaurantSalesService } from './restaurantSales/restaurantSales.service';
import { RestaurantTicketAverageService } from './restaurantTicketAverage/restaurantTicketAverage.service';

export interface JobStatus {
  jobId: string;
  status: 'running' | 'completed' | 'error';
  startTime: Date;
  endTime?: Date;
  progress: number;
  currentTask?: string;
  error?: string;
  results?: any;
}

@Injectable()
export class CronJobsService {
  private isJobRunning = false;
  private jobs = new Map<string, JobStatus>();

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
    private readonly restaurantRevenue: RestaurantRevenueService,
    private readonly restaurantSales: RestaurantSalesService,
    private readonly restaurantTicketAverage: RestaurantTicketAverageService,
  ) {}

  @Cron('1 0,6,16 * * *', { timeZone: 'America/Sao_Paulo' })
  async scheduleDailyJobs() {
    if (this.isJobRunning) {
      console.log('O cron job já está em execução. Ignorando nova execução.');
      return; // Se o job já está em execução, não faz nada
    }

    this.isJobRunning = true; // Define a flag como true
    const startTime = moment().tz('America/Sao_Paulo').format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início da execução dos CronJobs do Tout: ${startTime}`);

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
      await this.restaurantRevenue.handleCron();
      await this.restaurantSales.handleCron();
      await this.restaurantTicketAverage.handleCron();
    } catch (error) {
      console.error('Erro ao executar os CronJobs do Tout:', error);
    } finally {
      this.isJobRunning = false; // Define a flag como false no final
    }

    const endTime = moment().tz('America/Sao_Paulo').format('DD-MM-YYYY HH:mm:ss');
    console.log(`Fim da execução dos CronJobs do Tout: ${endTime}`);
  }

  generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async startBackgroundExecution(): Promise<any> {
    if (this.isJobRunning) {
      throw new Error(
        'Cron jobs já estão em execução. Use GET /status/{jobId} para acompanhar o progresso.',
      );
    }

    const jobId = this.generateJobId();
    const jobStatus: JobStatus = {
      jobId,
      status: 'running',
      startTime: new Date(),
      progress: 0,
      currentTask: 'Iniciando execução dos cron jobs...',
    };

    this.jobs.set(jobId, jobStatus);
    this.isJobRunning = true;

    setImmediate(() => {
      this.executeJobsInBackground(jobId, [
        { name: 'KpiAlos', service: this.kpiAlosService },
        { name: 'KpiGiro', service: this.kpiGiroService },
        { name: 'KpiRevpar', service: this.kpiRevparService },
        { name: 'KpiTotalRentals', service: this.kpiTotalRentalsService },
        { name: 'KpiTicketAverage', service: this.kpiTicketAverageService },
        { name: 'KpiTrevpar', service: this.kpiTrevparService },
        { name: 'KpiRevenue', service: this.kpiRevenueService },
        { name: 'KpiOccupancyRate', service: this.kpiOccupancyRateService },
        { name: 'Cleanings', service: this.cleaningsService },
        { name: 'Inspections', service: this.apartmentInspectionService },
        { name: 'BookingsRevenue', service: this.bookingsRevenue },
        { name: 'BookingsTotalRentals', service: this.bookingsTotalRental },
        { name: 'BookingsTicketAverage', service: this.bookingsTicketAverage },
        { name: 'BookingsRepresentativeness', service: this.bookingsRepresentativeness },
        { name: 'RestaurantRevenue', service: this.restaurantRevenue },
        { name: 'RestaurantSales', service: this.restaurantSales },
        { name: 'RestaurantTicketAverage', service: this.restaurantTicketAverage },
      ]);
    });

    return {
      jobId,
      message: 'Cron jobs iniciados em background',
      statusUrl: `/CronJobs/status/${jobId}`,
    };
  }

  private async executeJobsInBackground(jobId: string, services: any[]) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      const totalSteps = services.length;
      let completedSteps = 0;

      for (const { name, service } of services) {
        if (!job) break;

        job.currentTask = `Executando ${name}...`;
        job.progress = Math.round((completedSteps / totalSteps) * 100);
        this.jobs.set(jobId, job);

        try {
          await service.handleCron();
          completedSteps++;
        } catch (error) {
          console.error(`Erro ao executar ${name}:`, error);
        }
      }

      job.status = 'completed';
      job.endTime = new Date();
      job.progress = 100;
      job.currentTask = 'Execução finalizada com sucesso';
      job.results = {
        totalServices: services.length,
        completedServices: completedSteps,
        executionTime: job.endTime.getTime() - job.startTime.getTime(),
      };
    } catch (error) {
      job.status = 'error';
      job.endTime = new Date();
      job.error = error.message;
      job.currentTask = 'Erro na execução';
    } finally {
      this.isJobRunning = false;
      this.jobs.set(jobId, job);

      setTimeout(() => {
        this.jobs.delete(jobId);
      }, 300000);
    }
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(
        `Job com ID ${jobId} não encontrado ou já foi finalizado há mais de 5 minutos.`,
      );
    }
    return job;
  }
}

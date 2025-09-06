import { Injectable, Logger } from '@nestjs/common';
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

interface JobStatus {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  results?: any[];
  error?: string;
  totalServices: number;
}

@Injectable()
export class CronJobsService {
  private readonly logger = new Logger(CronJobsService.name);
  private isJobRunning = false; // Flag para verificar se o job está em execução
  private jobStatuses: Map<string, JobStatus> = new Map();

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

  @Cron('3 0,6,16 * * *', { timeZone: 'America/Sao_Paulo' })
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
      await this.restaurantRevenue.handleCron();
      await this.restaurantSales.handleCron();
      await this.restaurantTicketAverage.handleCron();
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

  /**
   * P0-001: Background Job System Implementation
   * Solves the critical issue of 60+ minute response times
   */
  async startBackgroundExecution(): Promise<any> {
    if (this.isJobRunning) {
      throw new Error('Cron jobs já estão em execução. Use GET /status/{jobId} para acompanhar o progresso.');
    }

    const jobId = this.generateJobId();
    const services = this.getAllServices();
    
    // Create job status
    const jobStatus: JobStatus = {
      id: jobId,
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
      totalServices: services.length,
    };
    
    this.jobStatuses.set(jobId, jobStatus);
    
    // Execute in background without blocking the response
    setImmediate(() => {
      this.executeJobsInBackground(jobId, services);
    });
    
    return {
      jobId,
      message: 'Cron jobs iniciados em background',
      statusUrl: `/CronJobs/status/${jobId}`,
      estimatedDuration: '15-30 minutos',
      totalServices: services.length,
      startedAt: jobStatus.startedAt
    };
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const status = this.jobStatuses.get(jobId);
    
    if (!status) {
      throw new Error(`Job não encontrado: ${jobId}`);
    }
    
    return status;
  }

  private async executeJobsInBackground(jobId: string, services: any[]): Promise<void> {
    const jobStatus = this.jobStatuses.get(jobId);
    if (!jobStatus) return;

    this.isJobRunning = true;
    jobStatus.status = 'running';
    
    this.logger.log(`Starting background cron job execution. Job ID: ${jobId}`);
    
    try {
      const results = [];
      
      for (let i = 0; i < services.length; i++) {
        const serviceName = services[i].constructor.name;
        this.logger.log(`Executing cron job ${i + 1}/${services.length}: ${serviceName}`);
        
        try {
          await services[i].handleCron();
          results.push({ service: serviceName, status: 'success', completedAt: new Date() });
        } catch (error) {
          this.logger.error(`Cron job failed for ${serviceName}: ${error.message}`);
          results.push({ 
            service: serviceName, 
            status: 'failed', 
            error: error.message,
            completedAt: new Date()
          });
        }
        
        // Update progress
        const progress = Math.round(((i + 1) / services.length) * 100);
        jobStatus.progress = progress;
        jobStatus.results = results;
      }
      
      // Job completed successfully
      jobStatus.status = 'completed';
      jobStatus.completedAt = new Date();
      jobStatus.progress = 100;
      
      const duration = jobStatus.completedAt.getTime() - jobStatus.startedAt!.getTime();
      this.logger.log(`Cron job execution completed. Job ID: ${jobId}, Duration: ${duration}ms`);
      
    } catch (error) {
      // Job failed
      jobStatus.status = 'failed';
      jobStatus.error = error.message;
      jobStatus.completedAt = new Date();
      
      this.logger.error(`Background cron job execution failed. Job ID: ${jobId}, Error: ${error.message}`);
    } finally {
      this.isJobRunning = false;
      
      // Clean up old job statuses (keep only last 10)
      this.cleanupOldJobs();
    }
  }

  private getAllServices(): any[] {
    return [
      this.kpiAlosService,
      this.kpiGiroService,
      this.kpiRevparService,
      this.kpiTotalRentalsService,
      this.kpiTicketAverageService,
      this.kpiTrevparService,
      this.kpiRevenueService,
      this.kpiOccupancyRateService,
      this.cleaningsService,
      this.apartmentInspectionService,
      this.bookingsRevenue,
      this.bookingsTotalRental,
      this.bookingsTicketAverage,
      this.bookingsRepresentativeness,
      this.restaurantRevenue,
      this.restaurantSales,
      this.restaurantTicketAverage,
    ];
  }

  private generateJobId(): string {
    return `cron-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  }

  private cleanupOldJobs(): void {
    const jobs = Array.from(this.jobStatuses.values()).sort((a, b) => 
      (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0)
    );
    
    // Keep only the last 10 jobs
    if (jobs.length > 10) {
      const jobsToRemove = jobs.slice(10);
      jobsToRemove.forEach(job => {
        this.jobStatuses.delete(job.id);
      });
    }
  }
}

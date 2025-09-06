import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';

@Processor('cron-jobs')
export class CronJobProcessor {
  private readonly logger = new Logger(CronJobProcessor.name);

  @Process('execute-all-crons')
  async handleCronExecution(job: Job) {
    const { services, jobId, startedAt } = job.data;
    
    this.logger.log(`Starting cron job execution. Job ID: ${jobId}`);
    
    try {
      const results = [];
      
      // Execute cron jobs with progress tracking
      for (let i = 0; i < services.length; i++) {
        const serviceName = services[i].constructor.name;
        this.logger.log(`Executing cron job ${i + 1}/${services.length}: ${serviceName}`);
        
        try {
          await services[i].handleCron();
          results.push({ service: serviceName, status: 'success' });
        } catch (error) {
          this.logger.error(`Cron job failed for ${serviceName}: ${error.message}`);
          results.push({ service: serviceName, status: 'failed', error: error.message });
        }
        
        // Update progress
        const progress = Math.round(((i + 1) / services.length) * 100);
        job.progress(progress);
      }
      
      const completedAt = new Date();
      const duration = completedAt.getTime() - new Date(startedAt).getTime();
      
      this.logger.log(`Cron job execution completed. Duration: ${duration}ms`);
      
      return { 
        success: true, 
        completedAt,
        duration,
        results,
        totalServices: services.length,
        successCount: results.filter(r => r.status === 'success').length,
        failedCount: results.filter(r => r.status === 'failed').length
      };
    } catch (error) {
      this.logger.error(`Cron job execution failed: ${error.message}`);
      throw new Error(`Cron job failed: ${error.message}`);
    }
  }
}
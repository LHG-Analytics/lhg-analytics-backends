import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CronJobsService } from './cron-jobs.service';

@ApiTags('CronJobs')
@Controller('CronJobs')
export class CronJobsController {
  constructor(private readonly cronJobsService: CronJobsService) {}

  @Get('execute')
  @ApiOperation({ summary: 'Executa manualmente todos os cron jobs' })
  @ApiResponse({
    status: 200,
    description: 'Cron jobs executados com sucesso.',
  })
  @ApiResponse({
    status: 500,
    description: 'Erro ao executar cron jobs manualmente.',
  })
  async executeCronJobsManually() {
    try {
      await this.cronJobsService.scheduleDailyJobs();
      return {
        message: 'Execução manual dos cron jobs concluída com sucesso.',
      };
    } catch (error) {
      throw new HttpException(
        'Erro ao executar cron jobs manualmente: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

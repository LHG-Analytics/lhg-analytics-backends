import { Controller, Get, Post, Param, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CronJobsService, JobStatus } from './cron-jobs.service';

@ApiTags('CronJobs')
@Controller('CronJobs')
export class CronJobsController {
  constructor(private readonly cronJobsService: CronJobsService) {}

  @Post('execute')
  @ApiOperation({ summary: 'Executa manualmente todos os cron jobs' })
  @ApiResponse({
    status: 200,
    description: 'Cron jobs executados com sucesso.',
  })
  @ApiResponse({
    status: 500,
    description: 'Erro ao executar cron jobs manualmente.',
  })
  async executeCronJobsBackground() {
    try {
      const result = await this.cronJobsService.startBackgroundExecution();
      return result;
    } catch (error) {
      let mensagemErro = 'Erro ao iniciar cron jobs em background.';
      if (error instanceof Error) {
        mensagemErro += ' ' + error.message;
      }
      throw new HttpException(mensagemErro, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Consulta status de job em background' })
  @ApiResponse({
    status: 200,
    description: 'Status do job retornado com sucesso.',
  })
  async getJobStatus(@Param('jobId') jobId: string): Promise<JobStatus> {
    try {
      const status = await this.cronJobsService.getJobStatus(jobId);
      return status;
    } catch (error) {
      let mensagemErro = 'Erro ao consultar status do job.';
      if (error instanceof Error) {
        mensagemErro += ' ' + error.message;
      }
      throw new HttpException(mensagemErro, HttpStatus.NOT_FOUND);
    }
  }

  @Get('execute-sync')
  @ApiOperation({ summary: 'Executa cron jobs sincronamente (compatibilidade)' })
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
      let mensagemErro = 'Erro ao executar cron jobs manualmente.';
      if (error instanceof Error) {
        mensagemErro += ' ' + error.message;
      }
      throw new HttpException(mensagemErro, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

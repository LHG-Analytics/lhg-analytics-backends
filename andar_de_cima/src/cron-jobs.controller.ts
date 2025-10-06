import { Controller, Get, Post, Param, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CronJobsService } from './cron-jobs.service';

@ApiTags('CronJobs')
@Controller('CronJobs')
export class CronJobsController {
  constructor(private readonly cronJobsService: CronJobsService) {}

  @Post('execute')
  @ApiOperation({ summary: 'Inicia execução de todos os cron jobs em background' })
  @ApiResponse({
    status: 200,
    description: 'Cron jobs iniciados em background com sucesso.',
  })
  @ApiResponse({
    status: 409,
    description: 'Cron jobs já estão em execução.',
  })
  async executeCronJobsBackground() {
    try {
      const result = await this.cronJobsService.startBackgroundExecution();
      return result;
    } catch (error) {
      if (error.message.includes('já está em execução')) {
        throw new HttpException(error.message, HttpStatus.CONFLICT);
      }
      throw new HttpException(
        'Erro ao iniciar cron jobs em background: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Verifica o status de execução dos cron jobs' })
  @ApiResponse({
    status: 200,
    description: 'Status dos cron jobs retornado com sucesso.',
  })
  @ApiResponse({
    status: 404,
    description: 'Job não encontrado.',
  })
  async getJobStatus(@Param('jobId') jobId: string): Promise<any> {
    try {
      const status = await this.cronJobsService.getJobStatus(jobId);
      return status;
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
  }

  @Get('execute-sync')
  @ApiOperation({
    summary: '[DEPRECATED] Executa cron jobs sincronamente - USAR APENAS PARA TESTES',
  })
  @ApiResponse({
    status: 200,
    description: 'Cron jobs executados sincronamente.',
  })
  async executeCronJobsManually() {
    try {
      await this.cronJobsService.scheduleDailyJobs();
      return {
        message: 'Execução manual dos cron jobs concluída com sucesso.',
        warning: 'Este endpoint é deprecated. Use POST /execute para execução em background.',
      };
    } catch (error) {
      throw new HttpException(
        'Erro ao executar cron jobs manualmente: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

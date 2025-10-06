import { Controller, Get, BadRequestException, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { KpiGiroService } from './kpiGiro.service';
import { ApiTags, ApiBadRequestResponse, ApiNotFoundResponse, ApiQuery } from '@nestjs/swagger';
import { PeriodEnum } from '@client-online';

@ApiTags('KpiGiro')
@Controller('KpiGiro')
export class KpiGiroController {
  constructor(private readonly kpiGiroService: KpiGiroService) {}

  @Get('create-and-find-all-kpi-giro')
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Data de início do intervalo',
    example: '01/07/2024',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    description: 'Data de término do intervalo',
    example: '01/08/2024',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Período para o qual o KPI será calculado',
    example: 'LAST_7_D',
    enum: PeriodEnum, // Adiciona o enum como parâmetro na documentação da API
  })
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No KPI Giro found.' })
  @ApiBadRequestResponse({ description: 'Failed to fetch KPI Giro.' })
  async createAllKpiGiro(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('period') period?: PeriodEnum, // Adiciona o período como parâmetro opcional
  ): Promise<any> {
    try {
      // Validação e conversão das datas passadas como string para Date
      const start = this.convertToDate(startDate); // Início
      const end = this.convertToDate(endDate, true); // Fim, com ajuste de horário

      if (!period) {
        throw new BadRequestException('The period parameter is required.');
      }

      // Chama o serviço com as datas e o período, se fornecidos
      return await this.kpiGiroService.findAllKpiGiro(start, end, period);
    } catch (error) {
      throw new BadRequestException(`Failed to create all KpiGiro: ${error.message}`);
    }
  }

  private convertToDate(dateStr?: string, isEndDate: boolean = false): Date | undefined {
    if (!dateStr) return undefined;

    const [day, month, year] = dateStr.split('/').map(Number);
    if (isNaN(day) || isNaN(month) || isNaN(year)) {
      throw new BadRequestException('Invalid date format. Please use DD/MM/YYYY.');
    }

    // Cria a nova data no formato YYYY-MM-DD
    const date = new Date(year, month - 1, day);
    if (date.getDate() !== day || date.getMonth() !== month - 1 || date.getFullYear() !== year) {
      throw new BadRequestException(
        'Invalid date. Please ensure it is a valid date in the format DD/MM/YYYY.',
      );
    }

    // Ajusta as horas conforme necessário
    if (isEndDate) {
      date.setUTCHours(5, 59, 59, 999); // Define o final às 05:59:59.999
    } else {
      date.setUTCHours(6, 0, 0, 0); // Define o início às 06:00
    }

    return date;
  }

  @Get('run-cron-job')
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No KPI Ticket Averages found.' })
  @ApiBadRequestResponse({ description: 'Failed to run the cron job.' })
  async runCronJob(): Promise<any> {
    try {
      // Chama o método do serviço que executa as operações do cron job
      return await this.kpiGiroService.handleCron();
    } catch (error) {
      throw new BadRequestException(`Failed to run the cron job: ${error.message}`);
    }
  }
}

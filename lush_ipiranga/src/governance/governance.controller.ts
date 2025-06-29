import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PeriodEnum } from '@client-online';
import { GovernanceService } from './governance.service';

@ApiTags('Governance')
@Controller('Governance')
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('operational')
  @ApiQuery({
    name: 'period',
    required: true,
    description: 'Período para o qual o KPI será calculado',
    example: 'LAST_7_D',
    enum: PeriodEnum, // Adiciona o enum como parâmetro na documentação da API
  })
  async getAllGovernanceOperationals(
    @Query('period') period: PeriodEnum, // Adiciona o período como parâmetro opcional
  ) {
    if (!period) {
      throw new BadRequestException('The period parameter is required.');
    }

    // Chamar o serviço para buscar os Operationals de todas as governances
    return this.governanceService.findAllGovernance(period);
  }

  @Get('kpis/date-range')
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Data de início do intervalo (formato: DD/MM/YYYY)',
    example: '01/12/2024',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    description: 'Data de término do intervalo (formato: DD/MM/YYYY)',
    example: '11/12/2024',
  })
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No KPI found.' })
  @ApiBadRequestResponse({ description: 'Failed to fetch KPI.' })
  async getKpisByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<any> {
    try {
      // Validação e conversão das datas passadas como string para Date
      const start = this.convertToDate(startDate); // Início
      const end = this.convertToDate(endDate, true); // Fim, com ajuste de horário

      // Chama o serviço com as datas e o período, se fornecidos
      return await this.governanceService.calculateKpibyDateRangeSQL(
        start,
        end,
      );
    } catch (error) {
      throw new BadRequestException(`Failed to fetch KPIs: ${error.message}`);
    }
  }

  private convertToDate(
    dateStr?: string,
    isEndDate: boolean = false,
  ): Date | undefined {
    if (!dateStr) return undefined;

    const [day, month, year] = dateStr.split('/').map(Number);
    if (isNaN(day) || isNaN(month) || isNaN(year)) {
      throw new BadRequestException(
        'Invalid date format. Please use DD/MM/YYYY.',
      );
    }

    // Cria a nova data no formato YYYY-MM-DD
    const date = new Date(year, month - 1, day);
    if (
      date.getDate() !== day ||
      date.getMonth() !== month - 1 ||
      date.getFullYear() !== year
    ) {
      throw new BadRequestException(
        'Invalid date. Please ensure it is a valid date in the format DD/MM/YYYY.',
      );
    }

    // Ajusta as horas conforme necessário
    if (isEndDate) {
      date.setDate(date.getDate() + 1);
      date.setUTCHours(5, 59, 59, 999); // Define o final às 05:59:59.999
    } else {
      date.setUTCHours(6, 0, 0, 0); // Define o início às 06:00
    }

    return date;
  }
}

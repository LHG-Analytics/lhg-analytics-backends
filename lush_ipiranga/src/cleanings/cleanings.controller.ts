import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PeriodEnum } from '@client-online';
import { CleaningsService } from './cleanings.service';

@ApiTags('Cleanings')
@Controller('Cleanings')
export class CleaningsController {
  constructor(private readonly cleaningsService: CleaningsService) {}

  @Get('find-all-cleanings')
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Data de início do intervalo',
    example: '01/11/2024',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    description: 'Data de término do intervalo',
    example: '15/11/2024',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Período para o qual os dados serão retornados',
    example: 'LAST_7_D',
    enum: PeriodEnum, // Enum para documentar os períodos possíveis
  })
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No cleaning data found.' })
  @ApiBadRequestResponse({ description: 'Failed to fetch cleaning data.' })
  async findAllCleanings(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('period') period?: PeriodEnum,
  ): Promise<any> {
    try {
      // Validação e conversão das datas para o formato Date
      const start = this.convertToDate(startDate); // Data inicial
      const end = this.convertToDate(endDate, true); // Data final, ajustando horário

      if (!start || !end) {
        throw new BadRequestException('Both startDate and endDate parameters are required.');
      }

      // Chama o serviço para buscar os dados com base nos parâmetros fornecidos
      return await this.cleaningsService.findAllCleanings(start, end, period);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to fetch cleaning inspections: ${errorMessage}`);
    }
  }

  /**
   * Converte uma string no formato DD/MM/YYYY para um objeto Date,
   * ajustando as horas conforme necessário.
   */
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
      date.setUTCHours(3, 59, 59, 999); // Define o final às 05:59:59.999
    } else {
      date.setUTCHours(4, 0, 0, 0); // Define o início às 06:00
    }

    return date;
  }

  @Get('run-cron-job')
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No cleanings found.' })
  @ApiBadRequestResponse({ description: 'Failed to run the cron job.' })
  async runCronJob(): Promise<any> {
    try {
      // Chama o método do serviço que executa as operações do cron job
      return await this.cleaningsService.handleCron();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to run the cron job: ${errorMessage}`);
    }
  }
}

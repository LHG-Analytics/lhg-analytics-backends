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
import { ApartmentInspectionService } from './apartment-inspection.service';

@ApiTags('Inspections')
@Controller('Inspections')
export class ApartmentInspectionController {
  constructor(
    private readonly ApartmentInspectionService: ApartmentInspectionService,
  ) {}

  @Get('find-all-inspections')
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
    enum: PeriodEnum,
  })
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No inspection data found.' })
  @ApiBadRequestResponse({ description: 'Failed to fetch inspection data.' })
  async findAllInspections(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('period') period?: PeriodEnum,
  ): Promise<any> {
    try {
      // Validação e conversão das datas para o formato Date
      const start = this.convertToDate(startDate); // Data inicial
      const end = this.convertToDate(endDate, true); // Data final, ajustando horário

      if (!start || !end) {
        throw new BadRequestException(
          'Both startDate and endDate parameters are required.',
        );
      }

      // Chama o serviço para buscar os dados com base nos parâmetros fornecidos
      return await this.ApartmentInspectionService.findAllInspections(
        start,
        end,
        period,
      );
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch inspections: ${error.message}`,
      );
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

    if (isEndDate) {
      date.setUTCHours(3, 59, 59, 999); // Define o final às 03:59:59.999
    } else {
      date.setUTCHours(4, 0, 0, 0); // Define o início às 04:00
    }

    return date;
  }

  @Get('run-cron-job')
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No inspections found.' })
  @ApiBadRequestResponse({ description: 'Failed to run the cron job.' })
  async runCronJob(): Promise<any> {
    try {
      // Chama o método do serviço que executa as operações do cron job
      return await this.ApartmentInspectionService.handleCron();
    } catch (error) {
      throw new BadRequestException(
        `Failed to run the cron job: ${error.message}`,
      );
    }
  }
}

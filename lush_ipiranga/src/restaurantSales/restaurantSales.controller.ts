import { PeriodEnum } from '@client-online';
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
import { RestaurantSales } from './entities/restaurantSale.entity';
import { RestaurantSalesService } from './restaurantSales.service';

@ApiTags('RestaurantSales')
@Controller('RestaurantSales')
export class RestaurantSalesController {
  constructor(
    private readonly restaurantSalesService: RestaurantSalesService,
  ) {}

  @Get('create-and-find-all-restaurant-sales')
  @HttpCode(HttpStatus.OK)
  @ApiBadRequestResponse({
    description: 'Failed to create all restaurant sales.',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Data de início do intervalo',
    example: '01/02/2025',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    description: 'Data de término do intervalo',
    example: '05/02/2025',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'Período para qual a receita de restaurante será calculada',
    example: 'LAST_7_D',
    enum: PeriodEnum,
  })
  async createAndFindAllRestaurantSales(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('period') period?: PeriodEnum,
  ): Promise<RestaurantSales[]> {
    try {
      // Validação e conversão das datas passadas como string para Date
      const start = this.convertToDate(startDate); // Início
      const end = this.convertToDate(endDate, true); // Fim, com ajuste de horário

      if (!period) {
        throw new BadRequestException('The period parameter is required.');
      }

      // Verifica se a data de início é posterior à data de fim
      if (start > end) {
        throw new BadRequestException('Start date must be before end date.');
      }

      // Chama o serviço com as datas e o período, se fornecidos
      return await this.restaurantSalesService.findAllRestaurantSales(
        start,
        end,
        period,
      );
    } catch (error) {
      throw new BadRequestException(
        `Failed to create all RestaurantSales: ${error.message}`,
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
      date.setUTCHours(23, 59, 59, 999); // Define o final às 23:59:59.999
    } else {
      date.setUTCHours(0, 0, 0, 0); // Define o início às 00:00:00
    }

    return date;
  }

  @Get('run-cron-job')
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No Restaurant Sales found.' })
  @ApiBadRequestResponse({ description: 'Failed to run the cron job.' })
  async runCronJob(): Promise<any> {
    try {
      // Chama o método do serviço que executa as operações do cron job
      return await this.restaurantSalesService.handleCron();
    } catch (error) {
      throw new BadRequestException(
        `Failed to run the cron job: ${error.message}`,
      );
    }
  }
}

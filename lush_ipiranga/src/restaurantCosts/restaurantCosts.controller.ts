import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiQuery,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { PeriodEnum } from '@client-online';
import { RestaurantCostsService } from './restaurantCosts.service';
import { RestaurantCosts } from './entities/restaurantCosts.entity';

@ApiTags('RestaurantCosts')
@Controller('RestaurantCosts')
export class RestaurantCostsController {
  constructor(
    private readonly restaurantCostsService: RestaurantCostsService,
  ) {}

  @Get('calculate-cmv')
  @HttpCode(HttpStatus.OK)
  @ApiBadRequestResponse({
    description: 'Failed to calculate CMV.',
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
    description: 'Período para o qual o CMV será calculado',
    example: 'LAST_7_D',
    enum: PeriodEnum,
  })
  async calculateCMV(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('period') period?: PeriodEnum,
  ): Promise<RestaurantCosts> {
    try {
      const start = this.convertToDate(startDate);
      const end = this.convertToDate(endDate, true);

      if (!start || !end) {
        throw new BadRequestException('Start date and end date are required.');
      }

      if (!period) {
        throw new BadRequestException('The period parameter is required.');
      }

      if (start > end) {
        throw new BadRequestException('Start date must be before end date.');
      }

      return await this.restaurantCostsService.calculateCMV(start, end, period);
    } catch (error) {
      console.error('Erro ao calcular o CMV:', error); // 👈 Aqui imprime o erro real
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido.';
      throw new BadRequestException(
        `Failed to calculate CMV: ${errorMessage}`,
      );
    }
  }

  @Get('run-cron-job')
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No CMV found.' })
  @ApiBadRequestResponse({ description: 'Failed to run the cron job.' })
  async runCronJob(): Promise<any> {
    try {
      return await this.restaurantCostsService.handleCron();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(
        `Failed to run the cron job: ${errorMessage}`,
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
      date.setUTCHours(5, 59, 59, 999);
    } else {
      date.setUTCHours(6, 0, 0, 0);
    }

    return date;
  }
}

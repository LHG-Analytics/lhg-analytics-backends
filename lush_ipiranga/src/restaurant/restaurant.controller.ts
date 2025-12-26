import { PeriodEnum } from '@client-online';
import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RestaurantService } from './restaurant.service';
//import { JwtAuthGuard } from '@auth/auth/guards/jwt-auth.guard';
//import { UseGuards } from '@nestjs/common';
//import { ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Restaurants')
//@ApiBearerAuth('JWT-auth')
//@UseGuards(JwtAuthGuard)
@Controller('Restaurants')
export class RestaurantController {
  constructor(private readonly restaurantService: RestaurantService) {}


  @Get('restaurants/date-range')
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Data de início do intervalo (formato: DD/MM/YYYY)',
    example: '01/07/2024',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    description: 'Data de término do intervalo (formato: DD/MM/YYYY)',
    example: '01/08/2024',
  })
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No Restaurants found.' })
  @ApiBadRequestResponse({ description: 'Failed to fetch Restaurant.' })
  async getRestaurantByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<any> {
    try {
      // Validação e conversão das datas passadas como string para Date
      const start = this.convertToDate(startDate); // Início
      const end = this.convertToDate(endDate, true); // Fim, com ajuste de horário

      if (!start || !end) {
        throw new BadRequestException('Start date and end date are required.');
      }

      // Chama o serviço com as datas e o período, se fornecidos
      return await this.restaurantService.calculateKpisByDateRange(start, end);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to fetch KPIs: ${errorMessage}`);
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
      date.setUTCHours(23, 59, 59, 999); // Define o final às 05:59:59.999
    } else {
      date.setUTCHours(0, 0, 0, 0); // Define o início às 06:00
    }

    return date;
  }
}

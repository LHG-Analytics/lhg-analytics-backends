import { PeriodEnum } from '../common/enums';
import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiNotFoundResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RestaurantService } from './restaurant.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UnitsGuard } from '../auth/units.guard';
import { Roles } from '../auth/roles.decorator';
import { Units } from '../auth/units.decorator';
import { DateUtilsService } from '@lhg/utils';

@ApiTags('Restaurants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN', 'GERENTE_GERAL', 'GERENTE_RESTAURANTE')
@Units('LHG', 'TOUT')
@Controller('Restaurants')
export class RestaurantController {
  constructor(
    private readonly restaurantService: RestaurantService,
    private readonly dateUtilsService: DateUtilsService,
  ) {}


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
      const start = this.dateUtilsService.convertToDate(startDate, {
        useUTC: true,
        startHour: 0,
      }); // Início às 00:00
      const end = this.dateUtilsService.convertToDate(endDate, {
        isEndDate: true,
        useUTC: true,
      }); // Fim às 23:59:59.999

      // Chama o serviço com as datas e o período, se fornecidos
      return await this.restaurantService.calculateKpisByDateRange(start, end);
    } catch (error) {
      throw new BadRequestException(`Failed to fetch KPIs: ${error.message}`);
    }
  }
}

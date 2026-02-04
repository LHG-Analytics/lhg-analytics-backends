import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Units } from '../auth/units.decorator';
import { UnitsGuard } from '../auth/units.guard';
import { BookingsService } from './bookings.service';
import { DateUtilsService, ValidationService } from '@lhg/utils';

@ApiTags('Bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN', 'GERENTE_GERAL', 'GERENTE_RESERVAS')
@Units('LHG', 'LIV')
@Controller('Bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly dateUtilsService: DateUtilsService,
    private readonly validationService: ValidationService,
  ) {}

  @Get('bookings/date-range')
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
  @ApiNotFoundResponse({ description: 'No Bookings found.' })
  @ApiBadRequestResponse({ description: 'Failed to fetch Booking.' })
  async getBookingsByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<any> {
    try {
      // Valida formato e intervalo das datas
      this.validationService.validateDateInterval(startDate, endDate);

      // Conversão das datas passadas como string para Date
      const start = this.dateUtilsService.convertToDate(startDate, {
        useUTC: true,
      });
      const end = this.dateUtilsService.convertToDate(endDate, {
        isEndDate: true,
        useUTC: true,
      });

      if (!start || !end) {
        throw new BadRequestException(
          'Both startDate and endDate are required and must be valid dates.',
        );
      }

      // Chama o serviço com as datas e o período, se fornecidos
      return await this.bookingsService.calculateKpibyDateRangeSQL(start, end);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to fetch KPIs: ${errorMessage}`);
    }
  }
}

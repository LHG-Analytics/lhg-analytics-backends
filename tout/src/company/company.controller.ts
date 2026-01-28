import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiNotFoundResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PeriodEnum } from '../common/enums';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UnitsGuard } from '../auth/units.guard';
import { Roles } from '../auth/roles.decorator';
import { Units } from '../auth/units.decorator';
import { DateUtilsService } from '@lhg/utils';

@ApiTags('Company')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN', 'GERENTE_GERAL', 'GERENTE_FINANCEIRO')
@Units('LHG', 'TOUT')
@Controller('Company')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly dateUtilsService: DateUtilsService,
  ) {}


  @Get('kpis/date-range')
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
  @ApiNotFoundResponse({ description: 'No KPI found.' })
  @ApiBadRequestResponse({ description: 'Failed to fetch KPI.' })
  async getKpisByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<any> {
    try {
      // Validação e conversão das datas passadas como string para Date
      const start = this.dateUtilsService.convertToDate(startDate, {
        useUTC: true,
        startHour: 6,
      }); // Início às 06:00
      const end = this.dateUtilsService.convertToDate(endDate, {
        isEndDate: true,
        useUTC: true,
        addDayForEndDate: true,
        endHour: 5,
        endMinute: 59,
        endSecond: 59,
      }); // Fim, com ajuste de horário (D+1 às 05:59:59.999)

      // Chama o serviço com as datas e o período, se fornecidos
      return await this.companyService.calculateKpisByDateRangeSQL(start, end);
    } catch (error) {
      throw new BadRequestException(`Failed to fetch KPIs: ${error.message}`);
    }
  }
}

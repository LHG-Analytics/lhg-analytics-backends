import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiNotFoundResponse, ApiQuery, ApiTags } from '@nestjs/swagger';

import { GovernanceService } from './governance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UnitsGuard } from '../auth/units.guard';
import { Roles } from '../auth/roles.decorator';
import { Units } from '../auth/units.decorator';
import { DateUtilsService } from '@lhg/utils';

@ApiTags('Governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN', 'GERENTE_GERAL', 'GERENTE_OPERACIONAL')
@Units('LHG', 'TOUT')
@Controller('Governance')
export class GovernanceController {
  constructor(
    private readonly governanceService: GovernanceService,
    private readonly dateUtilsService: DateUtilsService,
  ) {}


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
      const start = this.dateUtilsService.convertToDate(startDate, {
        useUTC: true,
        startHour: 6,
      }); // Início às 06:00
      const end = this.dateUtilsService.convertToDate(endDate, {
        isEndDate: true,
        useUTC: true,
        endHour: 5,
        endMinute: 59,
        endSecond: 59,
      }); // Fim, com ajuste de horário (D+1 às 05:59:59.999)

      // Chama o serviço com as datas e o período, se fornecidos
      return await this.governanceService.calculateKpibyDateRangeSQL(start, end);
    } catch (error) {
      throw new BadRequestException(`Failed to fetch KPIs: ${error.message}`);
    }
  }
}

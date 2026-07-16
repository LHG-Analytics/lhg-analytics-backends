import { BadRequestException, Controller, Get, HttpException, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DateUtilsService, ValidationService } from '@lhg/utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UnitsGuard } from '../auth/units.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { TenantConfig } from '../tenant/tenant.interfaces';
import { CompanyService } from './company.service';

@ApiTags('Company')
@Controller(':unit/api/Company')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN', 'GERENTE_GERAL', 'GERENTE_FINANCEIRO')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly dateUtilsService: DateUtilsService,
    private readonly validationService: ValidationService,
  ) {}

  @Get('kpis/date-range')
  @ApiOperation({ summary: 'KPIs de company da unidade por período' })
  @ApiParam({ name: 'unit', description: 'Slug da unidade (ex.: lush_ipiranga, liv, altana)' })
  @ApiQuery({ name: 'startDate', description: 'DD/MM/YYYY' })
  @ApiQuery({ name: 'endDate', description: 'DD/MM/YYYY' })
  async getKpisByDateRange(
    @CurrentTenant() tenant: TenantConfig,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<any> {
    try {
      this.validationService.validateDateInterval(startDate, endDate);

      // Dia comercial 06:00 → 05:59 (D+1)
      const start = this.dateUtilsService.convertToDate(startDate, {
        useUTC: true,
        startHour: 6,
        startMinute: 0,
        startSecond: 0,
      });
      const end = this.dateUtilsService.convertToDate(endDate, {
        isEndDate: true,
        useUTC: true,
        endHour: 5,
        endMinute: 59,
        endSecond: 59,
        addDayForEndDate: true,
      });

      if (!start || !end) {
        throw new BadRequestException('Start and end dates are required');
      }

      return await this.companyService.calculateKpisByDateRangeSQL(tenant, start, end);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        `Failed to fetch Company KPIs: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

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
import { GovernanceService } from './governance.service';

@ApiTags('Governance')
@Controller(':unit/api/Governance')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN', 'GERENTE_GERAL', 'GERENTE_OPERACIONAL')
export class GovernanceController {
  constructor(
    private readonly governanceService: GovernanceService,
    private readonly dateUtilsService: DateUtilsService,
    private readonly validationService: ValidationService,
  ) {}

  @Get('kpis/date-range')
  @ApiOperation({ summary: 'KPIs de governança da unidade por período' })
  @ApiParam({ name: 'unit', description: 'Slug da unidade' })
  @ApiQuery({ name: 'startDate', description: 'DD/MM/YYYY' })
  @ApiQuery({ name: 'endDate', description: 'DD/MM/YYYY' })
  async getKpisByDateRange(
    @CurrentTenant() tenant: TenantConfig,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<any> {
    try {
      this.validationService.validateDateInterval(startDate, endDate);

      // Dia comercial 06:00 → 05:59 (o service aplica o D+1 internamente)
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
      });

      if (!start || !end) {
        throw new BadRequestException('Start and end dates are required');
      }

      return await this.governanceService.calculateKpibyDateRangeSQL(tenant, start, end);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        `Failed to fetch Governance KPIs: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

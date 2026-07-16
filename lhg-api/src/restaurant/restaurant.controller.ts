/**
 * Rotas de Restaurant no modelo multi-tenant.
 * Path: /:unit/api/Restaurants/restaurants/date-range — mesmo shape do contrato
 * do frontend (docs/FRONTEND-MIGRATION-GUIDE.md), com a unidade como parâmetro.
 */
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
import { RestaurantService } from './restaurant.service';

@ApiTags('Restaurant')
@Controller(':unit/api/Restaurants')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN', 'GERENTE_GERAL', 'GERENTE_RESTAURANTE')
export class RestaurantController {
  constructor(
    private readonly restaurantService: RestaurantService,
    private readonly dateUtilsService: DateUtilsService,
    private readonly validationService: ValidationService,
  ) {}

  @Get('restaurants/date-range')
  @ApiOperation({ summary: 'KPIs de restaurante da unidade por período' })
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

      const start = this.dateUtilsService.convertToDate(startDate, { useUTC: true });
      const end = this.dateUtilsService.convertToDate(endDate, { isEndDate: true, useUTC: true });

      if (!start || !end) {
        throw new BadRequestException(
          'Both startDate and endDate are required and must be valid dates.',
        );
      }

      return await this.restaurantService.calculateKpisByDateRange(tenant, start, end);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        `Failed to fetch Restaurant KPIs: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

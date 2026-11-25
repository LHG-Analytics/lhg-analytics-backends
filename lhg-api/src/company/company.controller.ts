import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DateUtilsService, ValidationService } from '@lhg/utils';
import { OPCOES_DATAS } from '../common/datas-do-servico';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UnitsGuard } from '../auth/units.guard';
import { TenantGuard } from '../tenant/tenant.guard';
import { CurrentTenant } from '../tenant/tenant.decorator';
import { TenantConfig } from '../tenant/tenant.interfaces';
import { CompanyService } from './company.service';
import { UnidadeIndisponivelError } from '../database/tenant-pool.service';

/** Mensagem do 503 quando o banco da unidade não aceita conexão (o MCP reconhece). */
export const UNIDADE_INDISPONIVEL = 'UNIDADE_INDISPONIVEL';

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

  @Get('categorias')
  @ApiOperation({ summary: 'Categorias de suíte da unidade: ID do Automo, nome e suítes ativas' })
  @ApiParam({ name: 'unit', description: 'Slug da unidade (ex.: lush_ipiranga, liv, altana)' })
  async getCategorias(@CurrentTenant() tenant: TenantConfig) {
    try {
      return { unidade: tenant.slug, categorias: await this.companyService.listarCategorias(tenant) };
    } catch (error) {
      if (error instanceof UnidadeIndisponivelError) throw new ServiceUnavailableException(UNIDADE_INDISPONIVEL);
      throw error;
    }
  }

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
      const start = this.dateUtilsService.convertToDate(startDate, OPCOES_DATAS.company.inicio);
      const end = this.dateUtilsService.convertToDate(endDate, OPCOES_DATAS.company.fim);

      if (!start || !end) {
        throw new BadRequestException('Start and end dates are required');
      }

      return await this.companyService.calculateKpisByDateRangeSQL(tenant, start, end);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Banco da unidade fora: 503 (antes virava 400, como se o pedido estivesse errado).
      if (error instanceof UnidadeIndisponivelError) throw new ServiceUnavailableException(UNIDADE_INDISPONIVEL);
      throw new BadRequestException(
        `Failed to fetch Company KPIs: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

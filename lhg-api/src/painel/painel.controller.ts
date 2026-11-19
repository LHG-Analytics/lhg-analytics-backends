import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  Query,
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
import { PainelService } from './painel.service';
import { ResumoPainel } from './painel-totais';

/**
 * Resumo enxuto para o Painel TV (servidor → servidor, identidade ADMIN do
 * painel): faturamento, locações, reservas e receita por canal (e-commerce e
 * Guia) de uma unidade num período — os mesmos números da Visão Geral
 * (TotalResult) e das Reservas (BigNumbers), sem período anterior, previsão
 * nem gráficos.
 */
@ApiTags('Painel')
@Controller(':unit/api/Painel')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN')
export class PainelController {
  constructor(
    private readonly painelService: PainelService,
    private readonly dateUtilsService: DateUtilsService,
    private readonly validationService: ValidationService
  ) {}

  @Get('resumo')
  @ApiOperation({ summary: 'Resumo do Painel TV da unidade por período' })
  @ApiParam({ name: 'unit', description: 'Slug da unidade' })
  @ApiQuery({ name: 'startDate', description: 'DD/MM/YYYY' })
  @ApiQuery({ name: 'endDate', description: 'DD/MM/YYYY' })
  async resumo(
    @CurrentTenant() tenant: TenantConfig,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ): Promise<ResumoPainel> {
    try {
      this.validationService.validateDateInterval(startDate, endDate);
      // Início: dia comercial 06:00 (igual aos dois controllers do dashboard).
      const inicio = this.dateUtilsService.convertToDate(startDate, OPCOES_DATAS.company.inicio);
      // Fim da Visão Geral (CompanyController): 05:59:59 de D+1.
      const fimVisao = this.dateUtilsService.convertToDate(endDate, OPCOES_DATAS.company.fim);
      // Fim das Reservas (BookingsController): 05:59:59 do próprio dia.
      const fimReservas = this.dateUtilsService.convertToDate(endDate, OPCOES_DATAS.bookings.fim);
      if (!inicio || !fimVisao || !fimReservas) {
        throw new BadRequestException('Start and end dates are required');
      }
      return await this.painelService.resumo(
        tenant,
        inicio,
        fimVisao,
        inicio,
        fimReservas
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        `Failed to fetch Painel resumo: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}

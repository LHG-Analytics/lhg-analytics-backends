/**
 * Controller para KPIs unificados de Governance
 * Rota: /api/Governance/kpis/date-range
 * Versão Multi-Tenant - conexão direta aos bancos
 */

import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { GovernanceMultitenantService } from './governance-multitenant.service';
import { UnifiedGovernanceKpiResponse } from './governance.interfaces';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UnitsGuard } from '../auth/guards/units.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Units } from '../auth/decorators/units.decorator';
import { ValidationService } from '@lhg/utils';

@ApiTags('Governance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN')
@Units('LHG')
@Controller('Governance')
export class GovernanceController {
  private readonly logger = new Logger(GovernanceController.name);

  constructor(
    private readonly governanceService: GovernanceMultitenantService,
    private readonly validationService: ValidationService,
  ) {}

  @Get('kpis/date-range')
  @ApiOperation({
    summary: 'Obtém KPIs consolidados de Governança de todas as unidades',
    description:
      'Retorna dados consolidados de limpezas, vistorias, média diária e limpezas por turno de todas as unidades (Lush Ipiranga, Lush Lapa, Andar de Cima, Tout). Utiliza conexão direta com os bancos de dados.',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Data inicial no formato DD/MM/YYYY',
    example: '01/01/2025',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    description: 'Data final no formato DD/MM/YYYY',
    example: '31/01/2025',
  })
  @ApiResponse({
    status: 200,
    description: 'KPIs consolidados retornados com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Parâmetros inválidos',
  })
  @ApiResponse({
    status: 401,
    description: 'Não autorizado',
  })
  async getKpisByDateRange(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Promise<UnifiedGovernanceKpiResponse> {
    // Valida formato e intervalo das datas
    this.validationService.validateDateInterval(startDate, endDate);

    this.logger.log(`Buscando KPIs de Governance consolidados: ${startDate} - ${endDate}`);

    return this.governanceService.getUnifiedKpis(startDate, endDate);
  }
}

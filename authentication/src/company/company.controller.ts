/**
 * Controller para KPIs unificados de Company
 * Rota: /api/Company/kpis/date-range
 * Versão Multi-Tenant - conexão direta aos bancos
 */

import { Controller, Get, Query, HttpException, HttpStatus, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CompanyMultitenantService } from './company-multitenant.service';
import { UnifiedCompanyKpiResponse } from './company.interfaces';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Company')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('Company')
export class CompanyController {
  private readonly logger = new Logger(CompanyController.name);

  constructor(private readonly companyService: CompanyMultitenantService) {}

  @Get('kpis/date-range')
  @ApiOperation({
    summary: 'Obtém KPIs consolidados de Company de todas as unidades',
    description: 'Retorna dados consolidados de faturamento, locações, ticket médio, taxa de ocupação, TRevPAR e giro de todas as unidades (Lush Ipiranga, Lush Lapa, Andar de Cima, Tout). Utiliza conexão direta com os bancos de dados.',
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
  ): Promise<UnifiedCompanyKpiResponse> {
    // Valida parâmetros
    if (!startDate || !endDate) {
      throw new HttpException(
        'startDate e endDate são obrigatórios',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Valida formato das datas (DD/MM/YYYY)
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      throw new HttpException(
        'Formato de data inválido. Use DD/MM/YYYY',
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.log(`Buscando KPIs consolidados: ${startDate} - ${endDate}`);

    return this.companyService.getUnifiedKpis(startDate, endDate);
  }
}

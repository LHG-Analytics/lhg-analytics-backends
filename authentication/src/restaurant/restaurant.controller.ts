/**
 * Controller para KPIs unificados de Restaurant
 * Rota: /api/Restaurant/kpis/date-range
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
import { RestaurantMultitenantService } from './restaurant-multitenant.service';
import { UnifiedRestaurantKpiResponse } from './restaurant.interfaces';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UnitsGuard } from '../auth/guards/units.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Units } from '../auth/decorators/units.decorator';

@ApiTags('Restaurant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, UnitsGuard)
@Roles('ADMIN')
@Units('LHG')
@Controller('Restaurant')
export class RestaurantController {
  private readonly logger = new Logger(RestaurantController.name);

  constructor(private readonly restaurantService: RestaurantMultitenantService) {}

  @Get('kpis/date-range')
  @ApiOperation({
    summary: 'Obtém KPIs consolidados de Restaurant (A&B) de todas as unidades',
    description:
      'Retorna dados consolidados de receita A&B, vendas, ticket médio e percentual A&B de todas as unidades (Lush Ipiranga, Lush Lapa, Andar de Cima, Tout). Utiliza conexão direta com os bancos de dados.',
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
  ): Promise<UnifiedRestaurantKpiResponse> {
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

    this.logger.log(`Buscando KPIs de Restaurant consolidados: ${startDate} - ${endDate}`);

    return this.restaurantService.getUnifiedKpis(startDate, endDate);
  }
}

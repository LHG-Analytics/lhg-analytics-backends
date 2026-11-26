import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { allTenants } from '../tenant/tenant.registry';
import { ReplicaService } from './replica.service';

/**
 * Status das réplicas para as telas: quando a unidade está atrasada (ou fora),
 * o frontend mostra o aviso "dados até dd/mm hh:mm" (campo dadosAte).
 * Cada pessoa só vê as unidades dela (LHG vê todas), a mesma regra do UnitsGuard.
 */
@ApiTags('Replicas')
@Controller('api/replicas')
@UseGuards(JwtAuthGuard)
export class ReplicaController {
  constructor(private readonly replicas: ReplicaService) {}

  @Get()
  @ApiOperation({ summary: 'Atraso de replicação por unidade (aviso "dados até…" nas telas)' })
  status(@Req() req: any) {
    const unit = req.user?.unit;
    const permitidas = new Set(
      allTenants()
        .filter((t) => unit === 'LHG' || t.unitEnum === unit)
        .map((t) => t.slug),
    );
    return {
      atrasoMaxMin: this.replicas.atrasoMaxMin,
      unidades: this.replicas.listar().filter((s) => permitidas.has(s.unidade)),
    };
  }
}

/**
 * API servidor-a-servidor do NPS LHG (HMAC, sem JWT de usuário).
 * Endpoint A: GET /nps/v1/estadia — há locação ativa (ou finalizada há pouco)
 * nesta suíte? Usado pelo QR exclusivo. Respostas sem dados pessoais.
 */
import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NpsHmacGuard } from './nps-hmac.guard';
import { lerConsultaEstadia } from './nps-estadia';
import { NpsService, RespostaEstadia } from './nps.service';

@ApiExcludeController()
@Controller('nps/v1')
@UseGuards(NpsHmacGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class NpsController {
  private readonly logger = new Logger('Nps');

  constructor(private readonly nps: NpsService) {}

  @Get('estadia')
  async estadia(@Query() q: Record<string, unknown>, @Req() req: any): Promise<RespostaEstadia> {
    const lido = lerConsultaEstadia(q, Date.now());
    if (!lido.ok) throw new BadRequestException(lido.erro);
    const { consulta } = lido;
    const t0 = Date.now();
    let r: RespostaEstadia | null;
    try {
      r = await this.nps.estadia(consulta);
    } catch {
      // O TenantPoolService já registra o erro do banco.
      throw new ServiceUnavailableException('indisponível');
    }
    // Auditoria sem dados pessoais (não há nenhum nesta rota).
    this.logger.log(
      `nps.estadia key=${req.npsKeyId} unidade=${consulta.tenant.slug} suite=${consulta.suite} ` +
        `estado=${r?.estado ?? 'suite_desconhecida'} ${Date.now() - t0}ms`,
    );
    if (!r) throw new NotFoundException('suite desconhecida');
    return r;
  }
}

/**
 * API servidor-a-servidor do NPS LHG (HMAC, sem JWT de usuário).
 * - Endpoint A: GET /nps/v1/estadia — há locação ativa (ou finalizada há pouco)
 *   nesta suíte, ou na suíte ATUAL da cadeia (raiz)? Usado pelo QR exclusivo.
 * - Endpoint B: GET /nps/v1/checkouts — check-outs FINALIZADA desde a marca
 *   d'água. Usado pelo job do WhatsApp e pela reconciliação.
 * - Endpoint C: GET /nps/v1/contato — o celular do hóspede, SÓ para a chave do
 *   Chat LHG (escopo 'contato'). O número nunca vai para o log.
 * A e B não devolvem dados pessoais.
 */
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Logger,
  NotFoundException,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EscopoDaRota, NpsHmacGuard } from './nps-hmac.guard';
import { lerConsultaCheckouts, lerConsultaContato, lerConsultaEstadia } from './nps-estadia';
import { NpsService, RespostaCheckouts, RespostaEstadia } from './nps.service';

@ApiExcludeController()
@Controller('nps/v1')
@UseGuards(NpsHmacGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class NpsController {
  private readonly logger = new Logger('Nps');

  constructor(private readonly nps: NpsService) {}

  /** Erro do banco → 503 (o TenantPoolService já registra o erro). */
  private async banco<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch {
      throw new ServiceUnavailableException('indisponível');
    }
  }

  @Get('estadia')
  async estadia(@Query() q: Record<string, unknown>, @Req() req: any): Promise<RespostaEstadia> {
    const lido = lerConsultaEstadia(q, Date.now());
    if (!lido.ok) throw new BadRequestException(lido.erro);
    const { consulta } = lido;
    const t0 = Date.now();
    const r = await this.banco(() => this.nps.estadia(consulta));
    // Auditoria sem dados pessoais (não há nenhum nesta rota).
    const alvo = consulta.raiz !== null ? `raiz=${consulta.raiz}` : `suite=${consulta.suite}`;
    this.logger.log(
      `nps.estadia key=${req.npsKeyId} unidade=${consulta.tenant.slug} ${alvo} ` +
        `estado=${r?.estado ?? 'nao_encontrada'} ${Date.now() - t0}ms`,
    );
    if (!r) throw new NotFoundException(consulta.raiz !== null ? 'raiz desconhecida' : 'suite desconhecida');
    return r;
  }

  @Get('checkouts')
  async checkouts(@Query() q: Record<string, unknown>, @Req() req: any): Promise<RespostaCheckouts> {
    const lido = lerConsultaCheckouts(q, Date.now());
    if (!lido.ok) throw new BadRequestException(lido.erro);
    const { consulta } = lido;
    const t0 = Date.now();
    const r = await this.banco(() => this.nps.checkouts(consulta));
    this.logger.log(
      `nps.checkouts key=${req.npsKeyId} unidade=${consulta.tenant.slug} itens=${r.itens.length} ` +
        `proximo=${r.proximo ? 'sim' : 'nao'} ${Date.now() - t0}ms`,
    );
    return r;
  }

  @Get('contato')
  @EscopoDaRota('contato')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  async contato(
    @Query() q: Record<string, unknown>,
    @Req() req: any,
  ): Promise<{ celular: string; origem_reserva: string }> {
    const lido = lerConsultaContato(q, Date.now());
    if (!lido.ok) throw new BadRequestException(lido.erro);
    const { consulta } = lido;
    const r = await this.banco(() => this.nps.contato(consulta));
    // Auditoria SEM o número: chave, unidade, locação e resultado.
    this.logger.log(
      `nps.contato key=${req.npsKeyId} unidade=${consulta.tenant.slug} locacao=${consulta.locacao} ` +
        `resultado=${r.ok ? 'entregue' : r.motivo}`,
    );
    if (!r.ok) throw new NotFoundException({ motivo: r.motivo });
    return { celular: r.celular, origem_reserva: r.origem_reserva };
  }
}

/**
 * Guard das rotas /nps/*: HMAC servidor-a-servidor (ver nps-hmac.ts), no lugar
 * do JWT de usuário. Sem NPS_HMAC_KEYS o módulo fica DESLIGADO (404). Assinatura
 * recusada → o mesmo 401 genérico; chave de outro escopo → 403. O motivo vai só
 * para o log, sem valores.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EscopoNps, lerChavesNps, verificarNps } from './nps-hmac';

const ESCOPO_KEY = 'npsEscopo';
/** Escopo exigido pela rota (padrão: 'nps'). */
export const EscopoDaRota = (escopo: EscopoNps) => SetMetadata(ESCOPO_KEY, escopo);

@Injectable()
export class NpsHmacGuard implements CanActivate {
  private readonly logger = new Logger('NpsHmac');

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    // Lido a cada uso: trocar a variável no Render vale no próximo deploy.
    const { chaves } = lerChavesNps(process.env.NPS_HMAC_KEYS);
    const r = verificarNps({
      chaves,
      keyId: req.headers?.['x-lhg-key-id'],
      timestamp: req.headers?.['x-lhg-timestamp'],
      assinatura: req.headers?.['x-lhg-signature'],
      metodo: req.method,
      caminho: req.originalUrl ?? req.url,
      // Corpo BRUTO (main.ts: rawBody), byte a byte como chegou; GET → vazio.
      corpo: Buffer.isBuffer(req.rawBody) ? req.rawBody : '',
      agoraMs: Date.now(),
    });
    if (!r.ok && r.motivo === 'sem_config') throw new NotFoundException();
    const id = typeof req.headers?.['x-lhg-key-id'] === 'string' ? req.headers['x-lhg-key-id'] : '-';
    const idLog = /^[A-Za-z0-9_-]{1,32}$/.test(id) ? id : '?';
    if (!r.ok) {
      this.logger.warn(`nps.recusado motivo=${r.motivo} key=${idLog}`);
      throw new UnauthorizedException('Não autorizado');
    }
    const exigido =
      this.reflector.getAllAndOverride<EscopoNps>(ESCOPO_KEY, [context.getHandler(), context.getClass()]) ??
      'nps';
    if (r.escopo !== exigido) {
      this.logger.warn(`nps.recusado motivo=escopo key=${idLog} rota=${exigido}`);
      throw new ForbiddenException('Proibido');
    }
    req.npsKeyId = r.keyId;
    return true;
  }
}

/**
 * Guard das rotas /nps/*: HMAC servidor-a-servidor (ver nps-hmac.ts), no lugar
 * do JWT de usuário. Sem NPS_HMAC_KEYS o módulo fica DESLIGADO (404). Qualquer
 * recusa responde o mesmo 401 genérico; o motivo vai só para o log, sem valores.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { lerChavesNps, verificarNps } from './nps-hmac';

@Injectable()
export class NpsHmacGuard implements CanActivate {
  private readonly logger = new Logger('NpsHmac');

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
      // Só há rotas GET (sem corpo) por enquanto.
      corpo: '',
      agoraMs: Date.now(),
    });
    if (r.ok) {
      req.npsKeyId = r.keyId;
      return true;
    }
    if (r.motivo === 'sem_config') throw new NotFoundException();
    const id = typeof req.headers?.['x-lhg-key-id'] === 'string' ? req.headers['x-lhg-key-id'] : '-';
    this.logger.warn(`nps.recusado motivo=${r.motivo} key=${/^[A-Za-z0-9_-]{1,32}$/.test(id) ? id : '?'}`);
    throw new UnauthorizedException('Não autorizado');
  }
}

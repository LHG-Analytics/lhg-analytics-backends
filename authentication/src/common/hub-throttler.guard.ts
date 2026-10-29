import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { clientIp } from './client-ip';

/**
 * Rate limit das rotas /api pelo IP REAL: o x-hub-client-ip só quando a chave
 * do proxy do HUB confere; senão o req.ip (trust proxy), como antes.
 */
@Injectable()
export class HubThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return clientIp(req) ?? req.ip;
  }
}

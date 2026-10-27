import {
  Controller,
  Get,
  Header,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/** Tempo máximo do SELECT 1 do readiness. */
export const READY_TIMEOUT_MS = 2000;

/**
 * Healthcheck do serviço de autenticação.
 * - GET /api/health: LIVENESS. Só confirma que o processo responde; não toca o
 *   banco, para uma oscilação do Supabase não fazer o Render reiniciar a
 *   instância em loop.
 *   Fica FORA do rate limit (o Render e o proxy consultam com frequência).
 * - GET /api/health/ready: READINESS para monitoração (SELECT 1 com timeout).
 *   Fica DENTRO do rate limit global, como as demais rotas (toca o banco).
 * As respostas não trazem versão, host nem detalhe interno.
 */
@ApiExcludeController()
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @SkipThrottle()
  @Header('Cache-Control', 'no-store')
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async readiness() {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.prismaOnline.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('timeout')),
            READY_TIMEOUT_MS,
          );
        }),
      ]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

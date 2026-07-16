import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from './auth/public.decorator';
import { allTenants } from './tenant/tenant.registry';

/** Healthcheck para o Render/monitoração. Não toca banco (não abre pools à toa). */
@ApiExcludeController()
@Controller()
export class HealthController {
  @Get('health')
  @Public()
  health() {
    return {
      status: 'ok',
      service: 'lhg-api',
      units: allTenants().map((t) => t.slug),
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

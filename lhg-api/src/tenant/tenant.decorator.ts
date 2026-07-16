import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantConfig } from './tenant.interfaces';

/** Injeta o TenantConfig resolvido pelo TenantGuard no handler */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantConfig => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenant;
  },
);

/**
 * Resolve o parâmetro :unit da rota para um TenantConfig e o anexa ao request.
 * Deve rodar ANTES do UnitsGuard (que compara user.unit × tenant.unitEnum).
 */
import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { getTenant } from './tenant.registry';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const slug = request.params?.unit;
    const tenant = slug ? getTenant(slug) : undefined;

    if (!tenant) {
      throw new NotFoundException(`Unidade desconhecida: ${slug}`);
    }

    request.tenant = tenant;
    return true;
  }
}

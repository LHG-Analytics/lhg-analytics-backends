/**
 * Autorização por unidade no modelo multi-tenant:
 * compara user.unit (do JWT) com o tenant resolvido da ROTA (:unit).
 * - LHG (admin/consolidado) acessa qualquer unidade.
 * - Demais usuários só acessam a própria unidade.
 * Requer TenantGuard antes na cadeia (popula request.tenant).
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class UnitsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenant = request.tenant;

    if (!tenant) return true; // rota sem :unit — nada a validar
    if (user?.unit === 'LHG') return true;
    if (user?.unit === tenant.unitEnum) return true;

    throw new ForbiddenException('Acesso negado: unidade não autorizada');
  }
}

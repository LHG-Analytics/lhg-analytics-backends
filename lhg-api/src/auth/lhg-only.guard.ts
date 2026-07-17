/**
 * Restringe a rota a usuários da unidade LHG (visão consolidada/admin).
 * Substitui o par @Units('LHG') + UnitsGuard(metadata) do authentication.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class LhgOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.unit === 'LHG') return true;
    throw new ForbiddenException('Acesso negado: rota exclusiva da visão consolidada (LHG)');
  }
}

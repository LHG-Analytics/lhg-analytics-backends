import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UNITS_KEY } from './units.decorator';

@Injectable()
export class UnitsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredUnits = this.reflector.getAllAndOverride<string[]>(UNITS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredUnits) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !requiredUnits.includes(user.unit)) {
      throw new ForbiddenException('Você não tem permissão para acessar dados desta unidade');
    }

    return true;
  }
}

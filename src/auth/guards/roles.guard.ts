import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { JwtPayload } from "../interfaces/jwt-payload.interface";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!requiredRoles) {
      return true; // Se não tiver roles definidas, qualquer um pode acessar
    }

    const { user } = context.switchToHttp().getRequest();
    console.log("User from request in RolesGuard:", user); // Verifique se o user está aqui

    if (!user) {
      throw new ForbiddenException("Usuário não autenticado");
    }

    const payload = user as JwtPayload;

    if (!requiredRoles.includes(payload.role)) {
      throw new ForbiddenException(
        "Usuário não tem permissão para acessar essa rota"
      );
    }

    return true;
  }
}

import { SetMetadata } from '@nestjs/common';
import { JwtPayload } from './jwt-payload.interface';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: JwtPayload['role'][]) => SetMetadata(ROLES_KEY, roles);

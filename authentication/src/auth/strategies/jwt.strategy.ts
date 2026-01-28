import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(public configService: ConfigService) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET não está definido nas variáveis de ambiente');
    }

    super({
      // Extrai JWT tanto do cookie quanto do header Authorization (compatibilidade)
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // Primeiro tenta pegar do cookie (mais seguro)
          if (request?.cookies?.access_token) {
            return request.cookies.access_token;
          }
          // Fallback para Bearer token no header (compatibilidade)
          const bearerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
          return bearerToken || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload & { exp?: number }) {
    if (!payload?.id || !payload?.email || !payload?.unit || !payload?.role) {
      throw new UnauthorizedException('Token inválido');
    }
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      unit: payload.unit,
      role: payload.role,
      exp: payload.exp,
    };
  }
}

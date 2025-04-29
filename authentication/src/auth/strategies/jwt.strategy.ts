// src/auth/strategies/jwt.strategy.ts

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET"),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub || !payload?.email || !payload?.unit || !payload?.role) {
      throw new UnauthorizedException("Token inválido");
    }
    return {
      id: payload.sub,
      email: payload.email,
      unit: payload.unit,
      role: payload.role,
    };
  }
}

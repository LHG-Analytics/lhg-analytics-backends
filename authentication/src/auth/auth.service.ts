import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException("Email ou senha incorretos");
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException("Email ou senha incorretos");
    }

    return user;
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      unit: user.unit, // se você tiver unit no user
      role: user.role, // se você tiver role no user
    };

    return {
      access_token: this.jwtService.sign(payload, {
        secret: this.configService.get("JWT_SECRET"),
        expiresIn: this.configService.get("JWT_EXPIRATION_TIME") || "1h",
      }),
    };
  }
}

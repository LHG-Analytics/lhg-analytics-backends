import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha incorretos');
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Email ou senha incorretos');
    }

    return user;
  }

  async login(user: any) {
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      unit: user.unit,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRATION_TIME') || '1h',
    });

    const refreshToken = await this.createRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  private async createRefreshToken(userId: number): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.prismaOnline.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    return token;
  }

  async refreshTokens(refreshToken: string) {
    const storedToken = await this.prisma.prismaOnline.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (storedToken.revoked) {
      // Token já foi usado - possível roubo, invalida todos os tokens do usuário
      await this.revokeAllUserTokens(storedToken.userId);
      throw new UnauthorizedException(
        'Refresh token já utilizado. Todos os tokens foram invalidados por segurança.',
      );
    }

    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Revoga o token atual (rotação)
    await this.prisma.prismaOnline.refreshToken.update({
      where: { id: storedToken.id },
      data: { revoked: true },
    });

    const user = storedToken.user;
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      unit: user.unit,
      role: user.role,
    };

    const newAccessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: this.configService.get('JWT_EXPIRATION_TIME') || '1h',
    });

    const newRefreshToken = await this.createRefreshToken(user.id);

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        unit: user.unit,
        role: user.role,
      },
    };
  }

  async revokeAllUserTokens(userId: number) {
    await this.prisma.prismaOnline.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  async logout(refreshToken: string) {
    if (refreshToken) {
      await this.prisma.prismaOnline.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revoked: true },
      });
    }
  }

  async cleanupExpiredTokens() {
    await this.prisma.prismaOnline.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }],
      },
    });
  }
}


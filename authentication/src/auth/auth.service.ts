import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { normalizeEmail } from '../common/email';
import {
  ANALYTICS,
  ANALYTICS_ACCESS_INCLUDE,
  AccessService,
  RequestContext,
  analyticsDenial,
} from '../access/access.service';
import { LoginLockService } from '../access/login-lock.service';
import { compareOrDummy, hashPassword, needsRehash } from '../common/password';

const CREDENCIAIS_INVALIDAS = 'Email ou senha incorretos';
const SENHA_ATUAL_INCORRETA = 'Senha atual incorreta';

@Injectable()
export class AuthService {
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly access: AccessService,
    private readonly lock: LoginLockService,
  ) {}

  /**
   * Senha certa com hash de custo menor que 12 (inclusive um $2a$11$
   * importado): refaz com custo 12, de forma transparente. É melhor-esforço:
   * uma falha aqui fica no log e NÃO derruba o login.
   */
  private async rehashIfNeeded(userId: number, password: string, hash: string) {
    if (!needsRehash(hash)) return;
    try {
      await this.prisma.prismaOnline.user.update({
        where: { id: userId },
        data: { password: await hashPassword(password) },
      });
    } catch (error) {
      this.logger.warn(`Rehash da senha falhou (usuário ${userId}): ${error}`);
    }
  }

  /**
   * POST /api/me/password. A senha atual errada conta no MESMO bloqueio do
   * login. A nova: ≥ 10 caracteres, diferente da atual e sem cara de hash.
   * Grava com custo 12 (senha única: substitui a anterior), revoga as OUTRAS
   * sessões (mantém a do refresh token atual) e audita, sem a senha.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    currentRefreshToken: string | undefined,
    ctx?: RequestContext,
  ) {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Sessão inválida');
    }
    if (!user.password) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Esta conta não tem senha (use "Definir senha")',
        code: 'NO_PASSWORD',
      });
    }
    if (this.lock.isLocked(user)) {
      await compareOrDummy(currentPassword, null);
      throw new UnauthorizedException(SENHA_ATUAL_INCORRETA);
    }
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      await this.lock.registerFailure(user.id, 'password_change', ctx);
      throw new UnauthorizedException(SENHA_ATUAL_INCORRETA);
    }
    await this.lock.registerSuccess(user.id, user);

    if (await bcrypt.compare(newPassword, user.password)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'A nova senha precisa ser diferente da atual',
        code: 'SAME_PASSWORD',
      });
    }

    const atual = currentRefreshToken
      ? await this.prisma.prismaOnline.refreshToken.findUnique({
          where: { token: currentRefreshToken },
          select: { id: true, userId: true },
        })
      : null;
    const manter = atual?.userId === userId ? atual.id : undefined;

    await this.prisma.prismaOnline.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { password: await hashPassword(newPassword) },
      });
      // As OUTRAS sessões são APAGADAS, não marcadas como revogadas: o refresh
      // trata um token revogado como reuso (possível roubo) e derruba TODAS as
      // sessões da pessoa, inclusive a atual. Apagado, ele é só "inválido".
      await tx.refreshToken.deleteMany({
        where: {
          userId,
          ...(manter && { id: { not: manter } }),
        },
      });
      await this.access.audit(
        {
          action: 'password.changed',
          actorUserId: userId,
          targetUserId: userId,
          ctx,
        },
        tx,
      );
    });

    return { message: 'Senha alterada com sucesso' };
  }

  /**
   * Pessoa pelo e-mail de login: o principal (User.email) ou um secundário
   * VERIFICADO (UserEmail). Um secundário não verificado não serve para entrar.
   */
  private async findByLoginEmail(email: string) {
    const normalized = normalizeEmail(email);
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { email: normalized },
      include: ANALYTICS_ACCESS_INCLUDE,
    });
    if (user) return user;

    const secondary = await this.prisma.prismaOnline.userEmail.findUnique({
      where: { email: normalized },
      include: { user: { include: ANALYTICS_ACCESS_INCLUDE } },
    });
    return secondary?.verifiedAt ? secondary.user : null;
  }

  async validateUser(email: string, password: string, ctx?: RequestContext) {
    const user = await this.findByLoginEmail(email);

    // E-mail inexistente, conta sem senha (só entra por outro meio) ou conta
    // BLOQUEADA: o mesmo 401 genérico, gastando o tempo de um bcrypt, para a
    // resposta não revelar qual dos casos é (nem pelo tempo).
    if (!user || !user.password || this.lock.isLocked(user)) {
      await compareOrDummy(password, null);
      throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);
    }

    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      await this.lock.registerFailure(user.id, 'login', ctx);
      throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);
    }

    await this.lock.registerSuccess(user.id, user);
    await this.rehashIfNeeded(user.id, password, user.password);

    // Senha certa, mas sem acesso ao Analytics (inativo, sem a flag ou sem
    // perfil): o MESMO 401 de sempre, e o motivo só na auditoria. A checagem
    // vem depois da senha para não auditar tentativas de quem não sabe a senha.
    const denial = analyticsDenial(user);
    if (denial) {
      await this.access.audit({
        action: `login.denied.${denial}`,
        targetUserId: user.id,
        systemKey: ANALYTICS,
        ctx,
      });
      throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);
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

  async refreshTokens(refreshToken: string, ctx?: RequestContext) {
    const storedToken = await this.prisma.prismaOnline.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: ANALYTICS_ACCESS_INCLUDE } },
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

    // A pessoa perdeu o acesso depois do login (inativada, sem a flag ou sem
    // perfil): revoga este refresh token e recusa.
    const denial = analyticsDenial(storedToken.user);
    if (denial) {
      await this.prisma.prismaOnline.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked: true },
      });
      await this.access.audit({
        action: `refresh.denied.${denial}`,
        targetUserId: storedToken.userId,
        systemKey: ANALYTICS,
        ctx,
      });
      throw new UnauthorizedException('Acesso não permitido');
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

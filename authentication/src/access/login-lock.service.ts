import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, RequestContext } from './access.service';

/** Erros de senha permitidos dentro da janela antes de bloquear a conta. */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const BASE_LOCK_MINUTES = 15;
const MAX_LOCK_MINUTES = 24 * 60;

/** Duração do n-ésimo bloqueio seguido: 15 min, 30, 60... até 24 h. */
export function lockMinutes(level: number): number {
  return Math.min(
    BASE_LOCK_MINUTES * 2 ** Math.max(level - 1, 0),
    MAX_LOCK_MINUTES,
  );
}

type LockState = {
  failedLoginCount: number;
  failedLoginFirstAt: Date | null;
  lockedUntil: Date | null;
  lockLevel: number;
};

/**
 * Bloqueio por tentativas, POR CONTA (o rate limit por IP é complementar).
 * 5 erros em 15 min bloqueiam a conta; bloqueios seguidos dobram o tempo até
 * 24 h; acertar a senha zera tudo. Quem chama devolve SEMPRE o mesmo 401.
 */
@Injectable()
export class LoginLockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  isLocked(user: Pick<LockState, 'lockedUntil'>, now = new Date()): boolean {
    return !!user.lockedUntil && user.lockedUntil > now;
  }

  /**
   * Conta um erro de senha (login ou troca de senha). Linha travada (FOR
   * UPDATE) para dois erros simultâneos não se perderem. Audita login.failed
   * (nunca com a senha) e, ao bloquear, login.locked.
   */
  async registerFailure(
    userId: number,
    source: 'login' | 'password_change',
    ctx?: RequestContext,
  ): Promise<void> {
    await this.prisma.prismaOnline.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      const u = await tx.user.findUnique({
        where: { id: userId },
        select: {
          failedLoginCount: true,
          failedLoginFirstAt: true,
          lockLevel: true,
        },
      });
      if (!u) return;

      const now = new Date();
      const janelaNova =
        !u.failedLoginFirstAt ||
        now.getTime() - u.failedLoginFirstAt.getTime() > FAILURE_WINDOW_MS;
      const count = janelaNova ? 1 : u.failedLoginCount + 1;

      await this.access.audit(
        {
          action: 'login.failed',
          targetUserId: userId,
          metadata: { source, failures: count },
          ctx,
        },
        tx,
      );

      if (count >= MAX_FAILURES) {
        const level = u.lockLevel + 1;
        const minutes = lockMinutes(level);
        await tx.user.update({
          where: { id: userId },
          data: {
            failedLoginCount: 0,
            failedLoginFirstAt: null,
            lockLevel: level,
            lockedUntil: new Date(now.getTime() + minutes * 60 * 1000),
          },
        });
        await this.access.audit(
          {
            action: 'login.locked',
            targetUserId: userId,
            metadata: { minutes, level },
            ctx,
          },
          tx,
        );
        return;
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: count,
          failedLoginFirstAt: janelaNova ? now : u.failedLoginFirstAt,
        },
      });
    });
  }

  /** Senha certa: zera contador, bloqueio vencido e backoff. */
  async registerSuccess(userId: number, state: Partial<LockState>) {
    const sujo =
      (state.failedLoginCount ?? 0) > 0 ||
      (state.lockLevel ?? 0) > 0 ||
      !!state.lockedUntil ||
      !!state.failedLoginFirstAt;
    if (!sujo) return;
    await this.prisma.prismaOnline.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        failedLoginFirstAt: null,
        lockedUntil: null,
        lockLevel: 0,
      },
    });
  }

  /** Desbloqueio manual (ADMIN da LHG), com auditoria. */
  async unlock(userId: number, actorId?: number, ctx?: RequestContext) {
    await this.prisma.prismaOnline.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: 0,
          failedLoginFirstAt: null,
          lockedUntil: null,
          lockLevel: 0,
        },
      });
      await this.access.audit(
        {
          action: 'login.unlocked',
          actorUserId: actorId,
          targetUserId: userId,
          ctx,
        },
        tx,
      );
    });
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import {
  ANALYTICS_ACCESS_INCLUDE,
  AccessService,
  RequestContext,
} from '../access/access.service';
import { normalizeEmail } from '../common/email';
import { situacao } from '../invitations/invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSettings, checkGoogleDomain } from './google.config';
import { GoogleClaims } from './google-identity.provider';

/** Motivo de recusa: vira ?google_error=<código> para o front. */
export type GoogleErrorCode =
  | 'email_unverified'
  | 'domain'
  | 'hd'
  | 'not_allowed'
  | 'inactive'
  | 'link_conflict'
  | 'email_unverified_conflict'
  | 'no_invite'
  | 'invite_invalid'
  | 'invite_email_mismatch';

export class GoogleRefusal extends Error {
  constructor(public readonly code: GoogleErrorCode) {
    super(code);
  }
}

/** A mensagem EXATA da tela quando o e-mail não tem convite. */
export const SEM_CONVITE =
  'Este e-mail não tem um convite válido. Entre em contato com o suporte técnico para solicitar um convite para o e-mail que você deseja usar.';

type UserComAcesso = User & { systemAccesses: { id: number }[] };

/**
 * Quem é a pessoa deste login com Google (seção 2.4, NUNCA duplicar):
 *   1. o googleSub já vinculado;
 *   2. o e-mail (principal ou secundário VERIFICADO) de uma pessoa existente
 *      → vincula o googleSub;
 *   3. um convite válido para o e-mail → cria a pessoa;
 *   4. senão, recusa ("sem convite").
 * Antes de tudo, as regras da seção 2.3 (email_verified, domínio/hd).
 */
@Injectable()
export class GoogleLoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private async recusar(
    code: GoogleErrorCode,
    ctx: RequestContext | undefined,
    extra: { targetUserId?: number; metadata?: Prisma.InputJsonValue } = {},
  ): Promise<never> {
    await this.access.audit({
      action: `google.${code === 'no_invite' ? 'no_invite' : `denied.${code}`}`,
      targetUserId: extra.targetUserId,
      metadata: extra.metadata,
      ctx,
    });
    throw new GoogleRefusal(code);
  }

  /** 1º login de cada domínio: registra o par (domínio, hd), sem outros dados. */
  private async registrarDominio(
    domain: string,
    hd: string | undefined,
    ctx?: RequestContext,
  ) {
    const visto = await this.prisma.prismaOnline.auditEvent.findFirst({
      where: {
        action: 'google.domain_seen',
        metadata: { path: ['domain'], equals: domain },
      },
      select: { id: true },
    });
    if (!visto) {
      await this.access.audit({
        action: 'google.domain_seen',
        metadata: { domain, hd: hd ?? null },
        ctx,
      });
    }
  }

  async resolve(
    claims: GoogleClaims,
    settings: GoogleSettings,
    inviteTokenHash: string | undefined,
    ctx?: RequestContext,
  ): Promise<UserComAcesso> {
    const email = normalizeEmail(claims.email ?? '');
    const domain = email.split('@')[1] ?? '';

    // 2.3.2: o Google tem de comprovar o e-mail.
    if (!email || !claims.email_verified) {
      return this.recusar('email_unverified', ctx, { metadata: { domain } });
    }
    // 2.3.4: domínio Workspace exige o hd esperado; gmail passa; o resto, não.
    const dom = checkGoogleDomain(email, claims.hd, settings.workspace);
    await this.registrarDominio(domain, claims.hd, ctx);
    if (!dom.ok) {
      return this.recusar(dom.reason === 'hd_mismatch' ? 'hd' : 'domain', ctx, {
        metadata: { domain, hd: claims.hd ?? null },
      });
    }

    // Veio do link do convite: o e-mail do Google TEM de ser o do convite.
    let conviteDoLink: Prisma.InvitationGetPayload<object> | null = null;
    if (inviteTokenHash) {
      conviteDoLink = await this.prisma.prismaOnline.invitation.findUnique({
        where: { tokenHash: inviteTokenHash },
      });
      if (!conviteDoLink || situacao(conviteDoLink) !== 'pending') {
        return this.recusar('invite_invalid', ctx, { metadata: { domain } });
      }
      if (conviteDoLink.email !== email) {
        return this.recusar('invite_email_mismatch', ctx, {
          metadata: { domain, invitationId: conviteDoLink.id },
        });
      }
    }

    // 1. googleSub já vinculado.
    const porSub = await this.prisma.prismaOnline.user.findUnique({
      where: { googleSub: claims.sub },
      include: ANALYTICS_ACCESS_INCLUDE,
    });
    if (porSub) return this.conferirPessoa(porSub, ctx);

    // 2. e-mail principal, ou secundário VERIFICADO, de alguém.
    const principal = await this.prisma.prismaOnline.user.findUnique({
      where: { email },
      include: ANALYTICS_ACCESS_INCLUDE,
    });
    const secundario = principal
      ? null
      : await this.prisma.prismaOnline.userEmail.findUnique({
          where: { email },
          include: { user: { include: ANALYTICS_ACCESS_INCLUDE } },
        });
    if (secundario && !secundario.verifiedAt) {
      return this.recusar('email_unverified_conflict', ctx, {
        targetUserId: secundario.userId,
        metadata: { domain },
      });
    }
    const existente = principal ?? secundario?.user ?? null;
    if (existente) {
      await this.conferirPessoa(existente, ctx);
      if (existente.googleSub && existente.googleSub !== claims.sub) {
        return this.recusar('link_conflict', ctx, {
          targetUserId: existente.id,
          metadata: { domain },
        });
      }
      return this.vincular(existente, claims, !!principal, ctx);
    }

    // 3. convite válido para o e-mail (do link, ou qualquer um pendente).
    const convite =
      conviteDoLink ??
      (await this.prisma.prismaOnline.invitation.findFirst({
        where: { email, acceptedAt: null, revokedAt: null },
      }));
    if (convite && situacao(convite) === 'pending') {
      return this.criarPorConvite(convite.id, claims, email, ctx);
    }

    // 4. sem convite: recusa, registrando só o domínio.
    return this.recusar('no_invite', ctx, { metadata: { domain } });
  }

  /** 2.3.5 e googleAllowed: inativo nunca é reativado pelo Google. */
  private async conferirPessoa(u: UserComAcesso, ctx?: RequestContext) {
    if (u.status !== UserStatus.ACTIVE) {
      return this.recusar('inactive', ctx, { targetUserId: u.id });
    }
    if (!u.googleAllowed) {
      return this.recusar('not_allowed', ctx, { targetUserId: u.id });
    }
    return u;
  }

  /** Vincula o googleSub à pessoa existente (senha e Google → a MESMA). */
  private async vincular(
    u: UserComAcesso,
    claims: GoogleClaims,
    pelosEmailPrincipal: boolean,
    ctx?: RequestContext,
  ): Promise<UserComAcesso> {
    if (u.googleSub === claims.sub) return u;
    const agora = new Date();
    const atualizado = await this.prisma.prismaOnline.user.update({
      where: { id: u.id },
      data: {
        googleSub: claims.sub,
        googleLinkedAt: agora,
        // O Google comprovou o e-mail principal.
        ...(pelosEmailPrincipal &&
          !u.emailVerifiedAt && { emailVerifiedAt: agora }),
      },
      include: ANALYTICS_ACCESS_INCLUDE,
    });
    await this.access.audit({
      action: 'google.linked',
      actorUserId: u.id,
      targetUserId: u.id,
      ctx,
    });
    return atualizado;
  }

  /** 2.4.3: cria a pessoa pelo convite, com as flags dele (inclusive nenhuma). */
  private async criarPorConvite(
    invitationId: number,
    claims: GoogleClaims,
    email: string,
    ctx?: RequestContext,
  ): Promise<UserComAcesso> {
    const criado = await this.prisma.prismaOnline.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Invitation" WHERE id = ${invitationId} FOR UPDATE`;
      const inv = await tx.invitation.findUniqueOrThrow({
        where: { id: invitationId },
      });
      if (situacao(inv) !== 'pending' || inv.email !== email) {
        throw new GoogleRefusal('invite_invalid');
      }
      const agora = new Date();
      const user = await tx.user.create({
        data: {
          email,
          name: claims.name?.trim() || inv.name,
          role: inv.role,
          unit: inv.unit,
          emailVerifiedAt: agora,
          createdVia: 'invite_google',
          googleSub: claims.sub,
          googleLinkedAt: agora,
        },
      });
      for (const systemKey of inv.systems) {
        await tx.systemAccess.create({
          data: { userId: user.id, systemKey, grantedById: inv.invitedById },
        });
        await this.access.audit(
          {
            action: 'access.granted',
            actorUserId: inv.invitedById,
            targetUserId: user.id,
            systemKey,
            metadata: { invitationId: inv.id },
            ctx,
          },
          tx,
        );
      }
      await tx.invitation.update({
        where: { id: inv.id },
        data: {
          acceptedAt: agora,
          acceptedUserId: user.id,
          acceptedMethod: 'google',
        },
      });
      await this.access.audit(
        {
          action: 'user.created_via_google',
          actorUserId: user.id,
          targetUserId: user.id,
          metadata: { invitationId: inv.id },
          ctx,
        },
        tx,
      );
      return user.id;
    });
    return this.prisma.prismaOnline.user.findUniqueOrThrow({
      where: { id: criado },
      include: ANALYTICS_ACCESS_INCLUDE,
    });
  }
}

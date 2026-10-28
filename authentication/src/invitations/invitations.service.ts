import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Invitation, Prisma, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import {
  ANALYTICS,
  AccessService,
  profileRequired,
} from '../access/access.service';
import { safeLaunchUrl } from '../access/launcher.service';
import { emailInUse, isEmailConflict, normalizeEmail } from '../common/email';
import { hashPassword, looksLikeBcryptHash } from '../common/password';
import { PrismaService } from '../prisma/prisma.service';
import { Actor } from '../users/users.service';
import { CreateInvitationDto, Validade } from './dto/invitation.dto';

const DIAS: Record<Validade, number | null> = {
  '7': 7,
  '14': 14,
  '30': 30,
  never: null,
};
const DIA_MS = 24 * 60 * 60 * 1000;

/** Mensagem única para TODO convite que não serve (não revela o motivo). */
export const CONVITE_INVALIDO =
  'Este convite não é mais válido. Entre em contato com o suporte técnico para solicitar um novo convite.';

const conviteInvalido = () =>
  new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message: CONVITE_INVALIDO,
    code: 'INVITE_INVALID',
  });
const conflito = (code: string, message: string) =>
  new ConflictException({ statusCode: 409, error: 'Conflict', message, code });
const erro400 = (code: string, message: string) =>
  new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message,
    code,
  });

/** SHA-256 em hex: é o que vai para o banco (o token em si nunca é guardado). */
export const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token, 'utf8').digest('hex');

/** "fulano@x.com" → "fu***@x.com" (o suficiente para a pessoa se reconhecer). */
export function maskEmail(email: string): string {
  const [local, dominio] = email.split('@');
  return `${local.slice(0, 2)}***@${dominio ?? ''}`;
}

type Situacao = 'pending' | 'accepted' | 'revoked' | 'expired';

export function situacao(inv: Invitation, agora = new Date()): Situacao {
  if (inv.acceptedAt) return 'accepted';
  if (inv.revokedAt) return 'revoked';
  if (inv.expiresAt && inv.expiresAt <= agora) return 'expired';
  return 'pending';
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly config: ConfigService,
  ) {}

  /** Token novo: 32 bytes aleatórios (base64url) e o hash dele. */
  private novoToken() {
    const token = crypto.randomBytes(32).toString('base64url');
    return { token, tokenHash: hashToken(token) };
  }

  /**
   * Link do convite: INVITE_LINK_BASE_URL + '#' + token. O token vai no
   * FRAGMENTO, que o navegador não envia ao servidor (não cai em logs).
   */
  private link(token: string): string | null {
    const base = safeLaunchUrl(this.config.get<string>('INVITE_LINK_BASE_URL'));
    return base ? `${base.replace(/#.*$/, '')}#${token}` : null;
  }

  private async emailTemDono(email: string, db: Prisma.TransactionClient) {
    const [u, sec] = await Promise.all([
      db.user.findUnique({ where: { email }, select: { id: true } }),
      db.userEmail.findUnique({ where: { email }, select: { id: true } }),
    ]);
    return !!(u || sec);
  }

  /** POST /api/invitations (ADMIN da LHG). O token aparece SÓ nesta resposta. */
  async create(dto: CreateInvitationDto, actor: Actor = {}) {
    const email = normalizeEmail(dto.email);
    const systems = await this.access.resolveSystems(dto.systems);
    if (systems.includes(ANALYTICS) && (!dto.role || !dto.unit)) {
      throw profileRequired();
    }
    const dias = DIAS[dto.validity];
    const neverReason = dto.neverReason?.trim() || null;
    if (dias === null && !neverReason) {
      throw erro400(
        'NEVER_REASON_REQUIRED',
        'Convite que nunca expira exige o motivo (neverReason)',
      );
    }
    const agora = new Date();
    const expiresAt =
      dias === null ? null : new Date(agora.getTime() + dias * DIA_MS);
    const { token, tokenHash } = this.novoToken();

    try {
      const inv = await this.prisma.prismaOnline.$transaction(async (tx) => {
        if (await this.emailTemDono(email, tx)) throw emailInUse();

        // Convite VENCIDO e ainda pendente para o mesmo e-mail: é revogado
        // (com auditoria) para dar lugar ao novo.
        const vencidos = await tx.invitation.findMany({
          where: {
            email,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { lte: agora },
          },
        });
        for (const v of vencidos) {
          await tx.invitation.update({
            where: { id: v.id },
            data: { revokedAt: agora, revokedById: actor.id ?? null },
          });
          await this.access.audit(
            {
              action: 'invite.expired_replaced',
              actorUserId: actor.id,
              metadata: { invitationId: v.id },
              ctx: actor.ctx,
            },
            tx,
          );
        }
        const pendente = await tx.invitation.findFirst({
          where: { email, acceptedAt: null, revokedAt: null },
          select: { id: true },
        });
        if (pendente) {
          throw conflito(
            'INVITE_PENDING',
            'Já existe um convite pendente para este e-mail',
          );
        }

        const criado = await tx.invitation.create({
          data: {
            email,
            name: dto.name?.trim() || null,
            systems,
            role: dto.role ?? null,
            unit: dto.unit ?? null,
            invitedById: actor.id ?? null,
            expiresAt,
            neverReason,
            tokenHash,
          },
        });
        await this.access.audit(
          {
            action: 'invite.created',
            actorUserId: actor.id,
            metadata: {
              invitationId: criado.id,
              systems,
              expiresAt: expiresAt ? expiresAt.toISOString() : null,
              ...(neverReason && { neverReason }),
            },
            ctx: actor.ctx,
          },
          tx,
        );
        return criado;
      });
      return {
        ...this.publico(inv),
        token,
        link: this.link(token),
      };
    } catch (error) {
      // Corrida: o índice único parcial barrou um 2º convite pendente.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw conflito(
          'INVITE_PENDING',
          'Já existe um convite pendente para este e-mail',
        );
      }
      throw error;
    }
  }

  /** Campos que podem sair na API (NUNCA o tokenHash). */
  private publico(inv: Invitation) {
    return {
      id: inv.id,
      email: inv.email,
      name: inv.name,
      systems: inv.systems,
      role: inv.role,
      unit: inv.unit,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      neverReason: inv.neverReason,
      linkCreatedAt: inv.linkCreatedAt,
      acceptedAt: inv.acceptedAt,
      acceptedMethod: inv.acceptedMethod,
      revokedAt: inv.revokedAt,
    };
  }

  /**
   * GET /api/invitations: todos, com situação, idade, os pendentes há mais
   * de 30 dias e os de quem convidou e foi inativado (para revisão).
   */
  async list() {
    const agora = new Date();
    const convites = await this.prisma.prismaOnline.invitation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: { select: { id: true, name: true, status: true } },
      },
    });
    return convites.map((inv) => {
      const sit = situacao(inv, agora);
      const ageDays = Math.floor(
        (agora.getTime() - inv.createdAt.getTime()) / DIA_MS,
      );
      return {
        ...this.publico(inv),
        status: sit,
        ageDays,
        pendingOver30Days: sit === 'pending' && ageDays > 30,
        inviterInactive:
          sit === 'pending' && inv.invitedBy?.status === UserStatus.INACTIVE,
        invitedBy: inv.invitedBy
          ? { id: inv.invitedBy.id, name: inv.invitedBy.name }
          : null,
      };
    });
  }

  private async porId(id: number) {
    const inv = await this.prisma.prismaOnline.invitation.findUnique({
      where: { id },
    });
    if (!inv) throw new NotFoundException('Convite não encontrado');
    return inv;
  }

  /** DELETE /api/invitations/:id: revoga (só o que ainda não foi usado). */
  async revoke(id: number, actor: Actor = {}) {
    const inv = await this.porId(id);
    if (inv.acceptedAt || inv.revokedAt) {
      throw conflito(
        'INVITE_NOT_PENDING',
        'Este convite já foi usado ou revogado',
      );
    }
    await this.prisma.prismaOnline.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id },
        data: { revokedAt: new Date(), revokedById: actor.id ?? null },
      });
      await this.access.audit(
        {
          action: 'invite.revoked',
          actorUserId: actor.id,
          metadata: { invitationId: id },
          ctx: actor.ctx,
        },
        tx,
      );
    });
    return { message: 'Convite revogado' };
  }

  /**
   * POST /api/invitations/:id/new-link: token novo; o anterior deixa de
   * valer. Só para convite pendente e dentro da validade.
   */
  async newLink(id: number, actor: Actor = {}) {
    const inv = await this.porId(id);
    if (situacao(inv) !== 'pending') {
      throw conflito(
        'INVITE_NOT_PENDING',
        'Só um convite pendente e dentro da validade ganha link novo',
      );
    }
    const { token, tokenHash } = this.novoToken();
    const atualizado = await this.prisma.prismaOnline.$transaction(
      async (tx) => {
        const u = await tx.invitation.update({
          where: { id },
          data: { tokenHash, linkCreatedAt: new Date() },
        });
        await this.access.audit(
          {
            action: 'invite.link_regenerated',
            actorUserId: actor.id,
            metadata: { invitationId: id },
            ctx: actor.ctx,
          },
          tx,
        );
        return u;
      },
    );
    return { ...this.publico(atualizado), token, link: this.link(token) };
  }

  /** Convite válido pelo token (pelo hash): pendente e dentro da validade. */
  private async validoPorToken(
    token: string,
    db: Prisma.TransactionClient | PrismaService['prismaOnline'],
  ) {
    const inv = await db.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!inv || situacao(inv) !== 'pending') throw conviteInvalido();
    return inv;
  }

  /** POST /api/invitations/accept/check: o que a tela de aceite mostra. */
  async check(token: string) {
    const inv = await this.validoPorToken(token, this.prisma.prismaOnline);
    return {
      valid: true,
      emailMasked: maskEmail(inv.email),
      expiresAt: inv.expiresAt,
      methods: ['password', 'google'],
    };
  }

  /**
   * POST /api/invitations/accept/password: cria a pessoa com a senha ÚNICA
   * (custo 12) e as flags do convite, e marca o convite como aceito. O link
   * não chegou por e-mail (1c), então o e-mail NÃO fica verificado.
   */
  async acceptByPassword(token: string, password: string, actor: Actor = {}) {
    if (looksLikeBcryptHash(password)) {
      throw erro400(
        'PASSWORD_LOOKS_LIKE_HASH',
        'A senha não pode ter o formato de um hash',
      );
    }
    // Confere antes de gastar o bcrypt; confere de novo, travado, na transação.
    await this.validoPorToken(token, this.prisma.prismaOnline);
    const hash = await hashPassword(password);

    try {
      return await this.prisma.prismaOnline.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Invitation" WHERE "tokenHash" = ${hashToken(token)} FOR UPDATE`;
        const inv = await this.validoPorToken(token, tx);
        if (await this.emailTemDono(inv.email, tx)) throw emailInUse();

        const user = await tx.user.create({
          data: {
            email: inv.email,
            name: inv.name,
            password: hash,
            role: inv.role,
            unit: inv.unit,
            createdVia: 'invite_password',
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
              ctx: actor.ctx,
            },
            tx,
          );
        }
        await tx.invitation.update({
          where: { id: inv.id },
          data: {
            acceptedAt: new Date(),
            acceptedUserId: user.id,
            acceptedMethod: 'password',
          },
        });
        await this.access.audit(
          {
            action: 'user.created_via_invite',
            actorUserId: user.id,
            targetUserId: user.id,
            metadata: { invitationId: inv.id, method: 'password' },
            ctx: actor.ctx,
          },
          tx,
        );
        return {
          message: 'Conta criada. Entre com o seu e-mail e a senha escolhida.',
          emailMasked: maskEmail(user.email),
        };
      });
    } catch (error) {
      if (isEmailConflict(error)) throw emailInUse();
      throw error;
    }
  }
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { OidcLogoutService } from '../oidc/oidc-logout.service';
import { PrismaService } from '../prisma/prisma.service';
import { cpfInUse, isCpfConflict } from '../common/cpf';
import { emailInUse, isEmailConflict, normalizeEmail } from '../common/email';
import { hashPassword, looksLikeBcryptHash } from '../common/password';
import {
  ANALYTICS,
  AccessService,
  RequestContext,
  cpfRequired,
  profileRequired,
  systemsRequired,
  userInactive,
} from '../access/access.service';
import { LoginLockService } from '../access/login-lock.service';

/** Quem faz a ação (admin logado) e de onde, para auditoria e autoria. */
export interface Actor {
  id?: number;
  ctx?: RequestContext;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly config: ConfigService,
    private readonly lock: LoginLockService,
    private readonly oidcLogout: OidcLogoutService,
  ) {}

  // Desbloqueio manual de uma conta bloqueada por tentativas (ADMIN da LHG).
  async unlock(id: number, actor: Actor = {}) {
    const user = await this.findById(id);
    await this.lock.unlock(id, actor.id, actor.ctx);
    return { message: `Usuário ${user.email} desbloqueado` };
  }

  /**
   * Sem o campo `systems` no cadastro: fase de transição. Com
   * USERS_SYSTEMS_REQUIRED=true, o campo passa a ser obrigatório.
   */
  private systemsRequired(): boolean {
    const v = this.config.get<string>('USERS_SYSTEMS_REQUIRED');
    return (
      String(v ?? '')
        .trim()
        .toLowerCase() === 'true'
    );
  }

  /**
   * Criação de usuário. Nenhum acesso é automático: só os sistemas de
   * `systems` recebem a flag (grantedById = o admin). Sem o campo, na
   * transição, vale `analytics` se role e unit vierem (é o formato da tela de
   * cadastro atual), com auditoria `legacyDefault`.
   */
  async create(
    data: any,
    actor: Actor = {},
  ): Promise<{ user: any; legacyDefault: boolean }> {
    const { systems: pedidos, ...dados } = data;
    const email = normalizeEmail(dados.email);

    // Um e-mail pertence a uma pessoa só: principal OU secundário de alguém.
    const [existingUser, existingSecondary] = await Promise.all([
      this.prisma.prismaOnline.user.findUnique({ where: { email } }),
      this.prisma.prismaOnline.userEmail.findUnique({ where: { email } }),
    ]);
    if (existingUser?.status === UserStatus.INACTIVE) throw userInactive();
    if (existingUser || existingSecondary) throw emailInUse();

    let systems: string[];
    let legacyDefault = false;
    if (pedidos === undefined) {
      if (this.systemsRequired()) throw systemsRequired();
      systems = [ANALYTICS];
      legacyDefault = true;
    } else {
      systems = await this.access.resolveSystems(pedidos);
    }
    if (systems.includes(ANALYTICS) && (!dados.role || !dados.unit)) {
      throw profileRequired();
    }
    // CPF: opcional para quem não recebe o Analytics; obrigatório com ele.
    if (systems.includes(ANALYTICS) && !dados.cpf) {
      throw cpfRequired();
    }

    // Criptografa a senha antes de salvar (custo 12)
    const hashedPassword = await hashPassword(dados.password);
    try {
      const user = await this.prisma.prismaOnline.$transaction(async (tx) => {
        const criado = await tx.user.create({
          data: { ...dados, email, password: hashedPassword },
        });
        await this.access.audit(
          {
            action: 'user.created',
            actorUserId: actor.id,
            targetUserId: criado.id,
            metadata: { systems, ...(legacyDefault && { legacyDefault }) },
            ctx: actor.ctx,
          },
          tx,
        );
        for (const systemKey of systems) {
          await tx.systemAccess.create({
            data: {
              userId: criado.id,
              systemKey,
              grantedById: actor.id ?? null,
            },
          });
          await this.access.audit(
            {
              action: 'access.granted',
              actorUserId: actor.id,
              targetUserId: criado.id,
              systemKey,
              ...(legacyDefault && { metadata: { legacyDefault } }),
              ctx: actor.ctx,
            },
            tx,
          );
        }
        return criado;
      });
      return { user, legacyDefault };
    } catch (error) {
      // Corrida com outro cadastro do mesmo e-mail (unique/trigger do banco).
      if (isEmailConflict(error)) throw emailInUse();
      if (isCpfConflict(error)) throw cpfInUse();
      throw error;
    }
  }

  // Lista só os ativos (a tela atual não muda); inativos só se pedidos.
  async findAll(includeInactive = false) {
    try {
      const users = await this.prisma.prismaOnline.user.findMany({
        where: includeInactive ? undefined : { status: UserStatus.ACTIVE },
      });
      return users;
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      throw new Error('Erro ao buscar usuários');
    }
  }

  // Buscar usuário por email com validação
  async findByEmail(email: string) {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { email: normalizeEmail(email) },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  // Buscar usuário por ID com validação
  async findById(id: number) {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  // Atualizar usuário com validação de senha. NÃO mexe em acessos (flags):
  // isso é só pelo PUT /users/:id/systems.
  async update(id: number, data: any, actor: Actor = {}) {
    const user = await this.findById(id); // Verifica se o usuário existe

    // Senha: só uma senha NOVA de verdade troca o hash. Ausente, nula, vazia
    // ou só espaços = inalterada. Um hash bcrypt (a tela de edição devolvendo
    // o próprio campo password que recebeu do GET) também é IGNORADO: senão a
    // senha da pessoa viraria o texto do hash e o login dela quebraria.
    if (typeof data.password !== 'string' || data.password.trim() === '') {
      delete data.password;
    } else if (looksLikeBcryptHash(data.password)) {
      delete data.password;
      this.logger.warn(
        `PATCH /users/${id}: password com formato de hash bcrypt ignorado (senha inalterada)`,
      );
      await this.access.audit({
        action: 'password.hash_echo_ignored',
        actorUserId: actor.id,
        targetUserId: id,
        ctx: actor.ctx,
      });
    } else {
      data.password = await hashPassword(data.password);
    }
    if (typeof data.email === 'string') {
      data.email = normalizeEmail(data.email);
    }

    try {
      return await this.prisma.prismaOnline.user.update({
        where: { id },
        data: { ...user, ...data },
      });
    } catch (error) {
      if (isEmailConflict(error)) throw emailInUse();
      if (isCpfConflict(error)) throw cpfInUse();
      throw error;
    }
  }

  // "Remover" = INATIVAR: a pessoa fica no cadastro (status INACTIVE), todas
  // as sessões caem e a auditoria registra quem fez. Resposta igual à de antes.
  async remove(id: number, actor: Actor = {}) {
    const user = await this.findById(id); // Verifica se o usuário existe

    if (user.status !== UserStatus.INACTIVE) {
      await this.prisma.prismaOnline.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            status: UserStatus.INACTIVE,
            deactivatedAt: new Date(),
            deactivatedById: actor.id ?? null,
          },
        });
        await tx.refreshToken.updateMany({
          where: { userId: id, revoked: false },
          data: { revoked: true },
        });
        await this.access.audit(
          {
            action: 'user.deactivated',
            actorUserId: actor.id,
            targetUserId: id,
            ctx: actor.ctx,
          },
          tx,
        );
      });
      // Login central: todas as sessões SSO e grants caem, e os clientes que
      // ela usava recebem o aviso de logout (back-channel).
      await this.oidcLogout.encerrarSemFalhar(user.publicId, 'inactivation');
    }

    return { message: `Usuário ${user.email} excluído com sucesso` }; // Mensagem de sucesso
  }

  // Reativa uma pessoa inativada (os acessos dela não mudam).
  async reactivate(id: number, actor: Actor = {}) {
    const user = await this.findById(id);

    if (user.status !== UserStatus.ACTIVE) {
      await this.prisma.prismaOnline.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            status: UserStatus.ACTIVE,
            deactivatedAt: null,
            deactivatedById: null,
          },
        });
        await this.access.audit(
          {
            action: 'user.reactivated',
            actorUserId: actor.id,
            targetUserId: id,
            ctx: actor.ctx,
          },
          tx,
        );
      });
    }

    return { message: `Usuário ${user.email} reativado com sucesso` };
  }

  /**
   * Substitui o conjunto de acessos ATIVOS da pessoa: concede o que entrou e
   * revoga o que saiu (revokedAt/revokedById; o histórico fica), com um
   * AuditEvent por mudança. Revogar o Analytics derruba as sessões.
   */
  async setSystems(id: number, pedidos: string[], actor: Actor = {}) {
    const user = await this.findById(id);
    const desejados = await this.access.resolveSystems(pedidos);
    if (desejados.includes(ANALYTICS) && (!user.role || !user.unit)) {
      throw profileRequired();
    }

    const resultado = await this.prisma.prismaOnline.$transaction(
      async (tx) => {
        const ativos = await tx.systemAccess.findMany({
          where: { userId: id, revokedAt: null },
        });
        const atuais = new Set(ativos.map((a) => a.systemKey));
        const revogar = ativos.filter((a) => !desejados.includes(a.systemKey));
        const conceder = desejados.filter((k) => !atuais.has(k));
        const agora = new Date();

        for (const acesso of revogar) {
          await tx.systemAccess.update({
            where: { id: acesso.id },
            data: { revokedAt: agora, revokedById: actor.id ?? null },
          });
          await this.access.audit(
            {
              action: 'access.revoked',
              actorUserId: actor.id,
              targetUserId: id,
              systemKey: acesso.systemKey,
              ctx: actor.ctx,
            },
            tx,
          );
        }
        for (const systemKey of conceder) {
          await tx.systemAccess.create({
            data: { userId: id, systemKey, grantedById: actor.id ?? null },
          });
          await this.access.audit(
            {
              action: 'access.granted',
              actorUserId: actor.id,
              targetUserId: id,
              systemKey,
              ctx: actor.ctx,
            },
            tx,
          );
        }
        if (revogar.some((a) => a.systemKey === ANALYTICS)) {
          await tx.refreshToken.updateMany({
            where: { userId: id, revoked: false },
            data: { revoked: true },
          });
        }

        return {
          systems: [...desejados].sort(),
          granted: conceder.sort(),
          revoked: revogar.map((a) => a.systemKey).sort(),
        };
      },
    );
    // Login central: flag revogada → só os clientes daquele sistema perdem o
    // grant/refresh e recebem o aviso; os outros sistemas continuam.
    for (const systemKey of resultado.revoked) {
      await this.oidcLogout.encerrarSemFalhar(user.publicId, 'flag_revoked', {
        systemKey,
      });
    }
    return resultado;
  }
}

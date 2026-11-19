import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
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
import {
  HUB_ADMIN,
  ehPermissao,
  permissaoNaoPermitida,
} from '../access/permissoes';

/** Quem faz a ação (admin logado) e de onde, para auditoria e autoria. */
export interface Actor {
  id?: number;
  ctx?: RequestContext;
}

/** Checagem extra DENTRO da transação de uma mudança (ex.: travas do admin). */
export type ChecagemNaTransacao = (
  tx: Prisma.TransactionClient,
) => Promise<void>;

/** Recusa de administração com código estável (painel do HUB e API legada). */
export function recusaDeAdmin(
  status: 403 | 409,
  code: string,
  message: string,
): ForbiddenException | ConflictException {
  return status === 403
    ? new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message,
        code,
      })
    : new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message,
        code,
      });
}

/** Administrador da LHG ativo (quem usa o painel admin do HUB). */
const ehAdminLhg = (u: { role: unknown; unit: unknown; status: unknown }) =>
  u.role === 'ADMIN' && u.unit === 'LHG' && u.status === UserStatus.ACTIVE;

/**
 * Nunca ficar sem nenhum administrador da LHG ativo, DENTRO da transação:
 * trava as linhas dos admins ativos (duas mudanças ao mesmo tempo se
 * enfileiram, e a segunda vê o resultado da primeira) e recusa se `alvoId`
 * for o último. Com `chamadorId`, reconfere também que quem pede ainda é
 * admin (o JWT pode estar velho).
 */
export function travaDeAdmins(
  chamadorId: number | undefined,
  alvoId: number,
): ChecagemNaTransacao {
  return async (tx) => {
    const admins = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM "User"
       WHERE role = 'ADMIN' AND unit = 'LHG' AND status = 'ACTIVE'
       FOR UPDATE`;
    if (chamadorId !== undefined && !admins.some((a) => a.id === chamadorId)) {
      throw recusaDeAdmin(
        403,
        'FORBIDDEN_NOT_ADMIN',
        'Só administradores da LHG',
      );
    }
    if (!admins.some((a) => a.id !== alvoId)) {
      throw recusaDeAdmin(
        409,
        'LAST_ADMIN',
        'Não é possível ficar sem nenhum administrador da LHG ativo',
      );
    }
  };
}

/**
 * travaDeAdmins só quando o ALVO é admin da LHG ativo (API legada: quem
 * inativa um admin precisa ainda ser admin no banco; os demais, como antes).
 */
export function travaDeAdminsSeAlvoAdmin(
  chamadorId: number | undefined,
  alvoId: number,
): ChecagemNaTransacao {
  return async (tx) => {
    const alvo = await tx.user.findUnique({
      where: { id: alvoId },
      select: { role: true, unit: true, status: true },
    });
    if (alvo && ehAdminLhg(alvo)) await travaDeAdmins(chamadorId, alvoId)(tx);
  };
}

/**
 * Nunca ficar sem nenhum admin do HUB (permissão 'hub-admin' ativa de pessoa
 * ATIVA), DENTRO da transação. Trava as linhas das concessões E das pessoas
 * (FOR UPDATE OF a, u): uma revogação ou inativação ao mesmo tempo faz a outra
 * esperar e reler. `alvoId` = quem vai perder (null = ninguém): recusa se for o
 * último (409 LAST_HUB_ADMIN). `chamadorId` = quem pede: precisa ter a
 * permissão (403 HUB_ADMIN_REQUIRED).
 */
export function travaHubAdmins(
  chamadorId: number | undefined,
  alvoId: number | null,
): ChecagemNaTransacao {
  return async (tx) => {
    const donos = await tx.$queryRaw<{ id: number }[]>`
      SELECT u.id FROM "SystemAccess" a
      JOIN "User" u ON u.id = a."userId"
      WHERE a."systemKey" = ${HUB_ADMIN} AND a."revokedAt" IS NULL
        AND u.status = 'ACTIVE'
      FOR UPDATE OF a, u`;
    if (chamadorId !== undefined && !donos.some((d) => d.id === chamadorId)) {
      throw recusaDeAdmin(
        403,
        'HUB_ADMIN_REQUIRED',
        'Só quem é admin do HUB pode dar ou tirar essa permissão',
      );
    }
    if (
      alvoId !== null &&
      donos.some((d) => d.id === alvoId) &&
      !donos.some((d) => d.id !== alvoId)
    ) {
      throw recusaDeAdmin(
        409,
        'LAST_HUB_ADMIN',
        'Não é possível ficar sem nenhum admin do HUB',
      );
    }
  };
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

    // Tirar o ADMIN/LHG de alguém (perfil ou unidade): as travas do painel do
    // HUB, também aqui. Ninguém rebaixa a si mesmo, e nunca fica zero admin.
    const perdeAdmin =
      ehAdminLhg(user) &&
      ((data.role ?? user.role) !== 'ADMIN' ||
        (data.unit ?? user.unit) !== 'LHG');
    if (perdeAdmin && actor.id === id) {
      throw recusaDeAdmin(
        409,
        'SELF_ROLE_CHANGE',
        'Você não pode tirar o seu próprio perfil de administrador da LHG',
      );
    }

    try {
      if (!perdeAdmin) {
        return await this.prisma.prismaOnline.user.update({
          where: { id },
          data: { ...user, ...data },
        });
      }
      return await this.prisma.prismaOnline.$transaction(async (tx) => {
        await travaDeAdmins(actor.id, id)(tx);
        return tx.user.update({ where: { id }, data: { ...user, ...data } });
      });
    } catch (error) {
      if (isEmailConflict(error)) throw emailInUse();
      if (isCpfConflict(error)) throw cpfInUse();
      throw error;
    }
  }

  // "Remover" = INATIVAR: a pessoa fica no cadastro (status INACTIVE), todas
  // as sessões caem e a auditoria registra quem fez. Resposta igual à de antes.
  // `antes` (opcional) roda dentro da transação, antes de inativar: as travas
  // do admin do HUB (ex.: nunca ficar sem nenhum admin da LHG ativo).
  async remove(id: number, actor: Actor = {}, antes?: ChecagemNaTransacao) {
    const user = await this.findById(id); // Verifica se o usuário existe

    // As travas do painel do HUB valem em QUALQUER caminho (inclusive o
    // DELETE /users/:id legado): ninguém se inativa e nunca fica zero admin.
    if (actor.id === id) {
      throw recusaDeAdmin(
        409,
        'SELF_DEACTIVATION',
        'Você não pode inativar a si mesmo',
      );
    }

    if (user.status !== UserStatus.INACTIVE) {
      await this.prisma.prismaOnline.$transaction(async (tx) => {
        // Quem pede é conferido pela rota (antes); aqui, em qualquer caminho,
        // só "nunca zero": admin da LHG (Analytics) e admin do HUB.
        if (ehAdminLhg(user)) await travaDeAdmins(undefined, id)(tx);
        await travaHubAdmins(undefined, id)(tx);
        if (antes) await antes(tx);
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
    // API legada: não pede permissão (400) e não mexe nas que a pessoa já
    // tem (a lista substitui só os SISTEMAS).
    const desejados = await this.access.resolveSystems(pedidos);
    return this.aplicarSistemas(
      id,
      (atuais) => [...new Set([...desejados, ...atuais.filter(ehPermissao)])],
      actor,
    );
  }

  /**
   * Mudança em DELTA (admin do HUB): concede `conceder` e revoga `revogar`
   * sobre as flags ATUAIS, lidas com a linha da pessoa travada (FOR UPDATE):
   * duas mudanças ao mesmo tempo não se sobrescrevem.
   */
  async changeSystems(
    id: number,
    mudanca: { conceder: string[]; revogar: string[] },
    actor: Actor = {},
    antes?: ChecagemNaTransacao,
    opcoes: { permissoes?: boolean } = {},
  ) {
    const novos = await this.access.resolveSystems(
      mudanca.conceder,
      undefined,
      opcoes,
    );
    const revogarPermissao = mudanca.revogar.filter(ehPermissao);
    if (!opcoes.permissoes && revogarPermissao.length) {
      throw permissaoNaoPermitida(revogarPermissao);
    }
    const sair = new Set(mudanca.revogar);
    return this.aplicarSistemas(
      id,
      (atuais) => [
        ...new Set([...atuais.filter((k) => !sair.has(k)), ...novos]),
      ],
      actor,
      antes,
    );
  }

  private async aplicarSistemas(
    id: number,
    calcular: (atuais: string[]) => string[],
    actor: Actor,
    antes?: ChecagemNaTransacao,
  ) {
    const user = await this.findById(id);

    const resultado = await this.prisma.prismaOnline.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
        if (antes) await antes(tx);
        const ativos = await tx.systemAccess.findMany({
          where: { userId: id, revokedAt: null },
        });
        const desejados = calcular(ativos.map((a) => a.systemKey));
        if (desejados.includes(ANALYTICS) && (!user.role || !user.unit)) {
          throw profileRequired();
        }
        const atuais = new Set(ativos.map((a) => a.systemKey));
        const revogar = ativos.filter((a) => !desejados.includes(a.systemKey));
        // Ninguém tira os PRÓPRIOS acessos (conceder a si mesmo pode): a mesma
        // trava do painel do HUB, também na API legada (PUT /users/:id/systems).
        if (actor.id === id && revogar.length) {
          throw recusaDeAdmin(
            409,
            'SELF_ACCESS_CHANGE',
            'Você não pode tirar os próprios acessos',
          );
        }
        // Tirar a permissão de admin do HUB de alguém: nunca o último.
        if (revogar.some((a) => a.systemKey === HUB_ADMIN)) {
          await travaHubAdmins(undefined, id)(tx);
        }
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

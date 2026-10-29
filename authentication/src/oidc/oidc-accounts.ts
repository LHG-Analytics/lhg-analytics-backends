import { PrismaClient, UserStatus } from '@prisma/client';
import { AccessService, requestContext } from '../access/access.service';

/** Escopos que o login central concede (sem tela de consentimento, D6). */
export const ESCOPOS = 'openid email profile';

/** Motivo de recusa (só para a auditoria; o cliente vê só access_denied). */
export type OidcDenial = 'inactive' | 'no_flag';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Origem da requisição para a auditoria. SEMPRE pelo req do Express (o IP
 * resolvido pelo trust proxy do serviço), NUNCA pelo ctx.ip do provedor: com
 * provider.proxy = true ele vem do X-Forwarded-For, que o navegador forja.
 */
export const origemDaRequisicao = (ctx: any) =>
  ctx?.req ? requestContext(ctx.req) : undefined;

/**
 * Contas do login central: o `sub` é o publicId (UUID estável, nunca o id
 * numérico) e as claims são só sub, email, email_verified e name (D5).
 * Também aplica a regra de acesso (status e flag) antes do code e em todo
 * refresh.
 */
export class OidcAccounts {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly access: AccessService,
    private readonly errors: any,
  ) {}

  private pessoa(publicId: string) {
    if (!UUID.test(publicId ?? '')) return null;
    return this.prisma.user.findUnique({ where: { publicId } });
  }

  /** A flag exigida pelo cliente (null = basta a pessoa estar ATIVA). */
  private async systemKeyDo(clientId: string): Promise<string | null> {
    const c = await this.prisma.oidcClient.findUnique({
      where: { clientId },
      select: { systemKey: true },
    });
    return c?.systemKey ?? null;
  }

  /** Pode usar este cliente? Devolve o motivo da recusa, ou null se pode. */
  async recusa(
    publicId: string,
    clientId: string,
  ): Promise<{
    motivo: OidcDenial;
    userId?: number;
    systemKey?: string;
  } | null> {
    const u = await this.pessoa(publicId);
    if (!u || u.status !== UserStatus.ACTIVE) {
      return { motivo: 'inactive', userId: u?.id };
    }
    const systemKey = await this.systemKeyDo(clientId);
    if (!systemKey) return null;
    const flag = await this.prisma.systemAccess.findFirst({
      where: {
        userId: u.id,
        systemKey,
        revokedAt: null,
        system: { active: true },
      },
      select: { id: true },
    });
    return flag ? null : { motivo: 'no_flag', userId: u.id, systemKey };
  }

  private async auditarRecusa(
    r: { motivo: OidcDenial; userId?: number; systemKey?: string },
    clientId: string,
    etapa: 'authorize' | 'token',
    ctx: any,
  ) {
    await this.access.audit({
      action: `oidc.denied.${r.motivo}`,
      targetUserId: r.userId,
      systemKey: r.systemKey,
      metadata: { clientId, etapa },
      ctx: origemDaRequisicao(ctx),
    });
  }

  /** Revoga TUDO o que foi emitido sob o grant (tokens, code) e o grant. */
  async revogarGrant(grantId: string | undefined) {
    if (!grantId) return;
    await this.prisma.oidcPayload.deleteMany({
      where: { OR: [{ grantId }, { type: 'Grant', id: grantId }] },
    });
  }

  /**
   * findAccount do provedor. Sem `token` (autorização): a conta só existe se
   * a pessoa estiver ATIVA (senão a sessão SSO não vale e o login é pedido de
   * novo). Com `token` (troca do code, refresh, userinfo): status E flag do
   * cliente daquele token; recusado → auditoria, grant revogado e undefined
   * (o provedor responde invalid_grant / invalid_token).
   */
  findAccount = async (ctx: any, sub: string, token?: any) => {
    if (token?.clientId) {
      const r = await this.recusa(sub, token.clientId);
      if (r) {
        await this.auditarRecusa(r, token.clientId, 'token', ctx);
        await this.revogarGrant(token.grantId);
        return undefined;
      }
    }
    const u = await this.pessoa(sub);
    if (!u || u.status !== UserStatus.ACTIVE) return undefined;
    const claims = {
      sub: u.publicId,
      email: u.email,
      email_verified: !!u.emailVerifiedAt,
      ...(u.name && { name: u.name }),
    };
    return { accountId: u.publicId, claims: async () => claims };
  };

  /**
   * loadExistingGrant do provedor: roda ANTES de emitir o code, inclusive no
   * SSO (sem pedir senha). Pessoa inativa ou sem a flag do sistema do cliente
   * → access_denied (com auditoria). Senão, o grant dos escopos do login
   * central, criado na hora (sem tela de consentimento, D6).
   */
  loadExistingGrant = async (ctx: any) => {
    const { client, session } = ctx.oidc;
    const r = await this.recusa(session.accountId, client.clientId);
    if (r) {
      await this.auditarRecusa(r, client.clientId, 'authorize', ctx);
      throw new this.errors.AccessDenied('acesso não permitido');
    }
    const { Grant } = ctx.oidc.provider;
    const grantId =
      ctx.oidc.result?.consent?.grantId ?? session.grantIdFor(client.clientId);
    const existente = grantId ? await Grant.find(grantId) : undefined;
    if (existente) return existente;
    const grant = new Grant({
      accountId: session.accountId,
      clientId: client.clientId,
    });
    grant.addOIDCScope(ESCOPOS);
    await grant.save();
    return grant;
  };
}

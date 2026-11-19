import { PrismaClient, UserStatus } from '@prisma/client';
import { AccessService, requestContext } from '../access/access.service';

/** Escopos que o login central concede (sem tela de consentimento, D6). */
export const ESCOPOS = 'openid email profile';

/** Motivo de recusa (só para a auditoria; o cliente vê só access_denied). */
export type OidcDenial = 'inactive' | 'no_flag';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A pessoa + a flag do cliente, lidas numa consulta só (OidcAccounts.conta). */
type LinhaConta = {
  id: number;
  publicId: string;
  email: string;
  name: string | null;
  emailVerifiedAt: Date | null;
  status: UserStatus;
  systemKey: string | null;
  flag: boolean;
};
type Recusa = { motivo: OidcDenial; userId?: number; systemKey?: string };

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

  /**
   * A pessoa, a flag exigida pelo cliente (OidcClient.systemKey; null = basta
   * estar ATIVA) e se ela tem essa flag (acesso não revogado de um sistema
   * ativo), numa ida ao banco só: o banco de usuários fica longe do serviço e
   * cada consulta em sequência custa uma ida e volta. Sem clientId, só a pessoa.
   */
  private async conta(
    publicId: string,
    clientId: string | null,
  ): Promise<LinhaConta | null> {
    if (!UUID.test(publicId ?? '')) return null;
    const [l] = await this.prisma.$queryRaw<LinhaConta[]>`
      SELECT u.id, u."publicId"::text AS "publicId", u.email, u.name,
             u."emailVerifiedAt", u.status::text AS status, c."systemKey",
             (c."systemKey" IS NOT NULL AND EXISTS (
               SELECT 1 FROM "SystemAccess" a
               JOIN "System" s ON s.key = a."systemKey"
               WHERE a."userId" = u.id AND a."systemKey" = c."systemKey"
                 AND a."revokedAt" IS NULL AND s.active
             )) AS flag
      FROM "User" u
      LEFT JOIN "OidcClient" c ON c."clientId" = ${clientId}
      WHERE u."publicId" = ${publicId}::uuid`;
    return l ?? null;
  }

  /** Motivo da recusa para a linha lida, ou null se pode usar o cliente. */
  private motivo(u: LinhaConta | null): Recusa | null {
    if (!u || u.status !== UserStatus.ACTIVE) {
      return { motivo: 'inactive', userId: u?.id };
    }
    if (!u.systemKey || u.flag) return null;
    return { motivo: 'no_flag', userId: u.id, systemKey: u.systemKey };
  }

  /** Pode usar este cliente? Devolve o motivo da recusa, ou null se pode. */
  async recusa(publicId: string, clientId: string): Promise<Recusa | null> {
    return this.motivo(await this.conta(publicId, clientId));
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
    // A MESMA leitura serve para a regra de acesso e para as claims.
    const u = await this.conta(sub, token?.clientId ?? null);
    if (token?.clientId) {
      const r = this.motivo(u);
      if (r) {
        await this.auditarRecusa(r, token.clientId, 'token', ctx);
        await this.revogarGrant(token.grantId);
        return undefined;
      }
    }
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

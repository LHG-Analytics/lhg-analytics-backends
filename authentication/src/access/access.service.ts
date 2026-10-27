import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Chave do Analytics no catálogo de sistemas. */
export const ANALYTICS = 'analytics';

/** Include do Prisma que traz só o acesso ATIVO ao Analytics. */
export const ANALYTICS_ACCESS_INCLUDE = {
  systemAccesses: {
    where: { systemKey: ANALYTICS, revokedAt: null },
    select: { id: true },
  },
} satisfies Prisma.UserInclude;

/** Motivo (só para a auditoria) de uma pessoa não poder usar o Analytics. */
export type AnalyticsDenial = 'inactive' | 'no_access' | 'no_profile';

/**
 * Pode usar o Analytics? Exige status ACTIVE, a flag `analytics` ativa e
 * role/unit preenchidos (o JWT e os guards dependem dos dois).
 * Devolve o motivo da recusa, ou null se pode.
 */
export function analyticsDenial(user: {
  status: UserStatus;
  role: string | null;
  unit: string | null;
  systemAccesses?: unknown[];
}): AnalyticsDenial | null {
  if (user.status !== UserStatus.ACTIVE) return 'inactive';
  if (!user.systemAccesses?.length) return 'no_access';
  if (!user.role || !user.unit) return 'no_profile';
  return null;
}

/** Origem de uma requisição, para a auditoria. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

/** IP (já resolvido pelo trust proxy) e User-Agent de uma requisição Express. */
export function requestContext(req: {
  ip?: string;
  headers?: Record<string, unknown>;
}): RequestContext {
  const ua = req.headers?.['user-agent'];
  return { ip: req.ip, userAgent: typeof ua === 'string' ? ua : undefined };
}

export interface AuditInput {
  action: string;
  actorUserId?: number | null;
  targetUserId?: number | null;
  systemKey?: string | null;
  metadata?: Prisma.InputJsonValue;
  ctx?: RequestContext;
}

type Db = Prisma.TransactionClient | PrismaService['prismaOnline'];

const erro400 = (code: string, message: string) =>
  new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message,
    code,
  });

export const unknownSystem = (keys: string[]) =>
  erro400(
    'UNKNOWN_SYSTEM',
    `Sistema desconhecido ou inativo: ${keys.join(', ')}`,
  );
export const systemsRequired = () =>
  erro400('SYSTEMS_REQUIRED', 'Informe os sistemas da pessoa (systems)');
export const profileRequired = () =>
  erro400(
    'ROLE_UNIT_REQUIRED',
    'role e unit são obrigatórios para o acesso ao Analytics',
  );
export const userInactive = () =>
  new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    message: 'Este email pertence a um usuário inativo',
    code: 'USER_INACTIVE',
  });

@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grava um evento de auditoria (só inserção). NUNCA recebe senha, hash ou
   * token. Dentro de uma transação, use o `db` dela; fora, uma falha ao
   * auditar não derruba a requisição (fica no log).
   */
  async audit(input: AuditInput, db?: Db): Promise<void> {
    const data: Prisma.AuditEventUncheckedCreateInput = {
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      targetUserId: input.targetUserId ?? null,
      systemKey: input.systemKey ?? null,
      metadata: input.metadata,
      ip: input.ctx?.ip?.slice(0, 64) ?? null,
      userAgent: input.ctx?.userAgent?.slice(0, 512) ?? null,
    };
    if (db) {
      await db.auditEvent.create({ data });
      return;
    }
    try {
      await this.prisma.prismaOnline.auditEvent.create({ data });
    } catch (error) {
      this.logger.error(`Falha ao gravar AuditEvent ${input.action}`, error);
    }
  }

  /**
   * Para rotas autenticadas por JWT (me, helpdesk): o access token vale 1h,
   * mas quem foi inativado ou perdeu a flag nesse meio-tempo é recusado.
   */
  async assertCanUseAnalytics(userId: number): Promise<void> {
    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { id: userId },
      include: ANALYTICS_ACCESS_INCLUDE,
    });
    if (!user || analyticsDenial(user)) {
      throw new UnauthorizedException('Sessão inválida');
    }
  }

  /**
   * Lista de sistemas pedida → chaves únicas, todas existentes e ativas no
   * catálogo. Senão, 400 UNKNOWN_SYSTEM.
   */
  async resolveSystems(keys: string[], db?: Db): Promise<string[]> {
    const unicos = [...new Set(keys)];
    if (unicos.length === 0) return [];
    const ativos = await (db ?? this.prisma.prismaOnline).system.findMany({
      where: { key: { in: unicos }, active: true },
      select: { key: true },
    });
    const validos = new Set(ativos.map((s) => s.key));
    const invalidos = unicos.filter((k) => !validos.has(k));
    if (invalidos.length) throw unknownSystem(invalidos);
    return unicos;
  }
}

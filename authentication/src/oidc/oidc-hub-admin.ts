import { HttpException, Logger, ValidationPipe } from '@nestjs/common';
import { Prisma, PrismaClient, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { NextFunction, Request, Response, Router, json } from 'express';
import { isIP } from 'net';
import { requestContext } from '../access/access.service';
import { HUB_PROXY_KEY, chaveDoProxy } from '../common/client-ip';
import { CreateInvitationDto } from '../invitations/dto/invitation.dto';
import {
  InvitationsService,
  situacao,
} from '../invitations/invitations.service';
import { Actor, UsersService } from '../users/users.service';
import { CLIENTE_HUB } from './oidc-hub';

/** Login recente exigido para inativar e para mudar acesso (2g, item b). */
export const LOGIN_RECENTE_S = 12 * 60 * 60;
const POR_PAGINA = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdminDeps {
  provider: any;
  prisma: PrismaClient;
  users: UsersService;
  invitations: InvitationsService;
  /** HUB_PROXY_KEY (≥ 32); sem ela, as rotas de admin ficam fechadas. */
  chave?: string | null;
}

/** Quem chama: a pessoa do access token, conferida no banco. */
interface Chamador {
  id: number;
  publicId: string;
  nome: string | null;
  admin: boolean;
  sessionUid?: string;
}

/** Erro com código estável para o portal. */
class ErroAdmin extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function mesmoTexto(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** IP para o histórico: só o começo (a.b.x.x / a:b:…). */
export function mascararIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  if (isIP(ip) === 4) return ip.replace(/^(\d+\.\d+)\..*$/, '$1.x.x');
  if (isIP(ip) === 6) return ip.replace(/^([0-9a-f]*:[0-9a-f]*):.*$/i, '$1:…');
  return null;
}

/** Só estas chaves do metadata da auditoria saem no histórico. */
const METADATA_VISIVEL = new Set([
  'method',
  'clientId',
  'domain',
  'systems',
  'invitationId',
  'reason',
  'via',
  'expiresAt',
  'neverReason',
  'systemKey',
]);
function metadataVisivel(m: unknown): Record<string, unknown> {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (!METADATA_VISIVEL.has(k)) continue;
    if (['string', 'number', 'boolean'].includes(typeof v) || v === null) {
      out[k] = v;
    } else if (
      Array.isArray(v) &&
      v.every((x) => typeof x === 'string' || typeof x === 'number')
    ) {
      out[k] = v;
    }
  }
  return out;
}

/** Campos da pessoa que saem nas rotas de admin: NUNCA hash, CPF nem googleSub. */
const PESSOA_SELECT = {
  id: true,
  publicId: true,
  name: true,
  email: true,
  status: true,
  role: true,
  unit: true,
  createdVia: true,
  createdAt: true,
  deactivatedAt: true,
  emailVerifiedAt: true,
  googleSub: true, // só para o booleano googleVinculado; o valor não sai
  lockedUntil: true,
  systemAccesses: {
    where: { revokedAt: null },
    select: { systemKey: true },
  },
} satisfies Prisma.UserSelect;
type PessoaLida = Prisma.UserGetPayload<{ select: typeof PESSOA_SELECT }>;

function pessoaPublica(u: PessoaLida, agora = new Date()) {
  return {
    id: u.publicId,
    nome: u.name,
    email: u.email,
    status: u.status,
    perfil: u.role,
    unidade: u.unit,
    sistemas: u.systemAccesses.map((a) => a.systemKey).sort(),
    bloqueadaAte:
      u.lockedUntil && u.lockedUntil > agora
        ? u.lockedUntil.toISOString()
        : null,
    googleVinculado: !!u.googleSub,
    emailVerificado: !!u.emailVerifiedAt,
    criadoVia: u.createdVia,
    criadoEm: u.createdAt.toISOString(),
    inativadoEm: u.deactivatedAt?.toISOString() ?? null,
  };
}

const VALIDADE: Record<string, string> = {
  '7': '7',
  '14': '14',
  '30': '30',
  nunca: 'never',
};

type Convite = {
  id: number;
  email: string;
  name: string | null;
  systems: string[];
  role: string | null;
  unit: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  neverReason: string | null;
  acceptedAt: Date | null;
  acceptedMethod: string | null;
  revokedAt: Date | null;
};
const SITUACAO_PT: Record<string, string> = {
  pending: 'pendente',
  accepted: 'aceito',
  revoked: 'revogado',
  expired: 'vencido',
};
function convitePublico(c: Convite) {
  return {
    id: c.id,
    email: c.email,
    nome: c.name,
    sistemas: c.systems,
    perfil: c.role,
    unidade: c.unit,
    situacao: SITUACAO_PT[situacao(c as any)],
    criadoEm: c.createdAt.toISOString(),
    expiraEm: c.expiresAt?.toISOString() ?? null,
    motivoSemValidade: c.neverReason,
    aceitoEm: c.acceptedAt?.toISOString() ?? null,
    aceitoPor: c.acceptedMethod,
    revogadoEm: c.revokedAt?.toISOString() ?? null,
  };
}

const validar = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  validationError: { target: false, value: false },
});

const listaDeChaves = (v: unknown, campo: string): string[] => {
  if (v === undefined) return [];
  if (
    !Array.isArray(v) ||
    v.length > 20 ||
    !v.every((x) => typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x))
  ) {
    throw new ErroAdmin(
      400,
      'INVALID_BODY',
      `${campo} deve ser uma lista de chaves de sistema`,
    );
  }
  return [...new Set(v as string[])];
};

/** Corpo JSON só com os campos conhecidos (campo a mais = 400). */
function corpoCom(body: unknown, campos: string[]): Record<string, any> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ErroAdmin(400, 'INVALID_BODY', 'Corpo JSON inválido');
  }
  const extras = Object.keys(body).filter((k) => !campos.includes(k));
  if (extras.length) {
    throw new ErroAdmin(
      400,
      'INVALID_BODY',
      `Campo(s) não aceito(s): ${extras.join(', ')}`,
    );
  }
  return body as Record<string, any>;
}

/**
 * 2g: administração de pessoas e convites pelo portal (cliente 'hub'),
 * montada em /oidc/hub/admin/* antes do provedor. Em TODA chamada:
 * - x-hub-proxy-key confere com o HUB_PROXY_KEY (o token sozinho não basta,
 *   e o IP real do admin vai para a auditoria);
 * - Bearer: access token do login central emitido para o 'hub', com openid,
 *   validado no PRÓPRIO provedor;
 * - a pessoa é lida do BANCO: ATIVA + ADMIN + unidade LHG (rebaixar alguém
 *   vale na chamada seguinte). A exceção é GET /eu, que diz se é admin.
 * Inativar e mudar acesso exigem login de no máximo 12 h (REAUTH_REQUIRED).
 * As ações usam os MESMOS serviços das rotas /api (mesmas regras e a mesma
 * auditoria, com o admin como ator). Saídas explícitas: sem hash, CPF nem
 * googleSub.
 */
export function rotasDeAdmin(d: AdminDeps): Router {
  const logger = new Logger('OIDC');
  const r = Router();
  const chave = d.chave === undefined ? chaveDoProxy() : d.chave;

  r.use('/hub/admin', json({ limit: '16kb' }), (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  async function chamador(req: Request): Promise<Chamador> {
    const enviada = req.headers[HUB_PROXY_KEY];
    if (!chave || typeof enviada !== 'string' || !mesmoTexto(enviada, chave)) {
      throw new ErroAdmin(401, 'PROXY_KEY_REQUIRED', 'Não autorizado');
    }
    const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{10,})$/.exec(
      String(req.headers.authorization ?? ''),
    );
    const at = m ? await d.provider.AccessToken.find(m[1]) : null;
    if (
      !at ||
      at.clientId !== CLIENTE_HUB ||
      !String(at.scope ?? '')
        .split(' ')
        .includes('openid')
    ) {
      throw new ErroAdmin(401, 'INVALID_TOKEN', 'Não autorizado');
    }
    const u = await d.prisma.user.findUnique({
      where: { publicId: at.accountId },
      select: {
        id: true,
        publicId: true,
        name: true,
        status: true,
        role: true,
        unit: true,
      },
    });
    if (!u || u.status !== UserStatus.ACTIVE) {
      throw new ErroAdmin(401, 'INVALID_TOKEN', 'Não autorizado');
    }
    return {
      id: u.id,
      publicId: u.publicId,
      nome: u.name,
      admin: u.role === 'ADMIN' && u.unit === 'LHG',
      sessionUid: at.sessionUid,
    };
  }

  const exigirAdmin = (c: Chamador) => {
    if (!c.admin) {
      throw new ErroAdmin(
        403,
        'FORBIDDEN_NOT_ADMIN',
        'Só administradores da LHG',
      );
    }
  };

  /** Login (senha ou Google) de no máximo 12 h na sessão SSO do token. */
  async function exigirLoginRecente(c: Chamador) {
    const s = c.sessionUid
      ? await d.provider.Session.findByUid(c.sessionUid)
      : null;
    const loginTs = Number(s?.loginTs ?? 0);
    if (
      !s ||
      s.accountId !== c.publicId ||
      Math.floor(Date.now() / 1000) - loginTs > LOGIN_RECENTE_S
    ) {
      throw new ErroAdmin(
        403,
        'REAUTH_REQUIRED',
        'Entre de novo para fazer esta alteração',
      );
    }
  }

  const ator = (c: Chamador, req: Request): Actor => ({
    id: c.id,
    ctx: requestContext(req),
  });

  async function pessoaPorPublicId(publicId: string) {
    if (!UUID.test(publicId)) {
      throw new ErroAdmin(404, 'NOT_FOUND', 'Pessoa não encontrada');
    }
    const u = await d.prisma.user.findUnique({
      where: { publicId },
      select: PESSOA_SELECT,
    });
    if (!u) throw new ErroAdmin(404, 'NOT_FOUND', 'Pessoa não encontrada');
    return u;
  }

  /** Express + async; erros viram { code, message } com o status certo. */
  const rota =
    (
      fn: (req: Request, res: Response, c: Chamador) => Promise<unknown>,
      opcoes: { soAdmin?: boolean } = {},
    ) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const c = await chamador(req);
        if (opcoes.soAdmin !== false) exigirAdmin(c);
        await fn(req, res, c);
      } catch (e) {
        if (e instanceof ErroAdmin) {
          if (e.status === 401) {
            res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
          }
          return res
            .status(e.status)
            .json({ code: e.code, message: e.message });
        }
        if (e instanceof HttpException) {
          const corpo = e.getResponse() as
            | { code?: string; message?: unknown }
            | string;
          const message =
            typeof corpo === 'string'
              ? corpo
              : Array.isArray(corpo?.message)
                ? corpo.message.join('; ')
                : String(corpo?.message ?? e.message);
          return res.status(e.getStatus()).json({
            code:
              (typeof corpo === 'object' && corpo?.code) ||
              (e.getStatus() === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST'),
            message,
          });
        }
        logger.warn(
          `oidc admin: falha em ${req.method} ${req.path} (${(e as Error)?.name ?? 'erro'})`,
        );
        next(e);
      }
    };

  // ── Quem sou eu (para o portal mostrar ou esconder o menu) ─────────────
  r.get(
    '/hub/admin/eu',
    rota(
      async (_req, res, c) => {
        res.json({ id: c.publicId, nome: c.nome, admin: c.admin });
      },
      { soAdmin: false },
    ),
  );

  // ── Pessoas ────────────────────────────────────────────────────────────
  r.get(
    '/hub/admin/pessoas',
    rota(async (req, res) => {
      const busca =
        typeof req.query.busca === 'string'
          ? req.query.busca.trim().slice(0, 100)
          : '';
      const st = String(req.query.status ?? 'todos');
      const pagina = Math.max(
        1,
        Math.min(10_000, Number(req.query.pagina) || 1),
      );
      const where: Prisma.UserWhereInput = {
        ...(st === 'ativos' && { status: UserStatus.ACTIVE }),
        ...(st === 'inativos' && { status: UserStatus.INACTIVE }),
        ...(busca && {
          OR: [
            { name: { contains: busca, mode: 'insensitive' } },
            { email: { contains: busca.toLowerCase() } },
          ],
        }),
      };
      const [total, lista] = await Promise.all([
        d.prisma.user.count({ where }),
        d.prisma.user.findMany({
          where,
          select: PESSOA_SELECT,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (pagina - 1) * POR_PAGINA,
          take: POR_PAGINA,
        }),
      ]);
      const agora = new Date();
      res.json({
        pessoas: lista.map((u) => pessoaPublica(u, agora)),
        total,
        pagina,
        porPagina: POR_PAGINA,
      });
    }),
  );

  r.get(
    '/hub/admin/pessoas/:id',
    rota(async (req, res) => {
      const u = await pessoaPorPublicId(req.params.id);
      const [acessos, emails, convite] = await Promise.all([
        d.prisma.systemAccess.findMany({
          where: { userId: u.id, revokedAt: null },
          orderBy: { systemKey: 'asc' },
          select: {
            systemKey: true,
            grantedAt: true,
            grantedBy: { select: { publicId: true, name: true } },
          },
        }),
        d.prisma.userEmail.findMany({
          where: { userId: u.id },
          orderBy: { email: 'asc' },
          select: { email: true, verifiedAt: true },
        }),
        d.prisma.invitation.findFirst({
          where: { acceptedUserId: u.id },
          select: {
            createdAt: true,
            acceptedAt: true,
            acceptedMethod: true,
            invitedBy: { select: { publicId: true, name: true } },
          },
        }),
      ]);
      res.json({
        ...pessoaPublica(u),
        acessos: acessos.map((a) => ({
          sistema: a.systemKey,
          concedidoEm: a.grantedAt.toISOString(),
          concedidoPor: a.grantedBy
            ? { id: a.grantedBy.publicId, nome: a.grantedBy.name }
            : null,
        })),
        emailsSecundarios: emails.map((e) => ({
          email: e.email,
          verificado: !!e.verifiedAt,
        })),
        conviteDeOrigem: convite
          ? {
              criadoEm: convite.createdAt.toISOString(),
              aceitoEm: convite.acceptedAt?.toISOString() ?? null,
              aceitoPor: convite.acceptedMethod,
              convidadoPor: convite.invitedBy
                ? {
                    id: convite.invitedBy.publicId,
                    nome: convite.invitedBy.name,
                  }
                : null,
            }
          : null,
      });
    }),
  );

  r.get(
    '/hub/admin/pessoas/:id/historico',
    rota(async (req, res) => {
      const u = await pessoaPorPublicId(req.params.id);
      const antes = /^\d{1,18}$/.test(String(req.query.antes ?? ''))
        ? BigInt(String(req.query.antes))
        : null;
      const eventos = await d.prisma.auditEvent.findMany({
        where: {
          OR: [{ targetUserId: u.id }, { actorUserId: u.id }],
          ...(antes !== null && { id: { lt: antes } }),
        },
        orderBy: { id: 'desc' },
        take: POR_PAGINA + 1,
        select: {
          id: true,
          at: true,
          action: true,
          systemKey: true,
          ip: true,
          metadata: true,
          actorUserId: true,
          targetUserId: true,
        },
      });
      const pagina = eventos.slice(0, POR_PAGINA);
      const ids = [
        ...new Set(
          pagina
            .flatMap((e) => [e.actorUserId, e.targetUserId])
            .filter((x): x is number => typeof x === 'number'),
        ),
      ];
      const nomes = new Map(
        (
          await d.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, publicId: true, name: true },
          })
        ).map((p) => [p.id, { id: p.publicId, nome: p.name }]),
      );
      const quem = (id: number | null) =>
        id == null ? null : (nomes.get(id) ?? null);
      res.json({
        eventos: pagina.map((e) => ({
          id: e.id.toString(),
          em: e.at.toISOString(),
          acao: e.action,
          sistema: e.systemKey,
          ator: quem(e.actorUserId),
          alvo: quem(e.targetUserId),
          ip: mascararIp(e.ip),
          detalhes: metadataVisivel(e.metadata),
        })),
        proximo:
          eventos.length > POR_PAGINA
            ? pagina[pagina.length - 1].id.toString()
            : null,
      });
    }),
  );

  // Sistemas em DELTA. Login recente; o admin não tira os próprios acessos.
  r.put(
    '/hub/admin/pessoas/:id/sistemas',
    rota(async (req, res, c) => {
      await exigirLoginRecente(c);
      const u = await pessoaPorPublicId(req.params.id);
      const b = corpoCom(req.body, ['conceder', 'revogar']);
      const conceder = listaDeChaves(b.conceder, 'conceder');
      const revogar = listaDeChaves(b.revogar, 'revogar');
      if (!conceder.length && !revogar.length) {
        throw new ErroAdmin(
          400,
          'INVALID_BODY',
          'Nada a conceder nem a revogar',
        );
      }
      if (conceder.some((k) => revogar.includes(k))) {
        throw new ErroAdmin(
          400,
          'INVALID_BODY',
          'O mesmo sistema não pode ser concedido e revogado',
        );
      }
      if (u.id === c.id && revogar.length) {
        throw new ErroAdmin(
          409,
          'SELF_ACCESS_CHANGE',
          'Você não pode tirar os próprios acessos',
        );
      }
      const r2 = await d.users.changeSystems(
        u.id,
        { conceder, revogar },
        ator(c, req),
      );
      res.json({
        sistemas: r2.systems,
        concedidos: r2.granted,
        revogados: r2.revoked,
      });
    }),
  );

  r.post(
    '/hub/admin/pessoas/:id/inativar',
    rota(async (req, res, c) => {
      await exigirLoginRecente(c);
      const u = await pessoaPorPublicId(req.params.id);
      if (u.id === c.id) {
        throw new ErroAdmin(
          409,
          'SELF_DEACTIVATION',
          'Você não pode inativar a si mesmo',
        );
      }
      if (u.status === UserStatus.INACTIVE) {
        return res.json({ status: 'INACTIVE', mudou: false });
      }
      await d.users.remove(u.id, ator(c, req), async (tx) => {
        // Trava as linhas dos admins da LHG ativos: duas inativações ao
        // mesmo tempo se enfileiram, e a segunda vê o resultado da primeira.
        const admins = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM "User"
           WHERE role = 'ADMIN' AND unit = 'LHG' AND status = 'ACTIVE'
           FOR UPDATE`;
        if (!admins.some((a) => a.id === c.id)) {
          throw new ErroAdmin(
            403,
            'FORBIDDEN_NOT_ADMIN',
            'Só administradores da LHG',
          );
        }
        if (!admins.some((a) => a.id !== u.id)) {
          throw new ErroAdmin(
            409,
            'LAST_ADMIN',
            'Não é possível ficar sem nenhum administrador da LHG ativo',
          );
        }
      });
      res.json({ status: 'INACTIVE', mudou: true });
    }),
  );

  r.post(
    '/hub/admin/pessoas/:id/reativar',
    rota(async (req, res, c) => {
      const u = await pessoaPorPublicId(req.params.id);
      if (u.status === UserStatus.ACTIVE) {
        return res.json({ status: 'ACTIVE', mudou: false });
      }
      await d.users.reactivate(u.id, ator(c, req));
      res.json({ status: 'ACTIVE', mudou: true });
    }),
  );

  r.post(
    '/hub/admin/pessoas/:id/desbloquear',
    rota(async (req, res, c) => {
      const u = await pessoaPorPublicId(req.params.id);
      await d.users.unlock(u.id, ator(c, req));
      res.json({ desbloqueada: true });
    }),
  );

  // ── Convites ───────────────────────────────────────────────────────────
  r.get(
    '/hub/admin/convites',
    rota(async (req, res) => {
      const filtro = String(req.query.situacao ?? '');
      const todos = (await d.invitations.list()) as unknown as Convite[];
      const lista = todos
        .map(convitePublico)
        .filter((c) => !filtro || c.situacao === filtro);
      res.json({ convites: lista });
    }),
  );

  r.post(
    '/hub/admin/convites',
    rota(async (req, res, c) => {
      const b = corpoCom(req.body, [
        'email',
        'nome',
        'sistemas',
        'perfil',
        'unidade',
        'validade',
        'motivo',
      ]);
      const validity = VALIDADE[String(b.validade)];
      if (!validity) {
        throw new ErroAdmin(
          400,
          'INVALID_BODY',
          'validade deve ser 7, 14, 30 ou nunca',
        );
      }
      const dto = (await validar.transform(
        {
          email: b.email,
          ...(b.nome !== undefined && { name: b.nome }),
          systems: b.sistemas ?? [],
          ...(b.perfil !== undefined && { role: b.perfil }),
          ...(b.unidade !== undefined && { unit: b.unidade }),
          validity,
          ...(b.motivo !== undefined && { neverReason: b.motivo }),
        },
        { type: 'body', metatype: CreateInvitationDto },
      )) as CreateInvitationDto;
      const criado = await d.invitations.create(dto, ator(c, req));
      res.status(201).json({
        convite: convitePublico(criado as unknown as Convite),
        // O link aparece SÓ nesta resposta (o token não é guardado).
        link: criado.link,
      });
    }),
  );

  const idDoConvite = (raw: string) => {
    if (!/^\d{1,9}$/.test(raw)) {
      throw new ErroAdmin(404, 'NOT_FOUND', 'Convite não encontrado');
    }
    return Number(raw);
  };

  r.delete(
    '/hub/admin/convites/:id',
    rota(async (req, res, c) => {
      await d.invitations.revoke(idDoConvite(req.params.id), ator(c, req));
      res.json({ revogado: true });
    }),
  );

  r.post(
    '/hub/admin/convites/:id/novo-link',
    rota(async (req, res, c) => {
      const n = await d.invitations.newLink(
        idDoConvite(req.params.id),
        ator(c, req),
      );
      res.json({
        convite: convitePublico(n as unknown as Convite),
        link: n.link,
      });
    }),
  );

  // Qualquer outro /hub/admin/*: 404 em JSON (não cai no provedor).
  r.use('/hub/admin', (_req: Request, res: Response) =>
    res.status(404).json({ code: 'NOT_FOUND', message: 'Rota não encontrada' }),
  );
  // Corpo inválido (JSON quebrado ou grande demais): 400/413 em JSON.
  r.use(
    '/hub/admin',
    (err: any, _req: Request, res: Response, next: NextFunction) => {
      if (err?.type === 'entity.parse.failed') {
        return res
          .status(400)
          .json({ code: 'INVALID_BODY', message: 'JSON inválido' });
      }
      if (err?.type === 'entity.too.large') {
        return res
          .status(413)
          .json({ code: 'BODY_TOO_LARGE', message: 'Corpo grande demais' });
      }
      next(err);
    },
  );

  return r;
}

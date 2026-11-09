import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import {
  NextFunction,
  Request,
  Response,
  Router,
  json,
  urlencoded,
} from 'express';
import { AccessService, requestContext } from '../access/access.service';
import { SAIR_IAT_MAX_S } from './oidc-hub-sair';
import { OidcLogoutService } from './oidc-logout.service';

/**
 * O que o "Sair" de um cliente encerra:
 * - 'sid' (padrão): só a sessão SSO do sid do id_token (o navegador onde a
 *   pessoa clicou em Sair) e os grants/refresh dela;
 * - 'todas': TODAS as sessões SSO da pessoa e TODOS os grants dela, inclusive
 *   os soltos de sessões antigas (outros aparelhos).
 */
export type EscopoDeSaida = 'sid' | 'todas';

export function escopoDeSaida(bruto: string | undefined): EscopoDeSaida {
  return bruto?.trim().toLowerCase() === 'todas' ? 'todas' : 'sid';
}

export interface ClienteSairDeps {
  provider: any;
  prisma: PrismaClient;
  logout: OidcLogoutService;
  access: AccessService;
  escopo: EscopoDeSaida;
}

function mesmoTexto(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** client_secret_basic (RFC 6749 2.3.1: id e segredo form-urlencoded). */
function credenciais(req: Request): { id: string; segredo: string } | null {
  const h = req.headers.authorization;
  if (typeof h !== 'string' || !/^basic /i.test(h)) return null;
  try {
    const bruto = Buffer.from(h.slice(6).trim(), 'base64').toString('utf8');
    const i = bruto.indexOf(':');
    if (i <= 0) return null;
    const dec = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));
    return { id: dec(bruto.slice(0, i)), segredo: dec(bruto.slice(i + 1)) };
  } catch {
    return null;
  }
}

/**
 * POST /cliente/sair: o "Sair" de QUALQUER cliente, servidor → servidor, sem
 * página nenhuma no navegador. Mesmo efeito do end_session confirmado:
 * - autenticação do PRÓPRIO cliente: client_secret_basic (a x-hub-proxy-key
 *   NÃO vale aqui); cliente inexistente, inativo ou segredo errado → 401;
 * - corpo (JSON ou form): { id_token_hint }. O id_token é conferido pelas
 *   chaves do provedor: RS256, iss, aud = o client_id autenticado, sid e sub
 *   obrigatórios; exp vencido vale (como no end_session), iat de no máximo
 *   7 dias atrás. Inválido → 400 INVALID_ID_TOKEN_HINT;
 * - escopo 'sid': acha a sessão SSO desse sid (authorizations[client].sid) e
 *   dessa pessoa, revoga os grants de TODOS os clientes dela (com eles, os
 *   refresh), enfileira o back-channel dos OUTROS clientes e apaga a sessão.
 *   Escopo 'todas' (OIDC_CLIENTE_SAIR_ESCOPO=todas): todas as sessões e
 *   todos os grants da pessoa;
 * - sempre 204 com credenciais e token válidos (idempotente). Auditoria
 *   'cliente.sair'; nada de token no log nem na auditoria.
 * O cookie de sessão do provedor fica no navegador, mas aponta para uma
 * sessão que não existe mais: o próximo login pede senha ou Google.
 */
export function rotaDeSairDoCliente(d: ClienteSairDeps): Router {
  const logger = new Logger('OIDC');
  const r = Router();
  const negar = (res: Response) =>
    res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="oidc"')
      .json({ code: 'invalid_client', message: 'Cliente não autenticado' });
  const tokenInvalido = (res: Response) =>
    res.status(400).json({
      code: 'INVALID_ID_TOKEN_HINT',
      message: 'id_token_hint inválido',
    });

  r.post(
    '/cliente/sair',
    // O cliente se autentica ANTES de o corpo ser lido.
    async (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const c = credenciais(req);
        if (!c) return negar(res);
        const client = await d.provider.Client.find(c.id).catch(() => null);
        if (
          !client?.clientSecret ||
          !mesmoTexto(c.segredo, String(client.clientSecret))
        ) {
          return negar(res);
        }
        res.locals.cliente = client;
        next();
      } catch (e) {
        next(e);
      }
    },
    json({ limit: '16kb' }),
    urlencoded({ extended: false, limit: '16kb' }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const client = res.locals.cliente;
        const clientId: string = client.clientId;
        const b = req.body;
        if (
          !b ||
          typeof b !== 'object' ||
          Array.isArray(b) ||
          Object.keys(b).some((k) => k !== 'id_token_hint') ||
          typeof b.id_token_hint !== 'string' ||
          !b.id_token_hint
        ) {
          return res
            .status(400)
            .json({ code: 'INVALID_BODY', message: 'Corpo inválido' });
        }

        let payload: Record<string, any>;
        try {
          ({ payload } = await d.provider.IdToken.validate(
            b.id_token_hint,
            client,
          ));
        } catch {
          return tokenInvalido(res);
        }
        const agora = Math.floor(Date.now() / 1000);
        const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (
          !aud.includes(clientId) ||
          typeof payload.sid !== 'string' ||
          !payload.sid ||
          typeof payload.sub !== 'string' ||
          !payload.sub ||
          typeof payload.iat !== 'number' ||
          agora - payload.iat > SAIR_IAT_MAX_S ||
          payload.iat - agora > 60
        ) {
          return tokenInvalido(res);
        }
        const sub: string = payload.sub;

        const { sessoes, grants } = await d.logout.sairDoCliente(
          clientId,
          sub,
          payload.sid,
          d.escopo,
        );

        const u = await d.prisma.user.findUnique({
          where: { publicId: sub },
          select: { id: true },
        });
        await d.access.audit({
          action: 'cliente.sair',
          actorUserId: u?.id,
          targetUserId: u?.id,
          metadata: { clientId, escopo: d.escopo, sessoes, grants },
          ctx: requestContext(req),
        });
        return res.status(204).end();
      } catch (e) {
        logger.warn(
          `oidc: falha no /cliente/sair (${(e as Error)?.name ?? 'erro'})`,
        );
        next(e);
      }
    },
  );

  // Corpo quebrado ou grande demais: 400/413 em JSON, sem detalhes.
  r.use(
    '/cliente/sair',
    (err: any, _req: Request, res: Response, next: NextFunction) => {
      if (err?.type === 'entity.parse.failed') {
        return res
          .status(400)
          .json({ code: 'INVALID_BODY', message: 'Corpo inválido' });
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

import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import { NextFunction, Request, Response, Router, json } from 'express';
import { AccessService, requestContext } from '../access/access.service';
import { HUB_PROXY_KEY, chaveDoProxy } from '../common/client-ip';
import { CLIENTE_HUB } from './oidc-hub';
import { OidcLogoutService } from './oidc-logout.service';

/** id_token mais antigo que isto (pelo iat) não serve para sair. */
export const SAIR_IAT_MAX_S = 7 * 24 * 60 * 60;

export interface SairDeps {
  provider: any;
  prisma: PrismaClient;
  logout: OidcLogoutService;
  access: AccessService;
  /** HUB_PROXY_KEY (≥ 32); sem ela, a rota fica fechada (401). */
  chave?: string | null;
}

function mesmoTexto(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * POST /hub/sair: o "Sair" do portal, servidor → servidor (o BFF do HUB chama
 * direto na origem do Render, como o /hub/admin). Encerra a sessão SSO sem
 * a página intermediária do end_session.
 * - x-hub-proxy-key obrigatório (ausente ou errado → 401 sem detalhes);
 * - corpo JSON { id_token, refresh_token? }; o id_token é conferido pelas
 *   chaves do PRÓPRIO provedor: RS256, iss, aud = 'hub', sid obrigatório; exp
 *   vencido vale (como no id_token_hint), mas o iat tem de ser de no máximo
 *   7 dias atrás;
 * - acha a sessão SSO desse sid (authorizations.hub.sid) e dessa pessoa;
 *   revoga os grants de TODOS os clientes dela, enfileira os avisos de
 *   back-channel e apaga a sessão. Com refresh_token do hub e da mesma
 *   pessoa, revoga também o grant dele;
 * - sempre 204 (idempotente: sessão inexistente responde igual). Nada de
 *   token em log nem na auditoria.
 */
export function rotaDeSair(d: SairDeps): Router {
  const logger = new Logger('OIDC');
  const r = Router();
  const chave = d.chave === undefined ? chaveDoProxy() : d.chave;
  const negar = (res: Response) =>
    res.status(401).json({ message: 'Não autorizado' });

  r.post(
    '/hub/sair',
    // A chave do proxy vem ANTES de ler o corpo: sem ela, 401 e nada mais.
    (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Cache-Control', 'no-store');
      const enviada = req.headers[HUB_PROXY_KEY];
      if (
        !chave ||
        typeof enviada !== 'string' ||
        !mesmoTexto(enviada, chave)
      ) {
        return negar(res);
      }
      next();
    },
    json({ limit: '16kb' }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const b = req.body;
        if (
          !b ||
          typeof b !== 'object' ||
          Array.isArray(b) ||
          Object.keys(b).some(
            (k) => k !== 'id_token' && k !== 'refresh_token',
          ) ||
          typeof b.id_token !== 'string' ||
          (b.refresh_token !== undefined && typeof b.refresh_token !== 'string')
        ) {
          return res
            .status(400)
            .json({ code: 'INVALID_BODY', message: 'Corpo inválido' });
        }

        // id_token: assinatura e iss pelas chaves do provedor, aud = hub.
        const hub = await d.provider.Client.find(CLIENTE_HUB);
        if (!hub) return negar(res);
        let payload: Record<string, any>;
        try {
          ({ payload } = await d.provider.IdToken.validate(b.id_token, hub));
        } catch {
          return negar(res);
        }
        const agora = Math.floor(Date.now() / 1000);
        const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (
          !aud.includes(CLIENTE_HUB) ||
          typeof payload.sid !== 'string' ||
          !payload.sid ||
          typeof payload.sub !== 'string' ||
          typeof payload.iat !== 'number' ||
          agora - payload.iat > SAIR_IAT_MAX_S ||
          payload.iat - agora > 60
        ) {
          return negar(res);
        }
        const sub: string = payload.sub;

        // A sessão SSO desse sid (o sid é por cliente: authorizations.hub.sid).
        const linhas = await d.prisma.$queryRaw<{ uid: string | null }[]>`
          SELECT uid FROM "OidcPayload"
           WHERE type = 'Session' AND "accountId" = ${sub}
             AND payload -> 'authorizations' -> 'hub' ->> 'sid' = ${payload.sid}`;
        let encerrou = false;
        for (const { uid } of linhas) {
          const s = uid ? await d.provider.Session.findByUid(uid) : null;
          if (!s || s.accountId !== sub) continue;
          await d.logout.aposLogoutCompleto(s);
          await s.destroy();
          encerrou = true;
        }

        // Refresh do hub, da MESMA pessoa: o grant dele cai também.
        let refreshRevogado = false;
        if (b.refresh_token) {
          const rt = await d.provider.RefreshToken.find(b.refresh_token).catch(
            () => null,
          );
          if (
            rt &&
            rt.clientId === CLIENTE_HUB &&
            rt.accountId === sub &&
            rt.grantId
          ) {
            await d.prisma.oidcPayload.deleteMany({
              where: {
                OR: [
                  { grantId: rt.grantId },
                  { type: 'Grant', id: rt.grantId },
                ],
              },
            });
            refreshRevogado = true;
          }
        }

        if (encerrou || refreshRevogado) {
          const u = await d.prisma.user.findUnique({
            where: { publicId: sub },
            select: { id: true },
          });
          await d.access.audit({
            action: 'oidc.logout',
            actorUserId: u?.id,
            targetUserId: u?.id,
            metadata: {
              clientId: CLIENTE_HUB,
              via: 'hub/sair',
              sessao: encerrou,
              refresh: refreshRevogado,
            },
            ctx: requestContext(req),
          });
        }
        return res.status(204).end();
      } catch (e) {
        logger.warn(
          `oidc: falha no /hub/sair (${(e as Error)?.name ?? 'erro'})`,
        );
        next(e);
      }
    },
  );

  // Corpo JSON quebrado ou grande demais: 400/413 em JSON, sem detalhes.
  r.use(
    '/hub/sair',
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

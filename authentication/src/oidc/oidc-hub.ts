import { HttpException, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaClient, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { NextFunction, Request, Response, Router, urlencoded } from 'express';
import { requestContext } from '../access/access.service';
import { LauncherService } from '../access/launcher.service';
import { AuthService } from '../auth/auth.service';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  looksLikeBcryptHash,
} from '../common/password';
import { paginaAviso, paginaSenha } from './oidc-pages';

/** O cliente do portal (o único que usa estas rotas). */
export const CLIENTE_HUB = 'hub';

export interface HubDeps {
  provider: any;
  prisma: PrismaClient;
  launcher: LauncherService;
  auth: AuthService;
  jwtSecret: string;
  /** Caminho público do issuer (ex.: /auth/oidc). */
  caminho: string;
}

/** Chave própria do CSRF da tela de senha (derivada; não reusa a do JWT). */
const chaveCsrf = (segredo: string) =>
  Buffer.from(
    crypto.hkdfSync('sha256', segredo, 'lhg', 'oidc-conta-senha', 32),
  );

/** Token CSRF preso à sessão SSO (HMAC do id da sessão). */
export function csrfDaSessao(segredo: string, sessaoId: string): string {
  return crypto
    .createHmac('sha256', chaveCsrf(segredo))
    .update(sessaoId)
    .digest('base64url');
}

function mesmoTexto(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Rotas do login central para o portal (cliente 'hub'), montadas em /oidc
 * antes do provedor:
 * - GET /hub/systems: a lista do launcher, autenticada por Bearer (access
 *   token do login central emitido para o 'hub'), validado no PRÓPRIO
 *   provedor;
 * - GET/POST /conta/senha: troca de senha na sessão SSO (a senha nunca passa
 *   pelo HUB), com as regras da 1c.
 */
export function rotasDoHub(d: HubDeps): Router {
  const logger = new Logger('OIDC');
  const r = Router();
  const corpo = urlencoded({ extended: false, limit: '8kb' });
  const seguro =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch(next);

  r.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const negar = (res: Response) =>
    res
      .status(401)
      .setHeader('WWW-Authenticate', 'Bearer error="invalid_token"')
      .json({ message: 'Não autorizado' });

  /** (A) Lista de sistemas para o HUB. */
  r.get(
    '/hub/systems',
    seguro(async (req, res) => {
      const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{10,})$/.exec(
        String(req.headers.authorization ?? ''),
      );
      if (!m) return negar(res);
      // AccessToken.find confere a assinatura do registro e o vencimento.
      const at = await d.provider.AccessToken.find(m[1]);
      if (
        !at ||
        at.clientId !== CLIENTE_HUB ||
        !String(at.scope ?? '')
          .split(' ')
          .includes('openid')
      ) {
        return negar(res);
      }
      const u = await d.prisma.user.findUnique({
        where: { publicId: at.accountId },
        select: { id: true, status: true },
      });
      if (!u || u.status !== UserStatus.ACTIVE) return negar(res);
      try {
        // As MESMAS regras do GET /api/me/systems (flags e catálogo ativos,
        // URL segura).
        return res.json(await d.launcher.listFor(u.id));
      } catch (e) {
        if (e instanceof UnauthorizedException) return negar(res);
        throw e;
      }
    }),
  );

  /** URIs cadastradas do 'hub' (redirect e pós-logout): só elas valem de volta. */
  async function voltaValida(raw: unknown): Promise<string | null> {
    if (typeof raw !== 'string' || !raw) return null;
    const c = await d.prisma.oidcClient.findUnique({
      where: { clientId: CLIENTE_HUB },
      select: {
        active: true,
        redirectUris: true,
        postLogoutRedirectUris: true,
      },
    });
    if (!c?.active) return null;
    return [...c.redirectUris, ...c.postLogoutRedirectUris].includes(raw)
      ? raw
      : null;
  }

  const com = (url: string, k: string, v: string) =>
    `${url}${url.includes('?') ? '&' : '?'}${k}=${encodeURIComponent(v)}`;

  /** Sessão SSO deste navegador (cookie hub_sso assinado), ou null. */
  async function sessaoSso(req: Request, res: Response) {
    const ctx = d.provider.createContext(req, res);
    const s = await d.provider.Session.get(ctx);
    return s?.accountId ? s : null;
  }

  /** Sem sessão: volta ao HUB pedindo o login (ele entra e retorna aqui). */
  function semSessao(res: Response, returnTo: string | null) {
    if (returnTo)
      return res.redirect(303, com(returnTo, 'conta_senha', 'entrar'));
    return res
      .status(401)
      .type('html')
      .send(
        paginaAviso(
          'É preciso entrar',
          'Entre pelo HUB e abra "Trocar senha" de novo.',
        ),
      );
  }

  const acao = `${d.caminho}/conta/senha`;

  r.get(
    '/conta/senha',
    seguro(async (req, res) => {
      const returnTo = await voltaValida(req.query.return_to);
      const s = await sessaoSso(req, res);
      if (!s) return semSessao(res, returnTo);
      res.type('html').send(
        paginaSenha({
          acao,
          csrf: csrfDaSessao(d.jwtSecret, s.jti),
          returnTo,
        }),
      );
    }),
  );

  r.post(
    '/conta/senha',
    corpo,
    seguro(async (req, res) => {
      const b = req.body ?? {};
      const returnTo = await voltaValida(b.return_to);
      const s = await sessaoSso(req, res);
      if (!s) return semSessao(res, returnTo);
      const csrf = csrfDaSessao(d.jwtSecret, s.jti);
      if (typeof b.csrf !== 'string' || !mesmoTexto(b.csrf, csrf)) {
        return res
          .status(403)
          .type('html')
          .send(
            paginaAviso(
              'Não foi possível continuar',
              'Recarregue a página e tente de novo.',
            ),
          );
      }
      const tela = (status: number, erro: string) =>
        res
          .status(status)
          .type('html')
          .send(paginaSenha({ acao, csrf, returnTo, erro }));

      const { senha_atual: atual, senha_nova: nova, confirmacao } = b;
      if (typeof atual !== 'string' || typeof nova !== 'string' || !atual) {
        return tela(400, 'Preencha a senha atual e a nova.');
      }
      if (nova !== confirmacao) return tela(400, 'A confirmação não confere.');
      if (nova.length < PASSWORD_MIN_LENGTH) {
        return tela(
          400,
          `A nova senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
        );
      }
      if (Buffer.byteLength(nova, 'utf8') > PASSWORD_MAX_BYTES) {
        return tela(400, 'A nova senha é longa demais (limite de 72 bytes).');
      }
      if (looksLikeBcryptHash(nova)) {
        return tela(400, 'A nova senha não pode ter o formato de um hash.');
      }
      if (Buffer.byteLength(atual, 'utf8') > PASSWORD_MAX_BYTES) {
        return tela(401, 'Senha atual incorreta');
      }

      const u = await d.prisma.user.findUnique({
        where: { publicId: s.accountId },
        select: { id: true },
      });
      if (!u) return semSessao(res, returnTo);
      try {
        // Regras da 1c: senha atual (o erro conta no MESMO bloqueio), nova
        // diferente da atual, custo 12, auditoria password.changed. As OUTRAS
        // sessões SSO caem (com back-channel); ESTA continua.
        await d.auth.changePassword(
          u.id,
          atual,
          nova,
          undefined,
          requestContext(req),
          s.jti,
        );
      } catch (e) {
        if (e instanceof HttpException) {
          const corpoErro = e.getResponse() as { message?: string } | string;
          const msg =
            typeof corpoErro === 'string' ? corpoErro : corpoErro?.message;
          return tela(
            e.getStatus(),
            String(msg ?? 'Não foi possível trocar a senha.'),
          );
        }
        logger.warn(
          `oidc: falha na troca de senha (${(e as Error)?.name ?? 'erro'})`,
        );
        throw e;
      }
      if (returnTo)
        return res.redirect(303, com(returnTo, 'senha', 'alterada'));
      return res
        .type('html')
        .send(
          paginaAviso(
            'Senha alterada',
            'Pronto. As suas outras sessões foram encerradas.',
          ),
        );
    }),
  );

  return r;
}

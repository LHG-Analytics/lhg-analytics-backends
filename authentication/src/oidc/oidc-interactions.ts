import { Logger, UnauthorizedException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { NextFunction, Request, Response, Router, urlencoded } from 'express';
import { AccessService, requestContext } from '../access/access.service';
import { AuthService } from '../auth/auth.service';
import { PASSWORD_MAX_BYTES } from '../common/password';
import { GoogleSettings } from '../google/google.config';
import { GoogleIdentityProvider } from '../google/google-identity.provider';
import {
  GoogleLoginService,
  GoogleRefusal,
} from '../google/google-login.service';
import {
  OAUTH_TTL_MS,
  pkceChallenge,
  randomToken,
  sameString,
  signState,
  verifyState,
} from '../google/oauth-state';
import {
  mensagemDeErro,
  paginaLogin,
  paginaSessaoInvalida,
} from './oidc-pages';

/** Cookie do estado do Google DENTRO do login central (separado do da 1c). */
export const OIDC_GOOGLE_COOKIE = 'hub_g_oauth';

export interface InteracoesDeps {
  provider: any;
  auth: AuthService;
  access: AccessService;
  googleProvider: GoogleIdentityProvider;
  googleLogin: GoogleLoginService;
  /** Configuração do Google do login central, ou null (desligado). */
  google: GoogleSettings | null;
  jwtSecret: string;
  /** Caminho público do issuer (ex.: /auth/oidc). */
  caminho: string;
  /** Tela mínima de homologação ligada? */
  paginaMinima: boolean;
  /** Para onde mandar a pessoa para a tela de login (com o uid e o erro). */
  urlDaInteracao: (uid: string, erro?: string) => string;
}

/**
 * Rotas das interações do login central, montadas em /oidc ANTES do
 * provedor. O corpo do formulário é lido aqui (urlencoded, pequeno); as
 * rotas do provedor (token etc.) continuam recebendo o corpo cru.
 */
export function interacoes(d: InteracoesDeps): Router {
  const logger = new Logger('OIDC');
  const r = Router();
  const corpo = urlencoded({ extended: false, limit: '8kb' });
  // Express 4: erro de rota async vai para o next (senão a promessa fica solta).
  const seguro =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch(next);

  r.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  /** A interação do cookie, e só se for a do uid da URL. */
  async function interacao(req: Request, res: Response, uid: string) {
    try {
      const i = await d.provider.interactionDetails(req, res);
      return i?.uid === uid && i.prompt?.name === 'login' ? i : null;
    } catch {
      return null;
    }
  }

  const invalida = (res: Response) =>
    res.status(400).type('html').send(paginaSessaoInvalida());

  const voltar = (res: Response, uid: string, erro?: string) =>
    res.redirect(303, d.urlDaInteracao(uid, erro));

  const auditarLogin = (userId: number, metodo: string, i: any, req: Request) =>
    d.access.audit({
      action: 'oidc.login',
      actorUserId: userId,
      targetUserId: userId,
      metadata: { method: metodo, clientId: i.params?.client_id ?? null },
      ctx: requestContext(req),
    });

  r.get(
    '/interaction/:uid',
    seguro(async (req, res) => {
      if (!d.paginaMinima)
        return res.status(404).json({ message: 'Not Found' });
      const i = await interacao(req, res, req.params.uid);
      if (!i) return invalida(res);
      const erro = typeof req.query.erro === 'string' ? req.query.erro : '';
      res.type('html').send(
        paginaLogin({
          acao: `${d.caminho}/interaction/${i.uid}`,
          erro: mensagemDeErro(erro || undefined),
          google: !!d.google,
        }),
      );
    }),
  );

  r.post(
    '/interaction/:uid/login',
    corpo,
    seguro(async (req, res) => {
      const i = await interacao(req, res, req.params.uid);
      if (!i) return invalida(res);
      const { email, password } = req.body ?? {};
      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email ||
        !password ||
        Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES
      ) {
        return voltar(res, i.uid, 'credenciais');
      }
      const ctx = requestContext(req);
      let user;
      try {
        // Mesmas regras da 1c: senha única, bloqueio por conta, mensagem genérica.
        user = await d.auth.checkPassword(email, password, ctx);
      } catch (e) {
        if (e instanceof UnauthorizedException) {
          return voltar(res, i.uid, 'credenciais');
        }
        throw e;
      }
      if (user.status !== UserStatus.ACTIVE) {
        await d.access.audit({
          action: 'oidc.denied.inactive',
          targetUserId: user.id,
          metadata: { clientId: i.params?.client_id ?? null, etapa: 'login' },
          ctx,
        });
        return d.provider.interactionFinished(req, res, {
          error: 'access_denied',
          error_description: 'acesso não permitido',
        });
      }
      await auditarLogin(user.id, 'password', i, req);
      return d.provider.interactionFinished(
        req,
        res,
        { login: { accountId: user.publicId, amr: ['pwd'] } },
        { mergeWithLastSubmission: false },
      );
    }),
  );

  r.post(
    '/interaction/:uid/abort',
    seguro(async (req, res) => {
      const i = await interacao(req, res, req.params.uid);
      if (!i) return invalida(res);
      return d.provider.interactionFinished(req, res, {
        error: 'access_denied',
        error_description: 'login cancelado',
      });
    }),
  );

  r.post(
    '/interaction/:uid/google',
    seguro(async (req, res) => {
      const i = await interacao(req, res, req.params.uid);
      if (!i) return invalida(res);
      if (!d.google) return voltar(res, i.uid, 'google_off');
      const st = {
        state: randomToken(),
        nonce: randomToken(),
        verifier: randomToken(),
        uid: i.uid,
        exp: Date.now() + OAUTH_TTL_MS,
      };
      res.cookie(OIDC_GOOGLE_COOKIE, signState(st, d.jwtSecret), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: `${d.caminho}/google`,
        maxAge: OAUTH_TTL_MS,
      });
      return res.redirect(
        303,
        d.googleProvider.authorizationUrl(d.google, {
          state: st.state,
          nonce: st.nonce,
          codeChallenge: pkceChallenge(st.verifier),
        }),
      );
    }),
  );

  r.get(
    '/google/callback',
    seguro(async (req, res) => {
      res.clearCookie(OIDC_GOOGLE_COOKIE, { path: `${d.caminho}/google` });
      const st = verifyState(req.cookies?.[OIDC_GOOGLE_COOKIE], d.jwtSecret);
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!d.google || !st?.uid || !sameString(st.state, state)) {
        return invalida(res);
      }
      // A interação do cookie TEM de ser a do estado assinado (uid forjado → recusa).
      const i = await interacao(req, res, st.uid);
      if (!i) return invalida(res);
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (req.query.error || !code) return voltar(res, i.uid, 'cancelled');

      const ctx = requestContext(req);
      try {
        const claims = await d.googleProvider.exchangeCode(
          d.google,
          code,
          st.verifier,
        );
        if (!sameString(claims.nonce, st.nonce)) {
          return voltar(res, i.uid, 'google');
        }
        // Regras da 1c: sem convite, hd, nunca duplicar, inativo não reativa.
        const user = await d.googleLogin.resolve(
          claims,
          d.google,
          undefined,
          ctx,
        );
        await auditarLogin(user.id, 'google', i, req);
        return d.provider.interactionFinished(
          req,
          res,
          { login: { accountId: user.publicId, amr: ['google'] } },
          { mergeWithLastSubmission: false },
        );
      } catch (error) {
        if (error instanceof GoogleRefusal) {
          return voltar(res, i.uid, error.code);
        }
        // Sem detalhes do Google no log (podem ecoar o code).
        logger.warn(
          `Falha no callback do Google (login central): ${(error as Error)?.name ?? 'erro'}`,
        );
        return voltar(res, i.uid, 'google');
      }
    }),
  );

  return r;
}

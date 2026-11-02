import { HttpException, Logger } from '@nestjs/common';
import { NextFunction, Request, Response, Router, urlencoded } from 'express';
import { requestContext } from '../access/access.service';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  looksLikeBcryptHash,
} from '../common/password';
import { InvitationsService } from '../invitations/invitations.service';
import {
  ABRIR_CONVITE,
  cspComScript,
  paginaAviso,
  paginaConvite,
  paginaConviteAbrindo,
  paginaConviteInvalido,
} from './oidc-pages';

export interface ConviteDeps {
  invitations: InvitationsService;
  /** Caminho público do issuer (ex.: /auth/oidc). */
  caminho: string;
  /** Tela de entrada do HUB (ex.: https://hub.lhgmoteis.com.br/entrar), ou null. */
  entrar: string | null;
}

/** Token do convite: 32 bytes em base64url (43 caracteres). */
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

/**
 * Página de aceite do convite no login central (o link do convite é
 * INVITE_LINK_BASE_URL#<token>, por exemplo …/auth/oidc/convite#<token>):
 * - GET /convite: só uma página que lê o token do FRAGMENTO, apaga o
 *   fragmento da barra e o envia por POST (o token nunca vai em query string
 *   nem em log; o script é liberado pelo hash no CSP desta resposta);
 * - POST /convite: confere o convite (o mesmo serviço do check) e mostra
 *   nome, e-mail mascarado, sistemas e validade, com "Definir senha" e
 *   "Entrar com Google" (o login central acha o convite pelo e-mail);
 * - POST /convite/senha: aceite por senha com as regras da 1c (mínimo, 72
 *   bytes, nada com cara de hash), pelo mesmo serviço da API; deu certo →
 *   303 para a entrada do HUB.
 * Sem cache e sem referrer (o /oidc já manda Referrer-Policy no-referrer).
 */
export function rotasDoConvite(d: ConviteDeps): Router {
  const logger = new Logger('OIDC');
  const r = Router();
  const corpo = urlencoded({ extended: false, limit: '8kb' });
  const acao = `${d.caminho}/convite`;
  const acaoSenha = `${d.caminho}/convite/senha`;

  r.use('/convite', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  const seguro =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch((e) => {
        logger.warn(
          `oidc: falha na página do convite (${(e as Error)?.name ?? 'erro'})`,
        );
        next(e);
      });

  const invalido = (res: Response) =>
    res.status(400).type('html').send(paginaConviteInvalido(d.entrar));

  /** O convite pelo token; inválido (ou token com formato errado) → null. */
  async function resumo(token: unknown) {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    try {
      return await d.invitations.resumoPorToken(token);
    } catch (e) {
      if (e instanceof HttpException) return null;
      throw e;
    }
  }

  r.get('/convite', (_req: Request, res: Response) => {
    const csp = cspComScript(
      res.getHeader('Content-Security-Policy') as string | undefined,
      ABRIR_CONVITE,
    );
    if (csp) res.setHeader('Content-Security-Policy', csp);
    res.type('html').send(paginaConviteAbrindo(acao));
  });

  const tela = (
    res: Response,
    status: number,
    token: string,
    c: NonNullable<Awaited<ReturnType<typeof resumo>>>,
    erro?: string,
  ) =>
    res
      .status(status)
      .type('html')
      .send(
        paginaConvite({
          acaoSenha,
          token,
          nome: c.nome,
          emailMasked: c.emailMasked,
          sistemas: c.sistemas,
          expiresAt: c.expiresAt,
          entrar: d.entrar,
          erro,
          minimo: PASSWORD_MIN_LENGTH,
        }),
      );

  r.post(
    '/convite',
    corpo,
    seguro(async (req, res) => {
      const token = req.body?.token;
      const c = await resumo(token);
      if (!c) return invalido(res);
      return tela(res, 200, token, c);
    }),
  );

  r.post(
    '/convite/senha',
    corpo,
    seguro(async (req, res) => {
      const { token, senha, confirmacao } = req.body ?? {};
      const c = await resumo(token);
      if (!c) return invalido(res);
      const erro = (msg: string) => tela(res, 400, token, c, msg);
      if (typeof senha !== 'string' || !senha) {
        return erro('Escolha uma senha.');
      }
      if (senha !== confirmacao) return erro('A confirmação não confere.');
      if (senha.length < PASSWORD_MIN_LENGTH) {
        return erro(
          `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
        );
      }
      if (Buffer.byteLength(senha, 'utf8') > PASSWORD_MAX_BYTES) {
        return erro('A senha é longa demais (limite de 72 bytes).');
      }
      if (looksLikeBcryptHash(senha)) {
        return erro('A senha não pode ter o formato de um hash.');
      }
      try {
        await d.invitations.acceptByPassword(token, senha, {
          ctx: requestContext(req),
        });
      } catch (e) {
        if (e instanceof HttpException) {
          const r2 = e.getResponse() as { code?: string; message?: unknown };
          // Convite que deixou de valer no meio do caminho, ou e-mail que
          // ganhou dono: a mesma página de convite inválido.
          if (r2?.code === 'INVITE_INVALID' || r2?.code === 'EMAIL_IN_USE') {
            return invalido(res);
          }
          return erro(
            typeof r2?.message === 'string'
              ? r2.message
              : 'Não foi possível criar a conta.',
          );
        }
        throw e;
      }
      if (d.entrar) return res.redirect(303, d.entrar);
      return res
        .status(200)
        .type('html')
        .send(
          paginaAviso(
            'Conta criada',
            'Pronto. Entre no HUB LHG com o seu e-mail e a senha escolhida.',
          ),
        );
    }),
  );

  return r;
}

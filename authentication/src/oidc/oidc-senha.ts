import { Logger } from '@nestjs/common';
import { PrismaClient, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { NextFunction, Request, Response, Router, urlencoded } from 'express';
import {
  AccessService,
  RequestContext,
  requestContext,
} from '../access/access.service';
import { normalizeEmail } from '../common/email';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  looksLikeBcryptHash,
} from '../common/password';
import { EmailService } from '../email/email.service';
import { emailDeRedefinicao } from '../email/senha-email';
import { hashToken, maskEmail } from '../invitations/invitations.service';
import { OidcLogoutService } from './oidc-logout.service';
import {
  ABRIR_SENHA,
  cspComScript,
  paginaAviso,
  paginaNovaSenha,
  paginaSenhaAbrindo,
  paginaSenhaInvalida,
} from './oidc-pages';

/** Validade do link de redefinição. */
export const REDEFINICAO_MIN = 30;
/** Pedidos por hora (janela deslizante): por e-mail e por IP real. */
export const LIMITE_POR_EMAIL_H = 5;
export const LIMITE_POR_IP_H = 20;
const HORA_MS = 60 * 60 * 1000;
/** Token do link: 32 bytes em base64url (43 caracteres). */
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export type ResultadoPedido = 'enviado' | 'falha' | 'ignorado' | 'limite';

/** Contagem por janela deslizante de 1 h, em memória (1 processo). */
export class LimitePorHora {
  private m = new Map<string, number[]>();
  constructor(private readonly agora: () => number = Date.now) {}

  /** Conta este pedido; false se já passou do limite na última hora. */
  permitir(chave: string, limite: number): boolean {
    const t = this.agora();
    if (this.m.size > 10_000) this.m.clear(); // trava de memória
    const usos = (this.m.get(chave) ?? []).filter((x) => x > t - HORA_MS);
    if (usos.length >= limite) {
      this.m.set(chave, usos);
      return false;
    }
    usos.push(t);
    this.m.set(chave, usos);
    return true;
  }
}

export interface SenhaDeps {
  prisma: PrismaClient;
  access: AccessService;
  logout: OidcLogoutService | null;
  email: EmailService;
  /** URL pública do issuer (o link é {issuer}/senha/nova#token). */
  issuer: string;
  agora?: () => number;
}

/**
 * "Esqueci a senha" do login central (etapa 1e, contrato com o HUB):
 * - pedir: SÓ conta ATIVA (inclusive a que só tem Google: vira "definir
 *   senha"), pelo e-mail principal ou um secundário verificado; limite de
 *   5/h por e-mail e 20/h por IP; token de 32 bytes, só o hash no banco, 30
 *   min; um pedido novo apaga os anteriores. Nada é revelado a quem pediu.
 * - redefinir: link de uso único (marcado na mesma transação); grava a senha,
 *   zera o bloqueio, confirma o e-mail principal se foi para ele que o link
 *   foi, apaga os refresh tokens e os outros links, e derruba TODAS as
 *   sessões SSO e os grants (clientes avisados).
 */
export class SenhaService {
  private readonly logger = new Logger('OIDC');
  private readonly limite: LimitePorHora;
  private readonly agora: () => number;
  /** O último pedido em segundo plano (para os testes esperarem). */
  emAndamento: Promise<unknown> = Promise.resolve();

  constructor(private readonly d: SenhaDeps) {
    this.agora = d.agora ?? Date.now;
    this.limite = new LimitePorHora(this.agora);
  }

  /** A pessoa pelo e-mail de login: principal ou secundário VERIFICADO. */
  private async pessoaDoEmail(email: string) {
    const u = await this.d.prisma.user.findUnique({ where: { email } });
    if (u) return u;
    const sec = await this.d.prisma.userEmail.findUnique({
      where: { email },
      include: { user: true },
    });
    return sec?.verifiedAt ? sec.user : null;
  }

  async pedir(bruto: unknown, ctx: RequestContext): Promise<ResultadoPedido> {
    const email = typeof bruto === 'string' ? normalizeEmail(bruto) : '';
    if (email.length > 254 || !EMAIL.test(email)) return 'ignorado';
    if (
      !this.limite.permitir(`ip:${ctx.ip ?? 'sem-ip'}`, LIMITE_POR_IP_H) ||
      !this.limite.permitir(`email:${email}`, LIMITE_POR_EMAIL_H)
    ) {
      this.logger.warn('oidc: esqueci a senha acima do limite (ignorado)');
      return 'limite';
    }
    const u = await this.pessoaDoEmail(email);
    if (!u || u.status !== UserStatus.ACTIVE) return 'ignorado';

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.agora() + REDEFINICAO_MIN * 60 * 1000);
    await this.d.prisma.$transaction([
      this.d.prisma.passwordReset.deleteMany({ where: { userId: u.id } }),
      this.d.prisma.passwordReset.create({
        data: { userId: u.id, email, tokenHash: hashToken(token), expiresAt },
      }),
    ]);
    const r = await this.d.email.enviar(
      emailDeRedefinicao({
        para: email,
        nome: u.name,
        link: `${this.d.issuer.replace(/\/$/, '')}/senha/nova#${token}`,
        minutos: REDEFINICAO_MIN,
      }),
    );
    await this.d.access.audit({
      action: 'password.reset_requested',
      targetUserId: u.id,
      metadata: {
        via: 'email',
        ...(!r.enviado && { reason: r.erro }),
      },
      ctx,
    });
    return r.enviado ? 'enviado' : 'falha';
  }

  /** O link ainda vale? (não consome). Devolve o e-mail mascarado. */
  async conferir(token: unknown): Promise<{ emailMasked: string } | null> {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    const pr = await this.d.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { status: true } } },
    });
    if (
      !pr ||
      pr.usedAt ||
      pr.expiresAt.getTime() <= this.agora() ||
      pr.user.status !== UserStatus.ACTIVE
    ) {
      return null;
    }
    return { emailMasked: maskEmail(pr.email) };
  }

  /** Usa o link (uma vez só). false = link inválido, vencido ou usado. */
  async redefinir(
    token: string,
    senha: string,
    ctx: RequestContext,
  ): Promise<boolean> {
    if (!TOKEN.test(token)) return false;
    const hash = await hashPassword(senha);
    const agora = new Date(this.agora());
    const publicId = await this.d.prisma.$transaction(async (tx) => {
      const pr = await tx.passwordReset.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (
        !pr ||
        pr.usedAt ||
        pr.expiresAt <= agora ||
        pr.user.status !== UserStatus.ACTIVE
      ) {
        return null;
      }
      // Uso único mesmo com dois envios ao mesmo tempo.
      const marcado = await tx.passwordReset.updateMany({
        where: { id: pr.id, usedAt: null },
        data: { usedAt: agora },
      });
      if (marcado.count !== 1) return null;
      await tx.user.update({
        where: { id: pr.userId },
        data: {
          password: hash,
          failedLoginCount: 0,
          failedLoginFirstAt: null,
          lockedUntil: null,
          lockLevel: 0,
          // O link chegou ao e-mail principal: prova a posse dele.
          ...(!pr.user.emailVerifiedAt &&
            pr.email === pr.user.email && { emailVerifiedAt: agora }),
        },
      });
      await tx.refreshToken.deleteMany({ where: { userId: pr.userId } });
      await tx.passwordReset.deleteMany({
        where: { userId: pr.userId, id: { not: pr.id } },
      });
      await this.d.access.audit(
        {
          action: 'password.reset',
          actorUserId: pr.userId,
          targetUserId: pr.userId,
          metadata: { via: 'email' },
          ctx,
        },
        tx,
      );
      return pr.user.publicId;
    });
    if (!publicId) return false;
    // Todas as sessões SSO e os grants caem (nenhuma é mantida).
    await this.d.logout?.encerrarSemFalhar(publicId, 'password_change');
    return true;
  }
}

export interface RotasDaSenhaDeps {
  servico: SenhaService;
  /** Caminho público do issuer (ex.: /auth/oidc). */
  caminho: string;
  /** Origem do HUB (ex.: https://hub.lhgmoteis.com.br), ou null. */
  hub: string | null;
}

/**
 * - POST /senha/esqueci (form {email}): SEMPRE 303 para {HUB}/esqueci?enviado=1,
 *   NA HORA; a busca, o token e o envio rodam depois da resposta (o tempo não
 *   revela se a conta existe).
 * - GET /senha/nova: página que lê o token do FRAGMENTO e o envia por POST
 *   (nunca em query string nem em log; script liberado pelo hash no CSP).
 * - POST /senha/nova: só {token} → formulário; {token, senha, confirmacao} →
 *   regras da 1c (mínimo, 72 bytes, nada com cara de hash) e redefinição;
 *   deu certo → 303 para {HUB}/entrar.
 */
export function rotasDaSenha(d: RotasDaSenhaDeps): Router {
  const logger = new Logger('OIDC');
  const r = Router();
  const corpo = urlencoded({ extended: false, limit: '8kb' });
  const acao = `${d.caminho}/senha/nova`;
  const esqueci = d.hub ? `${d.hub}/esqueci` : null;

  r.use('/senha', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  const seguro =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch((e) => {
        logger.warn(
          `oidc: falha na redefinição de senha (${(e as Error)?.name ?? 'erro'})`,
        );
        next(e);
      });

  r.post('/senha/esqueci', corpo, (req: Request, res: Response) => {
    const ctx = requestContext(req);
    const email: unknown = req.body?.email;
    if (esqueci) res.redirect(303, `${esqueci}?enviado=1`);
    else {
      res
        .status(200)
        .type('html')
        .send(
          paginaAviso(
            'Verifique o seu e-mail',
            'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha.',
          ),
        );
    }
    d.servico.emAndamento = new Promise<void>((ok) =>
      setImmediate(() =>
        d.servico
          .pedir(email, ctx)
          .catch((e) =>
            logger.warn(
              `oidc: falha no pedido de nova senha (${(e as Error)?.name ?? 'erro'})`,
            ),
          )
          .finally(() => ok()),
      ),
    );
  });

  r.get('/senha/nova', (_req: Request, res: Response) => {
    const csp = cspComScript(
      res.getHeader('Content-Security-Policy') as string | undefined,
      ABRIR_SENHA,
    );
    if (csp) res.setHeader('Content-Security-Policy', csp);
    res.type('html').send(paginaSenhaAbrindo(acao));
  });

  const invalido = (res: Response) =>
    res.status(400).type('html').send(paginaSenhaInvalida(esqueci));

  r.post(
    '/senha/nova',
    corpo,
    seguro(async (req, res) => {
      const { token, senha, confirmacao } = req.body ?? {};
      const c = await d.servico.conferir(token);
      if (!c) return invalido(res);
      const tela = (status: number, erro?: string) =>
        res
          .status(status)
          .type('html')
          .send(
            paginaNovaSenha({
              acao,
              token,
              emailMasked: c.emailMasked,
              erro,
              minimo: PASSWORD_MIN_LENGTH,
            }),
          );
      if (senha === undefined) return tela(200);
      if (typeof senha !== 'string' || !senha) {
        return tela(400, 'Escolha uma senha.');
      }
      if (senha !== confirmacao) {
        return tela(400, 'A confirmação não confere.');
      }
      if (senha.length < PASSWORD_MIN_LENGTH) {
        return tela(
          400,
          `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
        );
      }
      if (Buffer.byteLength(senha, 'utf8') > PASSWORD_MAX_BYTES) {
        return tela(400, 'A senha é longa demais (limite de 72 bytes).');
      }
      if (looksLikeBcryptHash(senha)) {
        return tela(400, 'A senha não pode ter o formato de um hash.');
      }
      if (!(await d.servico.redefinir(token, senha, requestContext(req)))) {
        return invalido(res);
      }
      if (d.hub) return res.redirect(303, `${d.hub}/entrar`);
      return res
        .status(200)
        .type('html')
        .send(
          paginaAviso(
            'Senha alterada',
            'Pronto. Entre no HUB LHG com o seu e-mail e a senha nova.',
          ),
        );
    }),
  );

  return r;
}

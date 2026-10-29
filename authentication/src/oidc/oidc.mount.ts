import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { AccessService } from '../access/access.service';
import { safeLaunchUrl } from '../access/launcher.service';
import { AuthService } from '../auth/auth.service';
import { GoogleSettings, readGoogleSettings } from '../google/google.config';
import { GoogleIdentityProvider } from '../google/google-identity.provider';
import { GoogleLoginService } from '../google/google-login.service';
import { PrismaService } from '../prisma/prisma.service';
import { OidcAccounts } from './oidc-accounts';
import { loadClients } from './oidc-clients';
import { readOidcSettings, OidcSettings } from './oidc.config';
import { interacoes } from './oidc-interactions';
import { loadOidcModule } from './oidc-loader';
import {
  cspDoOidc,
  logoutSource,
  postLogoutSuccessSource,
  renderError,
} from './oidc-pages';
import { limparVencidos, prismaAdapter } from './prisma-adapter';

const SETE_DIAS = 7 * 24 * 60 * 60;
/** Inatividade máxima da sessão SSO (D2 aprovada). */
export const INATIVIDADE_MAX = 24 * 60 * 60;
/** Intervalo da limpeza dos registros vencidos do OidcPayload. */
const LIMPEZA_MS = 60 * 60 * 1000;

/**
 * TTL da sessão SSO a cada uso. O provedor regrava a sessão em toda
 * requisição que a usa (autorização, end_session) com este TTL: a validade
 * passa a ser "agora + 24 h", sem passar dos 7 dias desde o login. Sessão sem
 * uso por 24 h vence; com uso, vence 7 dias depois do login.
 */
export function ttlDaSessao(
  loginTs: number | undefined,
  agora = Math.floor(Date.now() / 1000),
): number {
  const restoAbsoluto = loginTs ? loginTs + SETE_DIAS - agora : SETE_DIAS;
  return Math.max(1, Math.min(INATIVIDADE_MAX, restoAbsoluto));
}

/**
 * Google DENTRO do login central: as mesmas credenciais e regras da 1c, mas
 * com o callback em OIDC_GOOGLE_REDIRECT_URI (…/auth/oidc/google/callback).
 * O destino pós-login da 1c não se aplica (o login volta pela interação):
 * só a conferência dele é dispensada. Sem a variável → só senha.
 */
function googleDoOidc(
  get: (n: string) => string | undefined,
  issuer: string,
): GoogleSettings | null {
  const redirect = safeLaunchUrl(get('OIDC_GOOGLE_REDIRECT_URI')?.trim());
  if (
    !redirect ||
    !new URL(redirect).pathname.endsWith('/oidc/google/callback')
  )
    return null;
  const s = readGoogleSettings((n) =>
    n === 'GOOGLE_OAUTH_REDIRECT_URI'
      ? redirect
      : n === 'GOOGLE_POST_LOGIN_REDIRECT'
        ? issuer
        : get(n),
  );
  return s.enabled ? s : null;
}

/** Configuração do oidc-provider. TUDO o que não usamos fica desligado. */
function configuracao(p: {
  s: OidcSettings;
  clients: unknown[];
  adapter: unknown;
  cookiePath: string;
  contas: OidcAccounts;
  policy: unknown;
  urlDaInteracao: (uid: string) => string;
}) {
  const cookie = {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: p.cookiePath,
  };
  return {
    adapter: p.adapter,
    clients: p.clients,
    jwks: p.s.jwks,
    cookies: {
      keys: p.s.cookieKeys,
      names: {
        session: 'hub_sso',
        interaction: 'hub_interaction',
        resume: 'hub_resume',
      },
      long: { ...cookie, signed: true },
      short: { ...cookie, signed: true },
    },
    // Só authorization code, com PKCE obrigatório (S256 é o único método na v9).
    responseTypes: ['code'],
    pkce: { required: () => true },
    // (c) Autenticação dos clientes: SÓ client_secret_basic (decisão D3).
    clientAuthMethods: ['client_secret_basic'],
    // Sem CORS de navegador nos endpoints dos clientes (token/userinfo são
    // chamados pelo servidor do cliente, nunca pelo navegador).
    clientBasedCORS: () => false,
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: false },
      introspection: { enabled: false },
      // A revogação entra no D3, só se ele precisar.
      revocation: { enabled: false },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource,
        postLogoutSuccessSource,
      },
    },
    renderError,
    scopes: ['openid', 'email', 'profile'],
    claims: {
      openid: ['sub'],
      email: ['email', 'email_verified'],
      profile: ['name'],
    },
    // As claims dos escopos vão no id_token (D5), não só no userinfo.
    conformIdTokenClaims: false,
    enabledJWA: { idTokenSigningAlgValues: ['RS256'] },
    ttl: {
      AuthorizationCode: 60,
      AccessToken: 600,
      IdToken: 600,
      RefreshToken: SETE_DIAS,
      Grant: SETE_DIAS,
      // (d) 7 dias, com expiração por 24 h de inatividade.
      Session: (_ctx: unknown, session: { loginTs?: number }) =>
        ttlDaSessao(session?.loginTs),
      Interaction: 60 * 60,
    },
    // Refresh token para quem tem o grant refresh_token (o hub), rotativo, e
    // com validade própria de 7 dias (não cai junto com a sessão SSO; a cada
    // refresh, status e flag são conferidos de novo em findAccount).
    issueRefreshToken: async (_ctx: unknown, client: any) =>
      client.grantTypeAllowed('refresh_token'),
    rotateRefreshToken: true,
    expiresWithSession: async () => false,
    findAccount: p.contas.findAccount,
    loadExistingGrant: p.contas.loadExistingGrant,
    interactions: {
      policy: p.policy,
      url: (_ctx: unknown, i: { uid: string }) => p.urlDaInteracao(i.uid),
    },
  };
}

/**
 * Política de interação: só o prompt de login (sem consentimento, D6), mais
 * uma checagem: sessão SSO cuja pessoa deixou de estar ATIVA não vale, e o
 * login é pedido de novo (lá a recusa vira access_denied, com auditoria).
 */
function politica(interactionPolicy: any) {
  const { Check, base } = interactionPolicy;
  const policy = base();
  policy.remove('consent');
  policy
    .get('login')
    .checks.push(
      new Check(
        'conta_indisponivel',
        'a sessão não tem mais uma conta válida',
        'login_required',
        (ctx: any) =>
          !!ctx.oidc.session.accountId && !ctx.oidc.account
            ? Check.REQUEST_PROMPT
            : Check.NO_NEED_TO_PROMPT,
      ),
    );
  return policy;
}

/** Origens para onde um formulário do /oidc pode terminar (CSP form-action). */
function origensDosFormularios(
  issuer: URL,
  clients: Record<string, any>[],
  google: boolean,
) {
  const origens = [issuer.origin];
  if (google) origens.push('https://accounts.google.com');
  for (const c of clients) {
    for (const u of [
      ...(c.redirect_uris ?? []),
      ...(c.post_logout_redirect_uris ?? []),
    ]) {
      origens.push(new URL(u).origin);
    }
  }
  return origens;
}

/** (Limpeza) agenda a remoção periódica dos registros vencidos. */
function agendarLimpeza(app: INestApplication, prisma: PrismaClient) {
  const logger = new Logger('OIDC');
  const timer = setInterval(() => {
    limparVencidos(prisma)
      .then(
        (n) =>
          n && logger.log(`oidc: limpeza removeu ${n} registro(s) vencido(s)`),
      )
      .catch((e) =>
        logger.warn(`oidc: limpeza falhou (${(e as Error)?.name ?? 'erro'})`),
      );
  }, LIMPEZA_MS);
  timer.unref();
  app.getHttpServer().on('close', () => clearInterval(timer));
}

/**
 * Monta o provedor OIDC em /oidc (o proxy do Analytics já tira o /auth).
 * O issuer é FIXO (OIDC_ISSUER): caminho, host e protocolo de TODAS as URLs
 * saem dele, nunca da requisição. Sem as variáveis, SÓ o OIDC desliga: /oidc
 * responde 503 e o resto do serviço segue normal. Devolve o provedor (ou null).
 *
 * Tem de ser chamado ANTES do app.enableCors e do app.init/listen: assim o
 * /oidc não herda o CORS das rotas /api nem o body parser do Nest (o provedor
 * lê o corpo cru; as interações têm o parser delas).
 */
export async function mountOidc(app: INestApplication): Promise<any | null> {
  const logger = new Logger('OIDC');
  const config = app.get(ConfigService);
  const get = (n: string) => config.get<string>(n);
  const express = app.getHttpAdapter().getInstance();
  const s = readOidcSettings(get);

  if (!s.enabled) {
    logger.warn(s.resumo);
    express.use('/oidc', (_req: Request, res: Response) => {
      res.status(503).json({ message: 'Login central indisponível' });
    });
    return null;
  }

  const prisma = app.get(PrismaService).prismaOnline;
  const access = app.get(AccessService, { strict: false });
  const cl = await loadClients(prisma, get);
  const issuer = new URL(s.issuer);
  // Ex.: issuer https://hub.lhgmoteis.com.br/auth/oidc → caminho /auth/oidc.
  const caminho = issuer.pathname.replace(/\/$/, '');
  const cookiePath = caminho.replace(/\/oidc$/, '') || '/';

  const google = googleDoOidc(get, s.issuer);
  const paginaMinima = get('OIDC_MINIMAL_LOGIN_PAGE') === 'true';
  const paginaHub = safeLaunchUrl(get('OIDC_LOGIN_PAGE_URL')?.trim());
  const urlDaInteracao = (uid: string, erro?: string) => {
    const u = paginaHub
      ? `${paginaHub}?uid=${encodeURIComponent(uid)}`
      : `${caminho}/interaction/${encodeURIComponent(uid)}`;
    if (!erro) return u;
    return `${u}${u.includes('?') ? '&' : '?'}erro=${encodeURIComponent(erro)}`;
  };

  const oidc = await loadOidcModule();
  const Provider = oidc.default ?? oidc.Provider;
  const contas = new OidcAccounts(prisma, access, oidc.errors);
  const provider = new Provider(
    s.issuer,
    configuracao({
      s,
      clients: cl.clients,
      adapter: prismaAdapter(prisma),
      cookiePath,
      contas,
      policy: politica(oidc.interactionPolicy),
      urlDaInteracao,
    }),
  );
  provider.proxy = true;
  const callback = provider.callback();
  const csp = cspDoOidc(origensDosFormularios(issuer, cl.clients, !!google));

  express.use('/oidc', (req: Request, res: Response, next: NextFunction) => {
    // O provedor monta as URLs a partir do caminho de montagem e do host da
    // requisição. Aqui eles são FIXADOS no issuer: o caminho completo (com o
    // /auth que o proxy tirou) e o host/protocolo públicos. Os cabeçalhos
    // X-Forwarded-Host/Proto do cliente são sobrescritos, nunca confiados.
    // (b) O X-Forwarded-For NÃO é usado: auditoria e bloqueio usam o req.ip
    // do Express (trust proxy do serviço), nunca o ctx.ip do provedor.
    req.originalUrl = caminho + req.url;
    req.headers['x-forwarded-host'] = issuer.host;
    req.headers['x-forwarded-proto'] = issuer.protocol.replace(':', '');
    // (e) CSP próprio do /oidc (substitui o do helmet global).
    res.setHeader('Content-Security-Policy', csp);
    next();
  });
  express.use(
    '/oidc',
    interacoes({
      provider,
      auth: app.get(AuthService, { strict: false }),
      access,
      googleProvider: app.get(GoogleIdentityProvider, { strict: false }),
      googleLogin: app.get(GoogleLoginService, { strict: false }),
      google,
      jwtSecret: get('JWT_SECRET')!,
      caminho,
      paginaMinima,
      urlDaInteracao,
    }),
  );
  express.use('/oidc', (req: Request, res: Response) => callback(req, res));

  agendarLimpeza(app, prisma);

  logger.log(
    `${s.resumo} clientes=${cl.ativos} ativo(s)` +
      `${cl.semSegredo ? `, ${cl.semSegredo} sem segredo (desligado)` : ''}` +
      `${cl.invalidos ? `, ${cl.invalidos} com redirect inválida (desligado)` : ''}` +
      ` google=${google ? 'ok' : 'desligado'}` +
      ` tela=${paginaHub ? 'hub(https)' : paginaMinima ? 'mínima(homologação)' : 'NENHUMA'}`,
  );
  return provider;
}

import {
  Controller,
  Get,
  Inject,
  Logger,
  OnModuleInit,
  Optional,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import {
  ANALYTICS,
  ANALYTICS_ACCESS_INCLUDE,
  AccessService,
  analyticsDenial,
  requestContext,
} from '../access/access.service';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';
import {
  REFRESH_TOKEN_MAX_AGE,
  sessionCookieOptions,
  setSessionCookies,
} from '../auth/session-cookies';
import { PrismaService } from '../prisma/prisma.service';
import {
  HUB_COOKIE_PATH,
  HubClientSettings,
  readHubClientSettings,
  resumoHubCliente,
  returnToSeguro,
} from './hub-client.settings';
import {
  Buscar,
  HubOidc,
  TokenInvalido,
  aleatorio,
  chaveDosCookies,
  cifrar,
  decifrar,
} from './hub-oidc';

/** fetch usado para falar com o provedor (os testes injetam outro). */
export const HUB_CLIENT_BUSCAR = 'HUB_CLIENT_BUSCAR';
/** Cookie do fluxo (state, nonce, verifier, returnTo), cifrado, 10 min. */
export const COOKIE_FLUXO = 'an_hub_flow';
/** Cookie do id_token (para o id_token_hint do "Sair"), cifrado, 7 dias. */
export const COOKIE_IDT = 'an_hub_idt';
const FLUXO_MS = 10 * 60 * 1000;

type Fluxo = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
};
type ErroHub = 'access_denied' | 'inactive' | 'indisponivel' | 'falha';

/**
 * O Analytics como CLIENTE do HUB (login central): code + PKCE pelo servidor.
 * O navegador nunca vê code, tokens do HUB, verifier ou segredo. Depois do
 * id_token, valem as MESMAS regras do login de hoje (analyticsDenial) e a
 * sessão é a MESMA de hoje (cookies access_token/refresh_token). Sem as
 * variáveis do cliente, tudo aqui responde 404.
 */
@ApiTags('HUB (cliente)')
@Controller('hub')
@Public()
@Throttle({ default: { limit: 60, ttl: 60000 } })
export class HubClientController implements OnModuleInit {
  private readonly logger = new Logger('HubCliente');
  private cache: { chave: string; oidc: HubOidc } | null = null;
  /** jti já usados no back-channel (o authentication roda em 1 processo). */
  private readonly jtis = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly access: AccessService,
    private readonly prisma: PrismaService,
    @Optional() @Inject(HUB_CLIENT_BUSCAR) private readonly buscar?: Buscar,
  ) {}

  private settings(): HubClientSettings {
    return readHubClientSettings((n) => this.config.get<string>(n));
  }

  onModuleInit() {
    const { linha, alerta } = resumoHubCliente(this.settings());
    this.logger.log(linha);
    if (alerta) this.logger.error(alerta);
  }

  private oidc(s: HubClientSettings): HubOidc {
    const chave = [
      s.issuer,
      s.clientId,
      s.clientSecret,
      s.redirectUri,
      s.portalUrl,
    ].join('|');
    if (!this.cache || this.cache.chave !== chave) {
      this.cache = { chave, oidc: new HubOidc(s, this.buscar ?? fetch) };
    }
    return this.cache.oidc;
  }

  private cookieHub(s: HubClientSettings, maxAge: number) {
    return {
      httpOnly: true,
      // Os cookies an_hub_* são do host do callback (o backend), host-only.
      secure: s.backendOrigin.startsWith('https:'),
      sameSite: 'lax' as const,
      path: HUB_COOKIE_PATH,
      maxAge,
    };
  }

  private limparCookieHub(res: Response, s: HubClientSettings, nome: string) {
    const { maxAge: _m, ...op } = this.cookieHub(s, 0);
    res.clearCookie(nome, op);
  }

  private naoEncontrado(res: Response) {
    return res.status(404).json({ message: 'Not Found' });
  }

  private erro(res: Response, s: HubClientSettings, codigo: ErroHub) {
    return res.redirect(302, `${s.publicOrigin}/login?hub_error=${codigo}`);
  }

  // ── GET /api/hub/login ─────────────────────────────────────────────────
  @Get('login')
  async login(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const s = this.settings();
    if (!s.ativo) return this.naoEncontrado(res);
    const fluxo: Fluxo = {
      state: aleatorio(),
      nonce: aleatorio(),
      codeVerifier: aleatorio(),
      returnTo: returnToSeguro(req.query.returnTo, s.defaultReturnTo),
    };
    let destino: string;
    try {
      destino = await this.oidc(s).urlDeAutorizacao(fluxo);
    } catch (e) {
      this.logger.warn(
        `hub-cliente: discovery indisponível (${(e as Error)?.name ?? 'erro'})`,
      );
      return this.erro(res, s, 'indisponivel');
    }
    res.cookie(
      COOKIE_FLUXO,
      await cifrar(fluxo, chaveDosCookies(s.clientSecret)),
      this.cookieHub(s, FLUXO_MS),
    );
    return res.redirect(302, destino);
  }

  // ── GET /api/hub/callback ──────────────────────────────────────────────
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const s = this.settings();
    if (!s.ativo) return this.naoEncontrado(res);
    const ctx = requestContext(req);
    const chave = chaveDosCookies(s.clientSecret);
    const fluxo = await decifrar<Fluxo>(req.cookies?.[COOKIE_FLUXO], chave);
    this.limparCookieHub(res, s, COOKIE_FLUXO);
    const q = req.query as Record<string, unknown>;
    const falhou = async (motivo: string, codigo: ErroHub = 'falha') => {
      await this.access.audit({
        action: 'hub.login.failed',
        systemKey: ANALYTICS,
        metadata: { motivo },
        ctx,
      });
      return this.erro(res, s, codigo);
    };
    if (!fluxo) return falhou('fluxo_ausente');
    if (typeof q.state !== 'string' || q.state !== fluxo.state) {
      return falhou('state');
    }
    if (q.error !== undefined) {
      return q.error === 'access_denied'
        ? falhou('provedor_access_denied', 'access_denied')
        : falhou('provedor_erro');
    }
    if (typeof q.code !== 'string' || !q.code) return falhou('sem_code');

    let sub: string;
    let idToken: string;
    try {
      const o = this.oidc(s);
      idToken = await o.trocarCode(q.code, fluxo.codeVerifier);
      const claims = await o.validarIdToken(idToken, fluxo.nonce);
      sub = claims.sub!;
    } catch (e) {
      const motivo =
        e instanceof TokenInvalido
          ? e.message
          : `rede_${(e as Error)?.name ?? 'erro'}`;
      this.logger.warn(`hub-cliente: callback recusado (${motivo})`);
      return falhou(motivo);
    }

    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { publicId: sub },
      include: ANALYTICS_ACCESS_INCLUDE,
    });
    if (!user) return falhou('sem_usuario');
    const negado = analyticsDenial(user);
    if (negado) {
      await this.access.audit({
        action: `hub.login.denied.${negado}`,
        targetUserId: user.id,
        systemKey: ANALYTICS,
        ctx,
      });
      return this.erro(
        res,
        s,
        negado === 'inactive' ? 'inactive' : 'access_denied',
      );
    }

    setSessionCookies(res, this.config, await this.auth.login(user));
    res.cookie(
      COOKIE_IDT,
      await cifrar({ t: idToken }, chave),
      this.cookieHub(s, REFRESH_TOKEN_MAX_AGE),
    );
    await this.access.audit({
      action: 'hub.login',
      actorUserId: user.id,
      targetUserId: user.id,
      systemKey: ANALYTICS,
      ctx,
    });
    return res.redirect(
      302,
      `${s.publicOrigin}${returnToSeguro(fluxo.returnTo, s.defaultReturnTo)}`,
    );
  }

  // ── POST /api/hub/logout ───────────────────────────────────────────────
  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const s = this.settings();
    if (!s.ativo) return this.naoEncontrado(res);
    // CSRF: só da origem do front (Origin; sem ele, o Referer).
    const origem = (() => {
      const o = req.headers.origin;
      if (typeof o === 'string' && o) return o;
      try {
        const r = req.headers.referer;
        return typeof r === 'string' && r ? new URL(r).origin : null;
      } catch {
        return null;
      }
    })();
    if (origem !== s.publicOrigin) {
      return res.status(403).json({ message: 'Origem não permitida' });
    }
    const refresh = req.cookies?.refresh_token;
    let userId: number | null = null;
    if (typeof refresh === 'string' && refresh) {
      const rt = await this.prisma.prismaOnline.refreshToken.findUnique({
        where: { token: refresh },
        select: { userId: true },
      });
      userId = rt?.userId ?? null;
      await this.auth.logout(refresh);
    }
    const idt = await decifrar<{ t: string }>(
      req.cookies?.[COOKIE_IDT],
      chaveDosCookies(s.clientSecret),
    );
    const opcoes = sessionCookieOptions(this.config);
    res.clearCookie('access_token', opcoes);
    res.clearCookie('refresh_token', opcoes);
    this.limparCookieHub(res, s, COOKIE_IDT);
    await this.access.audit({
      action: 'hub.logout',
      actorUserId: userId,
      targetUserId: userId,
      systemKey: ANALYTICS,
      metadata: { comHint: !!idt?.t },
      ctx: requestContext(req),
    });
    let destino: string | null = null;
    try {
      destino = await this.oidc(s).urlDeSaida(idt?.t ?? null);
    } catch {
      destino = null;
    }
    return res.redirect(303, destino ?? `${s.publicOrigin}/login`);
  }

  // ── POST /api/hub/backchannel-logout ───────────────────────────────────
  @Post('backchannel-logout')
  async backchannel(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const s = this.settings();
    if (!s.ativo) return res.status(503).json({ message: 'Indisponível' });
    const token = (req.body as Record<string, unknown>)?.logout_token;
    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    let claims;
    try {
      claims = await this.oidc(s).validarLogoutToken(token);
    } catch (e) {
      this.logger.warn(
        `hub-cliente: back-channel recusado (${e instanceof TokenInvalido ? e.message : ((e as Error)?.name ?? 'erro')})`,
      );
      return res.status(400).json({ error: 'invalid_request' });
    }
    // jti repetido → 400 (vale até o exp do token; a ação é idempotente).
    const agora = Date.now();
    for (const [j, ate] of this.jtis) if (ate <= agora) this.jtis.delete(j);
    const jti = String(claims.jti);
    if (this.jtis.has(jti))
      return res.status(400).json({ error: 'invalid_request' });
    const exp =
      typeof claims.exp === 'number' ? claims.exp * 1000 : agora + 120000;
    this.jtis.set(jti, Math.max(exp, agora + 120000));

    const user = await this.prisma.prismaOnline.user.findUnique({
      where: { publicId: String(claims.sub) },
      select: { id: true },
    });
    if (!user) {
      this.logger.log('hub-cliente: back-channel sem usuário (no_user)');
      return res.status(200).end();
    }
    await this.auth.revokeAllUserTokens(user.id);
    await this.access.audit({
      action: 'hub.backchannel',
      targetUserId: user.id,
      systemKey: ANALYTICS,
      metadata: { sid: typeof claims.sid === 'string' ? claims.sid : null },
      ctx: requestContext(req),
    });
    return res.status(200).end();
  }
}

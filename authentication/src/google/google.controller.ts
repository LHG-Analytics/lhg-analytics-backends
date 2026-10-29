import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  OnModuleInit,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import {
  ANALYTICS,
  AccessService,
  analyticsDenial,
  requestContext,
} from '../access/access.service';
import { AuthService } from '../auth/auth.service';
import { Public } from '../auth/decorators/public.decorator';
import {
  sessionCookieOptions,
  setSessionCookies,
} from '../auth/session-cookies';
import { InvitationTokenDto } from '../invitations/dto/invitation.dto';
import {
  InvitationsService,
  hashToken,
} from '../invitations/invitations.service';
import { GoogleSettings, readGoogleSettings } from './google.config';
import { GoogleIdentityProvider } from './google-identity.provider';
import { GoogleLoginService, GoogleRefusal } from './google-login.service';
import {
  OAUTH_COOKIE,
  OAUTH_TTL_MS,
  pkceChallenge,
  randomToken,
  sameString,
  signState,
  verifyState,
} from './oauth-state';

/**
 * Login com Google no servidor (OAuth 2.0 + OIDC, com state, nonce e PKCE).
 * Rotas públicas. O resultado sempre volta ao front por redirect para
 * GOOGLE_POST_LOGIN_REDIRECT: sucesso com o MESMO cookie do login por senha;
 * recusa com ?google_error=<código> (o front mostra a mensagem).
 */
@ApiTags('Google')
@Controller()
@Public()
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class GoogleController implements OnModuleInit {
  private readonly logger = new Logger('GoogleOAuth');

  constructor(
    private readonly config: ConfigService,
    private readonly provider: GoogleIdentityProvider,
    private readonly google: GoogleLoginService,
    private readonly auth: AuthService,
    private readonly access: AccessService,
    private readonly invitations: InvitationsService,
  ) {}

  /** Lido a cada uso: trocar a variável no Render vale no próximo deploy. */
  private settings(): GoogleSettings {
    return readGoogleSettings((n) => this.config.get<string>(n));
  }

  /** Conferência no boot: UMA linha, sem valores. */
  onModuleInit() {
    const s = this.settings();
    if (s.enabled) this.logger.log(s.resumo);
    else this.logger.warn(s.resumo);
  }

  private voltar(res: Response, s: GoogleSettings, erro?: string) {
    res.clearCookie(OAUTH_COOKIE, sessionCookieOptions(this.config));
    if (!s.postLoginRedirect) {
      // Sem destino configurado não há para onde voltar.
      return res.status(503).json({ message: 'Login com Google indisponível' });
    }
    const u = new URL(s.postLoginRedirect);
    if (erro) u.searchParams.set('google_error', erro);
    return res.redirect(302, u.toString());
  }

  /** Começa o fluxo: grava o estado assinado no cookie e devolve a URL do Google. */
  private iniciar(res: Response, s: GoogleSettings, inviteTokenHash?: string) {
    const st = {
      state: randomToken(),
      nonce: randomToken(),
      verifier: randomToken(),
      ...(inviteTokenHash && { invite: inviteTokenHash }),
      exp: Date.now() + OAUTH_TTL_MS,
    };
    res.cookie(
      OAUTH_COOKIE,
      signState(st, this.config.get<string>('JWT_SECRET')!),
      {
        ...sessionCookieOptions(this.config),
        maxAge: OAUTH_TTL_MS,
      },
    );
    return this.provider.authorizationUrl(s, {
      state: st.state,
      nonce: st.nonce,
      codeChallenge: pkceChallenge(st.verifier),
    });
  }

  @Get('google/start')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  start(@Res() res: Response) {
    const s = this.settings();
    if (!s.enabled) return this.voltar(res, s, 'disabled');
    return res.redirect(302, this.iniciar(res, s));
  }

  /**
   * Aceite do convite pelo Google: o token vai no CORPO; o vínculo com o
   * convite fica DENTRO do cookie assinado (nunca na URL do Google nem em log).
   * Devolve a URL do Google para o front navegar.
   */
  @Post('invitations/accept/google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async acceptByGoogle(
    @Body() body: InvitationTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const s = this.settings();
    if (!s.enabled) {
      return { url: null, error: 'disabled' };
    }
    await this.invitations.check(body.token); // 400 INVITE_INVALID se não servir
    return { url: this.iniciar(res, s, hashToken(body.token)) };
  }

  @Get('google/callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') erroGoogle: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const s = this.settings();
    if (!s.enabled) return this.voltar(res, s, 'disabled');
    const ctx = requestContext(req);

    const st = verifyState(
      req.cookies?.[OAUTH_COOKIE],
      this.config.get<string>('JWT_SECRET')!,
    );
    if (!st || !sameString(st.state, state))
      return this.voltar(res, s, 'state');
    if (erroGoogle || !code) return this.voltar(res, s, 'cancelled');

    try {
      const claims = await this.provider.exchangeCode(s, code, st.verifier);
      if (!sameString(claims.nonce, st.nonce))
        return this.voltar(res, s, 'google');

      const user = await this.google.resolve(claims, s, st.invite, ctx);

      // A pessoa existe e entrou pelo Google, mas o ANALYTICS pode recusá-la
      // (sem a flag ou sem perfil): o mesmo critério do login por senha.
      const denial = analyticsDenial(user);
      if (denial) {
        await this.access.audit({
          action: `login.denied.${denial}`,
          targetUserId: user.id,
          systemKey: ANALYTICS,
          metadata: { method: 'google' },
          ctx,
        });
        return this.voltar(res, s, 'no_access');
      }

      setSessionCookies(res, this.config, await this.auth.login(user));
      await this.access.audit({
        action: 'login.google',
        actorUserId: user.id,
        targetUserId: user.id,
        ctx,
      });
      return this.voltar(res, s);
    } catch (error) {
      if (error instanceof GoogleRefusal)
        return this.voltar(res, s, error.code);
      // Sem detalhes do Google no log (podem ecoar o code).
      this.logger.warn(
        `Falha no callback do Google: ${(error as Error)?.name ?? 'erro'}`,
      );
      return this.voltar(res, s, 'google');
    }
  }
}

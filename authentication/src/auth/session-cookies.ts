import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

export const ACCESS_TOKEN_MAX_AGE = 3600000; // 1 hora em ms
export const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 3600000; // 7 dias em ms

export type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  domain?: string;
};

/**
 * Opções dos cookies de sessão (os mesmos para o login por senha e pelo
 * Google). 'lax' permite o envio em navegação cross-site; em produção,
 * COOKIE_DOMAIN compartilha os cookies entre subdomínios.
 */
export function sessionCookieOptions(config: ConfigService): CookieOptions {
  const isProduction = config.get('NODE_ENV') === 'production';
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
  const cookieDomain = config.get<string>('COOKIE_DOMAIN');
  if (cookieDomain) options.domain = cookieDomain;
  return options;
}

/** Grava access_token (1h) e refresh_token (7 dias), como no login. */
export function setSessionCookies(
  res: Response,
  config: ConfigService,
  tokens: { access_token: string; refresh_token: string },
) {
  const options = sessionCookieOptions(config);
  res.cookie('access_token', tokens.access_token, {
    ...options,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  res.cookie('refresh_token', tokens.refresh_token, {
    ...options,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
}

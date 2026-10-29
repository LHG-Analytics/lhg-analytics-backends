import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { loadClients } from './oidc-clients';
import { readOidcSettings, OidcSettings } from './oidc.config';
import { loadOidcProvider } from './oidc-loader';
import { prismaAdapter } from './prisma-adapter';

const SETE_DIAS = 7 * 24 * 60 * 60;

/** Configuração do oidc-provider (D1: base, ainda sem login). */
function configuracao(
  s: OidcSettings,
  clients: unknown[],
  adapter: unknown,
  cookiePath: string,
) {
  const cookie = {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: cookiePath,
  };
  return {
    adapter,
    clients,
    jwks: s.jwks,
    cookies: {
      keys: s.cookieKeys,
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
    features: { devInteractions: { enabled: false } },
    claims: {
      openid: ['sub'],
      email: ['email', 'email_verified'],
      profile: ['name'],
    },
    enabledJWA: { idTokenSigningAlgValues: ['RS256'] },
    ttl: {
      AuthorizationCode: 60,
      AccessToken: 600,
      IdToken: 600,
      RefreshToken: SETE_DIAS,
      Grant: SETE_DIAS,
      Session: SETE_DIAS,
      Interaction: 60 * 60,
    },
    // Login (interações e contas) entra no D2.
    findAccount: async () => undefined,
    interactions: {
      url: (_ctx: unknown, i: { uid: string }) =>
        `${cookiePath}/oidc/interaction/${i.uid}`,
    },
  };
}

/**
 * Monta o provedor OIDC em /oidc (o proxy do Analytics já tira o /auth).
 * O issuer é FIXO (OIDC_ISSUER): caminho, host e protocolo de TODAS as URLs
 * saem dele, nunca da requisição. Sem as variáveis, SÓ o OIDC desliga: /oidc
 * responde 503 e o resto do serviço segue normal. Devolve o provedor (ou null).
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
  const cl = await loadClients(prisma, get);
  const issuer = new URL(s.issuer);
  // Ex.: issuer https://hub.lhgmoteis.com.br/auth/oidc → caminho /auth/oidc.
  const caminho = issuer.pathname.replace(/\/$/, '');
  const cookiePath = caminho.replace(/\/oidc$/, '') || '/';

  const Provider = await loadOidcProvider();
  const provider = new Provider(
    s.issuer,
    configuracao(s, cl.clients, prismaAdapter(prisma), cookiePath),
  );
  provider.proxy = true;
  const callback = provider.callback();

  express.use('/oidc', (req: Request, res: Response) => {
    // O provedor monta as URLs a partir do caminho de montagem e do host da
    // requisição. Aqui eles são FIXADOS no issuer: o caminho completo (com o
    // /auth que o proxy tirou) e o host/protocolo públicos. Os cabeçalhos
    // X-Forwarded-Host/Proto do cliente são sobrescritos, nunca confiados.
    req.originalUrl = caminho + req.url;
    req.headers['x-forwarded-host'] = issuer.host;
    req.headers['x-forwarded-proto'] = issuer.protocol.replace(':', '');
    callback(req, res);
  });

  logger.log(
    `${s.resumo} clientes=${cl.ativos} ativo(s)` +
      `${cl.semSegredo ? `, ${cl.semSegredo} sem segredo (desligado)` : ''}` +
      `${cl.invalidos ? `, ${cl.invalidos} com redirect inválida (desligado)` : ''}`,
  );
  return provider;
}

import { safeLaunchUrl } from '../access/launcher.service';

/** Contas do próprio Google: basta email_verified (não há hd). */
export const DOMINIOS_GOOGLE = new Set(['gmail.com', 'googlemail.com']);

export interface GoogleSettings {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  postLoginRedirect: string;
  /** domínio do e-mail → hd esperado (o próprio domínio, salvo "dom=hd"). */
  workspace: Map<string, string>;
  /** Linha de conferência para o log do boot: SEM valores. */
  resumo: string;
}

const CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;
const DOMINIO = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * GOOGLE_WORKSPACE_DOMAINS: lista separada por vírgula. Cada item é um
 * domínio (hd esperado = ele mesmo) ou "dominio=hdEsperado" (para domínio
 * secundário dentro de outra organização). Itens inválidos são ignorados.
 */
export function parseWorkspaceDomains(
  raw: string | undefined,
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const item of (raw ?? '').split(',')) {
    const [dom, hd] = item.split('=').map((p) => p?.trim().toLowerCase());
    const esperado = hd || dom;
    if (dom && DOMINIO.test(dom) && esperado && DOMINIO.test(esperado)) {
      mapa.set(dom, esperado);
    }
  }
  return mapa;
}

/**
 * Lê e confere as variáveis do Google. Se algo estiver errado, SÓ o login com
 * Google fica desligado (o login por senha continua). O resumo nunca traz os
 * valores, só o estado de cada item.
 */
export function readGoogleSettings(
  get: (name: string) => string | undefined,
): GoogleSettings {
  const clientId = (get('GOOGLE_OAUTH_CLIENT_ID') ?? '').trim();
  const clientSecret = (get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '').trim();
  const redirectUri =
    safeLaunchUrl(get('GOOGLE_OAUTH_REDIRECT_URI')?.trim()) ?? '';
  const postLoginRedirect =
    safeLaunchUrl(get('GOOGLE_POST_LOGIN_REDIRECT')?.trim()) ?? '';
  const workspace = parseWorkspaceDomains(get('GOOGLE_WORKSPACE_DOMAINS'));

  const ok = {
    client_id: CLIENT_ID.test(clientId),
    secret: clientSecret.length >= 10,
    redirect:
      !!redirectUri &&
      new URL(redirectUri).pathname.endsWith('/google/callback'),
    post_login: !!postLoginRedirect,
  };
  const enabled = Object.values(ok).every(Boolean);
  const resumo =
    `google_oauth: client_id=${ok.client_id ? 'ok(formato)' : 'FALTA/INVÁLIDO'}` +
    ` secret=${ok.secret ? 'ok(presente)' : 'FALTA'}` +
    ` redirect=${ok.redirect ? 'ok(https, /google/callback)' : 'FALTA/INVÁLIDO'}` +
    ` post_login=${ok.post_login ? 'ok(https)' : 'FALTA/INVÁLIDO'}` +
    ` workspace_domains=${workspace.size}` +
    ` → ${enabled ? 'ATIVO' : 'DESLIGADO (só o login com Google; a senha continua)'}`;

  return {
    enabled,
    clientId,
    clientSecret,
    redirectUri,
    postLoginRedirect,
    workspace,
    resumo,
  };
}

export type DomainCheck =
  | { ok: true; domain: string }
  | { ok: false; domain: string; reason: 'hd_mismatch' | 'domain_not_allowed' };

/**
 * Pode usar o Google com este e-mail? Workspace: hd == o esperado para o
 * domínio (bloqueia a Conta Google pessoal criada com e-mail corporativo).
 * gmail/googlemail: liberado (email_verified é conferido antes). Qualquer
 * outro domínio: recusado (só senha).
 */
export function checkGoogleDomain(
  email: string,
  hd: string | undefined,
  workspace: Map<string, string>,
): DomainCheck {
  const domain = (email.split('@')[1] ?? '').toLowerCase();
  const esperado = workspace.get(domain);
  if (esperado) {
    return (hd ?? '').toLowerCase() === esperado
      ? { ok: true, domain }
      : { ok: false, domain, reason: 'hd_mismatch' };
  }
  if (DOMINIOS_GOOGLE.has(domain)) return { ok: true, domain };
  return { ok: false, domain, reason: 'domain_not_allowed' };
}

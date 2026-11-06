/**
 * Configuração do Analytics como CLIENTE do HUB (login central). Lida a cada
 * uso: trocar uma variável no Render vale no próximo deploy. Sem as variáveis
 * (ou com alguma inválida), o cliente fica DESLIGADO: as rotas /api/hub/*
 * respondem 404 e o login antigo segue como hoje.
 */
export interface HubClientSettings {
  ativo: boolean;
  /** Motivo de estar desligado (sem valores). */
  motivo: string | null;
  issuer: string;
  clientId: string;
  clientSecret: string;
  /**
   * Origem do FRONT (sem caminho): destino após o login, /login?hub_error e o
   * Origin aceito no logout.
   */
  publicOrigin: string;
  /**
   * Origem onde ficam as rotas /auth/api/hub/* (o callback e os cookies
   * an_hub_*): ANALYTICS_BACKEND_URL, ou o próprio front se ela não existir.
   */
  backendOrigin: string;
  /** Front e backend em hosts diferentes (ANALYTICS_BACKEND_URL ≠ front). */
  separados: boolean;
  redirectUri: string;
  portalUrl: string;
  /** ANALYTICS_LOGIN_LOCAL=off pedido (vale só com o cliente ATIVO). */
  loginLocalOffPedido: boolean;
  /** A porta antiga (POST /api/login e Google antigo) está FECHADA. */
  loginLocalFechado: boolean;
}

/** Caminho público do callback (o navegador vê /auth/api/...). */
export const CALLBACK_PATH = '/auth/api/hub/callback';
/** Caminho público dos cookies do cliente (fluxo e id_token). */
export const HUB_COOKIE_PATH = '/auth/api/hub';
/** Segredo do cliente: mínimo de caracteres. */
export const MIN_SEGREDO = 32;

function urlSegura(
  valor: string | undefined,
  permitirLocalhost: boolean,
): URL | null {
  const v = valor?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.username || u.password || u.hash) return null;
    if (u.protocol === 'https:') return u;
    if (
      permitirLocalhost &&
      u.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(u.hostname)
    ) {
      return u;
    }
    return null;
  } catch {
    return null;
  }
}

export function readHubClientSettings(
  get: (n: string) => string | undefined,
): HubClientSettings {
  const permitirLocalhost = get('OIDC_ALLOW_LOCALHOST_REDIRECTS') === 'true';
  const issuer = urlSegura(get('HUB_OIDC_ISSUER'), permitirLocalhost);
  const clientId = get('HUB_OIDC_CLIENT_ID')?.trim() ?? '';
  const clientSecret = get('HUB_OIDC_CLIENT_SECRET')?.trim() ?? '';
  const publico = urlSegura(get('ANALYTICS_PUBLIC_URL'), permitirLocalhost);
  const portal = urlSegura(get('HUB_PORTAL_URL'), permitirLocalhost);
  // Opcional: o host do backend, quando o front não repassa /auth/* a ele.
  const backendBruto = get('ANALYTICS_BACKEND_URL')?.trim();
  const backend = backendBruto
    ? urlSegura(backendBruto, permitirLocalhost)
    : null;
  const loginLocalOffPedido =
    (get('ANALYTICS_LOGIN_LOCAL') ?? '').trim().toLowerCase() === 'off';

  let motivo: string | null = null;
  if (!issuer) motivo = 'HUB_OIDC_ISSUER ausente/inválido';
  else if (!clientId) motivo = 'HUB_OIDC_CLIENT_ID ausente';
  else if (clientSecret.length < MIN_SEGREDO)
    motivo = `HUB_OIDC_CLIENT_SECRET ausente/curto (< ${MIN_SEGREDO})`;
  else if (!publico) motivo = 'ANALYTICS_PUBLIC_URL ausente/inválida';
  else if (!portal) motivo = 'HUB_PORTAL_URL ausente/inválida';
  else if (backendBruto && !backend) motivo = 'ANALYTICS_BACKEND_URL inválida';
  const ativo = motivo === null;
  const publicOrigin = publico ? publico.origin : '';
  // Sem ANALYTICS_BACKEND_URL: tudo no host do front (comportamento anterior).
  const backendOrigin = backend ? backend.origin : publicOrigin;
  return {
    ativo,
    motivo,
    issuer: issuer ? issuer.toString().replace(/\/$/, '') : '',
    clientId,
    clientSecret,
    publicOrigin,
    backendOrigin,
    separados: !!backendOrigin && backendOrigin !== publicOrigin,
    redirectUri: backendOrigin ? `${backendOrigin}${CALLBACK_PATH}` : '',
    portalUrl: portal ? portal.toString() : '',
    loginLocalOffPedido,
    // Recusa o "off" sem o cliente ativo: ninguém fica sem login.
    loginLocalFechado: loginLocalOffPedido && ativo,
  };
}

/** Linha(s) de conferência no boot: SEM valores. */
export function resumoHubCliente(s: HubClientSettings): {
  linha: string;
  alerta: string | null;
} {
  const linha = s.ativo
    ? `hub-cliente: ATIVO (client_id=${s.clientId}, callback=${s.separados ? 'backend separado do front' : 'mesmo host do front'}, login local=${s.loginLocalFechado ? 'FECHADO' : 'aberto'})`
    : `hub-cliente: DESLIGADO (${s.motivo})`;
  const alerta =
    s.loginLocalOffPedido && !s.ativo
      ? 'ALERTA hub-cliente: ANALYTICS_LOGIN_LOCAL=off RECUSADO (o cliente do HUB está desligado); o login antigo continua aberto'
      : null;
  return { linha, alerta };
}

/** returnTo: só caminho relativo seguro (até 512); qualquer outra coisa vira "/". */
export function returnToSeguro(v: unknown): string {
  if (typeof v !== 'string' || !v || v.length > 512) return '/';
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\'))
    return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return '/';
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(v)) return '/';
  return v;
}

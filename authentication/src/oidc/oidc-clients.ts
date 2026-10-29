import { PrismaClient } from '@prisma/client';

/** Nome da variável do segredo: OIDC_CLIENT_SECRET_<CLIENTE> (hífen vira _). */
export function secretVarName(clientId: string): string {
  return `OIDC_CLIENT_SECRET_${clientId.toUpperCase().replace(/-/g, '_')}`;
}

/**
 * redirect_uri aceita: https exato (sem fragmento e sem credenciais) ou, se
 * permitido (só homologação/desenvolvimento), http://localhost[:porta].
 */
export function redirectValida(
  uri: string,
  permitirLocalhost: boolean,
): boolean {
  try {
    const u = new URL(uri);
    if (u.hash || u.username || u.password) return false;
    if (u.protocol === 'https:') return !!u.hostname;
    return (
      permitirLocalhost && u.protocol === 'http:' && u.hostname === 'localhost'
    );
  } catch {
    return false;
  }
}

export interface ClientesCarregados {
  /** Metadados no formato do oidc-provider (com o segredo do ambiente). */
  clients: Record<string, unknown>[];
  /** Contagens para a linha do boot (sem nomes nem valores). */
  ativos: number;
  semSegredo: number;
  invalidos: number;
}

/**
 * Clientes ATIVOS do banco + o segredo de cada um, do ambiente. Cliente sem
 * segredo (ou com segredo curto) fica DESLIGADO; cliente com alguma
 * redirect_uri inválida também. O segredo nunca vem do banco nem do repo.
 */
export async function loadClients(
  prisma: PrismaClient,
  get: (name: string) => string | undefined,
): Promise<ClientesCarregados> {
  const permitirLocalhost = get('OIDC_ALLOW_LOCALHOST_REDIRECTS') === 'true';
  const linhas = await prisma.oidcClient.findMany({
    where: { active: true },
    orderBy: { clientId: 'asc' },
  });
  const out: ClientesCarregados = {
    clients: [],
    ativos: 0,
    semSegredo: 0,
    invalidos: 0,
  };
  for (const c of linhas) {
    const segredo = get(secretVarName(c.clientId))?.trim();
    if (!segredo || segredo.length < 32) {
      out.semSegredo++;
      continue;
    }
    const uris = [...c.redirectUris, ...c.postLogoutRedirectUris];
    if (
      !c.redirectUris.length ||
      !uris.every((u) => redirectValida(u, permitirLocalhost))
    ) {
      out.invalidos++;
      continue;
    }
    out.clients.push({
      client_id: c.clientId,
      client_name: c.name,
      client_secret: segredo,
      token_endpoint_auth_method: 'client_secret_basic',
      redirect_uris: c.redirectUris,
      post_logout_redirect_uris: c.postLogoutRedirectUris,
      response_types: ['code'],
      grant_types: ['authorization_code', 'refresh_token'],
    });
    out.ativos++;
  }
  return out;
}

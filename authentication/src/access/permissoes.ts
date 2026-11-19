import { BadRequestException } from '@nestjs/common';

/**
 * Permissões: flags em SystemAccess que NÃO são sistemas. Não têm cartão no
 * portal (launchUrl nula e filtradas no launcher), não entram em convite nem
 * na API legada /api/users, e só quem já tem a permissão a concede ou revoga,
 * pela ficha da pessoa no painel do HUB. Lista FIXA no código, de propósito
 * (como CLIENTES_SESSAO_LONGA): nenhuma mudança de cadastro transforma um
 * sistema em permissão nem o contrário.
 */
export const HUB_ADMIN = 'hub-admin';
export const PERMISSOES: readonly string[] = [HUB_ADMIN];
export const ehPermissao = (key: string) => PERMISSOES.includes(key);

/**
 * Quem usa o painel admin do HUB (/oidc/hub/admin/*): HUB_ADMIN_REGRA.
 * - 'perfil' (padrão): pessoa ATIVA com perfil ADMIN na unidade LHG (a regra
 *   de antes);
 * - 'flag': pessoa ATIVA com a permissão 'hub-admin' ativa.
 * Valor ausente ou desconhecido → 'perfil'. Virar e voltar é só mudar a
 * variável (o serviço reinicia), sem deploy.
 */
export type RegraDoAdmin = 'perfil' | 'flag';
export function lerRegraDoAdmin(valor: string | undefined): RegraDoAdmin {
  return valor?.trim().toLowerCase() === 'flag' ? 'flag' : 'perfil';
}

/**
 * 400 por pedir permissão por um caminho que não pode: PERMISSION_NOT_ALLOWED
 * (API legada) ou PERMISSION_NOT_IN_INVITE (convite).
 */
export function permissaoNaoPermitida(
  keys: string[],
  code:
    | 'PERMISSION_NOT_ALLOWED'
    | 'PERMISSION_NOT_IN_INVITE' = 'PERMISSION_NOT_ALLOWED',
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    message:
      code === 'PERMISSION_NOT_IN_INVITE'
        ? `Permissão não entra em convite: ${keys.join(', ')}`
        : `Permissão não pode ser concedida por aqui: ${keys.join(', ')}`,
    code,
  });
}

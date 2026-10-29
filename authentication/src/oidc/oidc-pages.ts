import { SEM_CONVITE } from '../google/google-login.service';

/** Escapa texto para HTML (atributos e conteúdo). */
export const html = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

/**
 * CSP de TODAS as respostas do /oidc (substitui a do helmet global). Sem
 * script e sem nada externo; o form-action precisa listar as origens para
 * onde um POST de formulário pode terminar redirecionado (o Chrome confere a
 * cadeia de redirects): o próprio issuer, o Google e os clientes (redirect e
 * pós-logout). O script-src não libera nada sozinho ('report-sample' só
 * afeta relatórios): ele existe para o provedor acrescentar o hash do script
 * inline das páginas que se enviam sozinhas (logout sem sessão, form_post).
 */
export function cspDoOidc(origensDosFormularios: string[]): string {
  const destinos = [...new Set(origensDosFormularios)].join(' ');
  return [
    "default-src 'none'",
    "script-src 'report-sample'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    `form-action 'self' ${destinos}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
}

const ESTILO = `body{font-family:system-ui,sans-serif;background:#f4f4f5;margin:0;padding:24px}
main{max-width:360px;margin:40px auto;background:#fff;border-radius:8px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.15)}
h1{font-size:1.25rem;margin:0 0 16px}label{display:block;margin:12px 0 4px;font-size:.9rem}
input{width:100%;box-sizing:border-box;padding:8px;font-size:1rem}
button{width:100%;margin-top:16px;padding:10px;font-size:1rem;cursor:pointer}
.erro{background:#fee2e2;color:#991b1b;padding:8px;border-radius:4px;font-size:.9rem}
.aviso{color:#52525b;font-size:.8rem;margin-top:16px}form.inline{margin:0}`;

function pagina(titulo: string, corpo: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${html(titulo)}</title>
<style>${ESTILO}</style></head><body><main>${corpo}</main></body></html>`;
}

/** Mensagens da tela: o código vem na URL, o texto sai daqui (nunca da URL). */
export function mensagemDeErro(codigo: string | undefined): string | null {
  if (!codigo) return null;
  if (codigo === 'credenciais') return 'E-mail ou senha incorretos';
  if (codigo === 'no_invite') return SEM_CONVITE;
  if (codigo === 'cancelled') return 'Login com Google cancelado.';
  if (codigo === 'google_off') return 'Login com Google indisponível.';
  return 'Não foi possível entrar com o Google.';
}

/**
 * Tela MÍNIMA de login (só homologação, OIDC_MINIMAL_LOGIN_PAGE=true): na
 * produção quem mostra a tela é o HUB (/entrar?uid=...), que envia para as
 * mesmas rotas de interação.
 */
export function paginaLogin(p: {
  acao: string;
  erro: string | null;
  google: boolean;
}): string {
  return pagina(
    'Entrar — LHG',
    `<h1>Entrar</h1>
${p.erro ? `<p class="erro" role="alert">${html(p.erro)}</p>` : ''}
<form method="post" action="${html(p.acao)}/login" autocomplete="on">
<label for="email">E-mail</label><input id="email" name="email" type="email" required autocomplete="username">
<label for="password">Senha</label><input id="password" name="password" type="password" required autocomplete="current-password">
<button type="submit">Entrar</button></form>
${p.google ? `<form class="inline" method="post" action="${html(p.acao)}/google"><button type="submit">Entrar com Google</button></form>` : ''}
<form class="inline" method="post" action="${html(p.acao)}/abort"><button type="submit">Cancelar</button></form>
<p class="aviso">Tela mínima de homologação.</p>`,
  );
}

/** Erro da própria interação (sessão de login vencida, uid errado...). */
export function paginaSessaoInvalida(): string {
  return pagina(
    'Login — LHG',
    `<h1>Não foi possível continuar</h1><p>Sua sessão de login expirou ou é inválida. Volte ao sistema e tente de novo.</p>`,
  );
}

/** renderError do provedor: só o código do erro (nunca detalhes internos). */
export async function renderError(
  ctx: any,
  out: { error?: string },
): Promise<void> {
  ctx.type = 'html';
  ctx.body = pagina(
    'Erro — LHG',
    `<h1>Não foi possível continuar</h1><p>Volte ao sistema e tente de novo.</p><p class="aviso">Código: ${html(out?.error ?? 'erro')}</p>`,
  );
}

/** Confirmação do logout (end_session): o form vem pronto do provedor. */
export async function logoutSource(ctx: any, form: string): Promise<void> {
  ctx.body = pagina(
    'Sair — LHG',
    `<h1>Sair de todos os sistemas da LHG?</h1>${form}
<button autofocus type="submit" form="op.logoutForm" value="yes" name="logout">Sim, sair</button>
<button type="submit" form="op.logoutForm">Não, continuar conectado</button>`,
  );
}

export async function postLogoutSuccessSource(ctx: any): Promise<void> {
  ctx.body = pagina('Saiu — LHG', `<h1>Você saiu.</h1>`);
}

/**
 * Tela "Trocar senha" do login central (o HUB só aponta para ela; a senha
 * nunca passa pelo HUB). Sem script; o CSRF vai num campo oculto preso à
 * sessão SSO.
 */
export function paginaSenha(p: {
  acao: string;
  csrf: string;
  returnTo: string | null;
  erro?: string | null;
}): string {
  const voltar = p.returnTo
    ? `<p class="aviso"><a href="${html(p.returnTo)}">Voltar sem trocar</a></p>`
    : '';
  return pagina(
    'Trocar senha — LHG',
    `<h1>Trocar senha</h1>
${p.erro ? `<p class="erro" role="alert">${html(p.erro)}</p>` : ''}
<form method="post" action="${html(p.acao)}" autocomplete="off">
<input type="hidden" name="csrf" value="${html(p.csrf)}">
${p.returnTo ? `<input type="hidden" name="return_to" value="${html(p.returnTo)}">` : ''}
<label for="atual">Senha atual</label><input id="atual" name="senha_atual" type="password" required autocomplete="current-password">
<label for="nova">Nova senha (mínimo 10 caracteres)</label><input id="nova" name="senha_nova" type="password" required minlength="10" autocomplete="new-password">
<label for="conf">Confirme a nova senha</label><input id="conf" name="confirmacao" type="password" required minlength="10" autocomplete="new-password">
<button type="submit">Trocar senha</button></form>
${voltar}
<p class="aviso">Ao trocar, as suas outras sessões são encerradas; esta continua.</p>`,
  );
}

/** Resultado da troca (quando não há para onde voltar) ou falta de sessão. */
export function paginaAviso(titulo: string, texto: string): string {
  return pagina(
    `${titulo} — LHG`,
    `<h1>${html(titulo)}</h1><p>${html(texto)}</p>`,
  );
}

import * as crypto from 'crypto';
import { SEM_CONVITE } from '../google/google-login.service';

/** Fonte do CSP para um trecho inline ('sha256-...'). */
const sha256 = (s: string) =>
  `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

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
 * afeta relatórios): ele existe para acrescentar, por resposta, o hash do
 * script inline das páginas que se enviam sozinhas (logout sem sessão,
 * form_post, saída direta com id_token_hint). O style-src libera só o hash
 * do <style> fixo das páginas, sem 'unsafe-inline'.
 */
export function cspDoOidc(origensDosFormularios: string[]): string {
  const destinos = [...new Set(origensDosFormularios)].join(' ');
  return [
    "default-src 'none'",
    "script-src 'report-sample'",
    `style-src ${sha256(ESTILO)}`,
    "img-src 'self' data:",
    `form-action 'self' ${destinos}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/**
 * Visual do HUB (direção A): fundo em gradiente roxo (#4A3059) com um
 * mosaico suave feito só com CSS, cartão central claro ou escuro conforme o
 * aparelho, marca LHG | HUB em SVG inline e fonte do sistema (nada externo,
 * por causa do CSP). Texto FIXO: o hash dele vai no style-src.
 */
const ESTILO = `:root{color-scheme:light dark;--roxo:#4A3059;--roxo-claro:#6B4A80;--cartao:#fff;--texto:#1f1a24;--suave:#5f5868;--borda:#d9d2e0;--campo:#fff;--marca:#4A3059}
@media (prefers-color-scheme:dark){:root{--cartao:#221a29;--texto:#f2eef5;--suave:#b6aec0;--borda:#3d3248;--campo:#2b2233;--marca:#d9c2ea}}
*{box-sizing:border-box}
html{background:#4A3059}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--texto);margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background-color:#4A3059;background-image:linear-gradient(45deg,rgba(255,255,255,.035) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.035) 75%),linear-gradient(45deg,rgba(255,255,255,.035) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.035) 75%),linear-gradient(160deg,#5c3a70 0%,#4A3059 45%,#2c1a37 100%);background-size:56px 56px,56px 56px,100% 100%;background-position:0 0,28px 28px,0 0;background-attachment:fixed}
main{width:100%;max-width:380px;background:var(--cartao);border-radius:16px;padding:28px 24px;box-shadow:0 18px 48px rgba(20,8,28,.45)}
.marca{display:block;margin:0 0 22px;color:var(--marca);height:24px;width:auto}
h1{font-size:1.3rem;margin:0 0 12px;line-height:1.3}p{line-height:1.5;margin:0 0 12px}
.saindo{text-align:center;padding:12px 0 4px}.saindo .marca{margin:0 auto 22px}
.spinner{width:40px;height:40px;margin:4px auto 18px;border-radius:50%;border:4px solid var(--borda);border-top-color:var(--roxo-claro);animation:girar .8s linear infinite}
@media (prefers-color-scheme:dark){.spinner{border-top-color:#c7a9dc}}
@media (prefers-reduced-motion:reduce){.spinner{animation-duration:2.4s}}
@keyframes girar{to{transform:rotate(360deg)}}
label{display:block;margin:14px 0 6px;font-size:.9rem;color:var(--suave)}
input{width:100%;padding:10px 12px;font-size:1rem;border:1px solid var(--borda);border-radius:8px;background:var(--campo);color:var(--texto)}
button{width:100%;margin-top:14px;padding:12px;font-size:1rem;font-weight:600;border-radius:8px;cursor:pointer;border:1px solid var(--roxo);background:var(--roxo);color:#fff}
button.secundario{background:transparent;color:var(--texto);border-color:var(--borda)}
button:focus-visible,a:focus-visible{outline:3px solid #c7a9dc;outline-offset:2px}
a{color:inherit}
.erro{background:#fde8e8;color:#8f1d1d;padding:10px 12px;border-radius:8px;font-size:.9rem}
.aviso{color:var(--suave);font-size:.8rem;margin-top:16px}form.inline{margin:0}`;

/** Marca "LHG | HUB" em SVG inline (sem imagem nem fonte externa). */
const MARCA = `<svg class="marca" role="img" aria-label="LHG | HUB" viewBox="0 0 124 24" width="124" height="24"><text x="0" y="19" font-size="20" font-weight="800" letter-spacing="1.5" fill="currentColor">LHG</text><rect x="58" y="3" width="2" height="18" rx="1" fill="currentColor" opacity=".4"/><text x="70" y="19" font-size="20" font-weight="400" letter-spacing="1.5" fill="currentColor">HUB</text></svg>`;

/**
 * Página do /oidc no visual do HUB. `script` (opcional) já vem pronto e vai
 * no FIM do corpo (roda assim que o formulário existe); o hash dele vai no
 * CSP da resposta. `classe` vai no cartão.
 */
function pagina(
  titulo: string,
  corpo: string,
  script = '',
  classe = '',
): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light dark"><title>${html(titulo)}</title>
<style>${ESTILO}</style></head><body><main${classe ? ` class="${classe}"` : ''}>${MARCA}${corpo}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

/**
 * Acrescenta o hash de um script inline ao script-src do CSP desta resposta
 * (o mesmo que o provedor faz nas páginas dele). Sem CSP ou sem script-src,
 * não mexe.
 */
function liberarScript(ctx: any, script: string): void {
  const csp: string | undefined = ctx.response.get('content-security-policy');
  if (!csp || !/(^|;)\s*script-src\s/.test(csp)) return;
  ctx.set(
    'content-security-policy',
    csp.replace(/(^|;)(\s*script-src\s[^;]*)/, `$1$2 ${sha256(script)}`),
  );
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

// No fim do corpo: o formulário já existe, o envio é imediato (sem esperar).
const ENVIAR_SAIDA = "document.getElementById('op.logoutForm').submit();";

/**
 * Saída DIRETA, sem confirmação: só quando o provedor já VALIDOU o
 * id_token_hint (assinatura e emissor; aud = cliente cadastrado, que tem de
 * bater com o client_id, se veio) e a post_logout_redirect_uri (cadastrada
 * para esse cliente), e o hint é da MESMA pessoa da sessão SSO. Um hint
 * VENCIDO vale (o provedor ignora o exp no end_session; o id_token dura
 * 10 min). Sem hint, ou com hint de outra pessoa, a confirmação aparece: um
 * link solto não derruba a sessão de ninguém sem clique.
 */
export function saidaDireta(ctx: any): boolean {
  const hint = ctx.oidc?.entities?.IdTokenHint?.payload;
  const client = ctx.oidc?.client;
  const accountId = ctx.oidc?.session?.accountId;
  if (!hint || !client || !accountId) return false;
  const aud: unknown[] = Array.isArray(hint.aud) ? hint.aud : [hint.aud];
  return (
    aud.includes(client.clientId) &&
    hint.sub === accountId &&
    typeof ctx.oidc.params?.post_logout_redirect_uri === 'string'
  );
}

/**
 * end_session com sessão. O form vem pronto do provedor (xsrf). Com hint
 * validado: o form se envia sozinho, com logout=yes ("sair de tudo"), e um
 * botão "Continuar" de reserva para quem não tem JavaScript. Sem hint: a
 * confirmação.
 */
export async function logoutSource(ctx: any, form: string): Promise<void> {
  if (saidaDireta(ctx)) {
    const reserva =
      '<input type="hidden" name="logout" value="yes"/>' +
      '<noscript><button autofocus type="submit">Continuar</button></noscript></form>';
    liberarScript(ctx, ENVIAR_SAIDA);
    ctx.body = pagina(
      'Saindo — HUB LHG',
      `<div class="spinner" aria-hidden="true"></div><h1 role="status">Saindo do HUB LHG…</h1>${form.replace(/<\/form>\s*$/, reserva)}`,
      ENVIAR_SAIDA,
      'saindo',
    );
    return;
  }
  ctx.body = pagina(
    'Sair — LHG',
    `<h1>Sair de todos os sistemas da LHG?</h1><p>A sua sessão será encerrada em todos os sistemas.</p>${form}
<button autofocus type="submit" form="op.logoutForm" value="yes" name="logout">Sair</button>
<button class="secundario" type="submit" form="op.logoutForm">Continuar conectado</button>`,
  );
}

export async function postLogoutSuccessSource(ctx: any): Promise<void> {
  ctx.body = pagina(
    'Você saiu — LHG',
    `<h1>Você saiu.</h1><p>A sua sessão foi encerrada. Pode fechar esta página.</p>`,
  );
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

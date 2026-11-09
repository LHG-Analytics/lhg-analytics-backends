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
/**
 * Origens https EXATAS (sem caminho, sem curinga), separadas por vírgula.
 * Qualquer item inválido é ignorado: nunca vira "*" nem "https:".
 */
export function origensHttpsExatas(bruto: string | undefined): string[] {
  const out: string[] = [];
  for (const item of (bruto ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)) {
    try {
      const u = new URL(item);
      if (
        u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        u.hostname &&
        !u.hostname.includes('*')
      ) {
        out.push(u.origin);
      }
    } catch {
      /* ignora */
    }
  }
  return out;
}

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
.aviso{color:var(--suave);font-size:.8rem;margin-top:16px}form.inline{margin:0}
[hidden]{display:none!important}
a.botao{display:block;box-sizing:border-box;width:100%;margin-top:14px;padding:12px;font-size:1rem;font-weight:600;text-align:center;text-decoration:none;border-radius:8px;border:1px solid var(--borda);color:var(--texto)}
.ou{text-align:center;color:var(--suave);font-size:.85rem;margin:18px 0 0}
.dados{margin:0 0 6px;padding:12px 14px;border:1px solid var(--borda);border-radius:10px;font-size:.92rem}
.dados dt{color:var(--suave);font-size:.8rem;margin-top:8px}.dados dt:first-child{margin-top:0}.dados dd{margin:2px 0 0;font-weight:600}`;

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
  const novo = cspComScript(csp, script);
  if (novo) ctx.set('content-security-policy', novo);
}

/** O CSP `csp` com o hash de `script` no script-src (ou null, se não houver). */
export function cspComScript(
  csp: string | undefined,
  script: string,
): string | null {
  if (!csp || !/(^|;)\s*script-src\s/.test(csp)) return null;
  return csp.replace(/(^|;)(\s*script-src\s[^;]*)/, `$1$2 ${sha256(script)}`);
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
<form id="form-entrar" method="post" action="${html(p.acao)}/login" autocomplete="on">
<label for="email">E-mail</label><input id="email" name="email" type="email" required autocomplete="username">
<label for="password">Senha</label><input id="password" name="password" type="password" required autocomplete="current-password">
<button id="botao-entrar" type="submit">Entrar</button>
<p id="aviso-entrar" class="erro" role="status" hidden></p></form>
${p.google ? `<form class="inline" method="post" action="${html(p.acao)}/google"><button type="submit">Entrar com Google</button></form>` : ''}
<form class="inline" method="post" action="${html(p.acao)}/abort"><button type="submit">Cancelar</button></form>
<p class="aviso">Tela mínima de homologação.</p>
<script>${SCRIPT_ENTRAR}</script>`,
  );
}

/** Sem resposta do servidor depois disto, o "Entrar" volta e avisa. */
export const ENTRAR_LIMITE_MS = 20000;

/**
 * "Entrar" INATIVO do 1º envio até a página trocar (padrão de mercado):
 * - o 1º submit SEGUE sem interferência; o botão é desligado no próximo tique
 *   (setTimeout 0, com o formulário já serializado), com aria-disabled e
 *   pointer-events:none: o 2º clique não gera NENHUM evento;
 * - o Enter nos campos é barrado no keydown, sem tocar no envio em curso;
 * - libera no pageshow (voltar pelo histórico/bfcache) ou depois de
 *   ENTRAR_LIMITE_MS sem resposta, com "Demorou mais que o normal. Tente de novo."
 * Nenhum preventDefault/stopPropagation no meio da navegação do 1º envio.
 * Texto FIXO: o hash dele entra no script-src da resposta (cspComScript).
 */
export const SCRIPT_ENTRAR = [
  "(function(){var f=document.getElementById('form-entrar'),b=document.getElementById('botao-entrar'),a=document.getElementById('aviso-entrar');",
  'if(!f||!b)return;var t=b.textContent,enviando=false,relogio=0;',
  "function travar(){b.disabled=true;b.setAttribute('aria-disabled','true');b.style.pointerEvents='none';b.textContent='Entrando…'}",
  "function liberar(msg){enviando=false;clearTimeout(relogio);b.disabled=false;b.removeAttribute('aria-disabled');b.style.pointerEvents='';b.textContent=t;if(a){a.textContent=msg||'';a.hidden=!msg}}",
  // o 1º submit segue; só os seguintes (antes do 1º tique) são descartados
  "f.addEventListener('submit',function(e){if(enviando){e.preventDefault();return}enviando=true;if(a)a.hidden=true;setTimeout(travar,0);",
  `relogio=setTimeout(function(){liberar('Demorou mais que o normal. Tente de novo.')},${ENTRAR_LIMITE_MS})});`,
  "f.addEventListener('keydown',function(e){if(enviando&&e.key==='Enter')e.preventDefault()});",
  "window.addEventListener('pageshow',function(){liberar('')})})();",
].join('');

/** "Voltar" da interação perdida (history.back), com hash no script-src. */
export const SCRIPT_VOLTAR =
  "document.getElementById('voltar').addEventListener('click',function(){history.back()});";

/**
 * Interação perdida SEM destino conhecido (b2): em vez do beco sem saída,
 * os botões "Ir para o HUB LHG" (portal, se configurado) e "Voltar".
 */
/**
 * Continuação do login por GET (a "página intermediária"). O form-action do
 * CSP vale também para os REDIRECIONAMENTOS depois de um envio de formulário
 * (o Chrome confere a cadeia toda): o login termina no host do sistema (ex.:
 * o front do Analytics), que não está — nem tem como estar, a lista é aberta
 * — no form-action. Responder 200 com esta página ENCERRA a cadeia do
 * formulário; a navegação seguinte é um GET comum, fora do form-action.
 * O destino vem do provedor (returnTo da interação) ou do banco (launchUrl).
 */
export function paginaContinuar(destino: string): string {
  return pagina(
    'Entrando — LHG',
    `<h1>Entrando…</h1><p><a id="continuar" class="botao" href="${html(destino)}">Continuar</a></p>
<script>${SCRIPT_CONTINUAR}</script>`,
  );
}

/** Segue para o href do "Continuar" sem deixar a página no histórico. Hash no CSP. */
export const SCRIPT_CONTINUAR =
  "location.replace(document.getElementById('continuar').href);";

export function paginaInteracaoPerdida(portal: string | null): string {
  return pagina(
    'Login — LHG',
    `<h1>Não foi possível continuar</h1><p>Sua sessão de login expirou ou já foi concluída.</p>
${portal ? `<p><a class="botao" href="${html(portal)}">Ir para o HUB LHG</a></p>` : ''}
<p><button id="voltar" class="secundario" type="button">Voltar</button></p>
<script>${SCRIPT_VOLTAR}</script>`,
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

// ── Aceite do convite (/oidc/convite) ───────────────────────────────────

/**
 * Lê o token do FRAGMENTO (#<token> ou #token=<token>; o fragmento nunca vai
 * ao servidor nem aos logs), apaga o fragmento da barra e envia o token por
 * POST (corpo), também nunca em query string.
 */
export const ABRIR_CONVITE =
  "(function(){var h=location.hash.slice(1),t=h.indexOf('token=')===0?h.slice(6):h;try{t=decodeURIComponent(t)}catch(e){t=''}try{history.replaceState(null,'',location.pathname)}catch(e){}if(t){var f=document.getElementById('convite');f.elements.token.value=t;f.submit()}else{document.getElementById('abrindo').hidden=true;document.getElementById('sem-token').hidden=false}})();";

/** GET /convite: só abre o convite (o token está no fragmento). */
export function paginaConviteAbrindo(acao: string): string {
  return pagina(
    'Convite — HUB LHG',
    `<div id="abrindo"><div class="spinner" aria-hidden="true"></div><h1 role="status">Abrindo o seu convite…</h1></div>
<div id="sem-token" hidden><h1>Link de convite incompleto</h1><p>Abra o link exatamente como chegou no e-mail ou na mensagem. Se não der certo, peça um novo convite ao suporte técnico.</p></div>
<noscript><p class="erro">Para abrir o convite, ative o JavaScript do navegador.</p></noscript>
<form id="convite" method="post" action="${html(acao)}"><input type="hidden" name="token" value=""></form>`,
    ABRIR_CONVITE,
    'saindo',
  );
}

const dataBr = (d: Date | null) =>
  d
    ? d.toLocaleDateString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'sem data de validade';

/** POST /convite: os dados do convite e as duas formas de aceitar. */
export function paginaConvite(p: {
  acaoSenha: string;
  token: string;
  nome: string | null;
  emailMasked: string;
  sistemas: string[];
  expiresAt: Date | null;
  entrar: string | null;
  erro?: string | null;
  minimo: number;
}): string {
  return pagina(
    'Convite — HUB LHG',
    `<h1>${p.nome ? `Olá, ${html(p.nome)}` : 'Você foi convidado'}</h1>
<p>Você recebeu acesso ao HUB LHG. Confira e escolha como vai entrar.</p>
<dl class="dados"><dt>E-mail</dt><dd>${html(p.emailMasked)}</dd>
<dt>Sistemas</dt><dd>${p.sistemas.length ? p.sistemas.map(html).join(', ') : 'Nenhum por enquanto'}</dd>
<dt>Convite válido até</dt><dd>${html(dataBr(p.expiresAt))}</dd></dl>
${p.erro ? `<p class="erro" role="alert">${html(p.erro)}</p>` : ''}
<form method="post" action="${html(p.acaoSenha)}" autocomplete="off">
<input type="hidden" name="token" value="${html(p.token)}">
<label for="senha">Crie uma senha (mínimo ${p.minimo} caracteres)</label><input id="senha" name="senha" type="password" required minlength="${p.minimo}" autocomplete="new-password">
<label for="confirmacao">Confirme a senha</label><input id="confirmacao" name="confirmacao" type="password" required minlength="${p.minimo}" autocomplete="new-password">
<button type="submit">Definir senha</button></form>
${
  p.entrar
    ? `<p class="ou">ou</p><a class="botao" href="${html(p.entrar)}">Entrar com Google</a>
<p class="aviso">Com o Google, use a conta do e-mail do convite.</p>`
    : ''
}`,
  );
}

/** Convite que não serve (não revela o motivo: vencido, usado ou revogado). */
export function paginaConviteInvalido(entrar: string | null): string {
  return pagina(
    'Convite — HUB LHG',
    `<h1>Este convite não vale mais</h1><p>Ele pode ter vencido, já ter sido usado ou ter sido cancelado. Peça um novo convite ao suporte técnico.</p>${
      entrar
        ? `<p class="aviso">Se você já criou a sua conta, é só <a href="${html(entrar)}">entrar no HUB</a>.</p>`
        : ''
    }`,
  );
}

import { escaparHtml } from './email.service';

/**
 * Identidade do HUB nos e-mails do login central (passada pelo HUB LHG em
 * 19/11/2026): faixa roxa com o logo BRANCO e o selo "HUB" em HTML (a faixa
 * continua roxa nos clientes que invertem cores no modo escuro), cartão
 * branco, botão sólido. Só a imagem do logo, do domínio da LHG: nada de
 * rastreador nem imagem de terceiros.
 */
export const COR = {
  roxo: '#4A3059',
  fundo: '#F3EFF6',
  cartao: '#FFFFFF',
  borda: '#DDD5E3',
  texto: '#1F1626',
  suave: '#625A6B',
} as const;
const FONTE = 'Manrope, Arial, Helvetica, sans-serif';

/**
 * Logo branco (PNG 156x48, exibido a 117x36), no endereço estável só para
 * e-mail (lhg-hub #28). EMAIL_LOGO_URL troca sem deploy (ex.: um logo maior).
 */
export const LOGO_PADRAO =
  'https://hub.lhgmoteis.com.br/email/logo-lhg-branco.png';
export const SUPORTE_EMAIL = 'danilo@lhgmoteis.com.br';
export const SUPORTE_URL = 'https://hub.lhgmoteis.com.br/suporte';

export interface ConteudoDoEmail {
  /** Texto curto que o Gmail mostra ao lado do assunto (escondido no corpo). */
  previa: string;
  titulo: string;
  paragrafos: string[];
  /** Pares rótulo/valor numa caixa (ex.: Sistemas, Válido até). */
  detalhes?: [string, string][];
  botao: { texto: string; url: string };
  /** Linha final: por que a pessoa recebeu (e o que fazer se não esperava). */
  motivo: string;
  /** URL https do logo (padrão LOGO_PADRAO). */
  logoUrl?: string;
}

/** Só https, sem credenciais; senão, o padrão. */
function logoHttps(v: string | undefined): string | null {
  try {
    const u = new URL(String(v ?? '').trim());
    return u.protocol === 'https:' && !u.username && !u.password
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}

const p = (t: string) =>
  `<p style="margin:0 0 16px;font-family:${FONTE};font-size:15px;line-height:24px;color:${COR.texto};">${escaparHtml(t)}</p>`;

/** HTML de e-mail robusto (tabelas, CSS inline, 600 px) + a versão texto. */
export function emailDoHub(c: ConteudoDoEmail): {
  html: string;
  texto: string;
} {
  const logo = escaparHtml(
    c.logoUrl ?? logoHttps(process.env.EMAIL_LOGO_URL) ?? LOGO_PADRAO,
  );
  const url = escaparHtml(c.botao.url);
  const detalhes = c.detalhes?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 24px;background:${COR.fundo};border:1px solid ${COR.borda};border-radius:8px;">
${c.detalhes
  .map(
    ([r, v], i) =>
      `<tr><td style="padding:${i ? '0' : '14px'} 16px 14px;font-family:${FONTE};font-size:13px;line-height:20px;color:${COR.suave};">${escaparHtml(r)}<br><span style="font-size:15px;font-weight:600;color:${COR.texto};">${escaparHtml(v)}</span></td></tr>`,
  )
  .join('\n')}
</table>`
    : '';
  const html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escaparHtml(c.titulo)}</title>
<!--[if mso]><style>table,td,a,p,h1{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>
  body{margin:0;padding:0;}
  @media only screen and (max-width:620px){
    .conteudo{padding:28px 20px !important;}
    .faixa{padding:18px 20px !important;}
    .botao a{display:block !important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COR.fundo};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escaparHtml(c.previa)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${COR.fundo}" style="background:${COR.fundo};">
<tr><td align="center" style="padding:28px 12px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
<tr><td class="faixa" bgcolor="${COR.roxo}" style="background:${COR.roxo};padding:20px 32px;border-radius:12px 12px 0 0;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
    <td style="vertical-align:middle;"><img src="${logo}" width="117" height="36" alt="LHG" style="display:block;border:0;outline:none;text-decoration:none;height:36px;width:117px;color:#FFFFFF;font-family:${FONTE};font-size:20px;font-weight:800;"></td>
    <td style="vertical-align:middle;padding-left:12px;"><span style="display:inline-block;background:#FFFFFF;color:${COR.roxo};font-family:${FONTE};font-weight:800;font-size:11px;letter-spacing:2px;padding:5px 9px;border-radius:7px;line-height:14px;">HUB</span></td>
  </tr></table>
</td></tr>
<tr><td class="conteudo" bgcolor="${COR.cartao}" style="background:${COR.cartao};padding:36px 32px 32px;border:1px solid ${COR.borda};border-top:0;border-radius:0 0 12px 12px;">
  <h1 style="margin:0 0 20px;font-family:${FONTE};font-size:24px;line-height:32px;font-weight:800;color:${COR.texto};">${escaparHtml(c.titulo)}</h1>
  ${c.paragrafos.map(p).join('\n  ')}
  ${detalhes}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="botao" style="margin:8px 0 28px;">
  <tr><td align="center" bgcolor="${COR.roxo}" style="border-radius:8px;background:${COR.roxo};">
  <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="16%" stroke="f" fillcolor="${COR.roxo}"><w:anchorlock/><center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escaparHtml(c.botao.texto)}</center></v:roundrect><![endif]-->
  <!--[if !mso]><!--><a href="${url}" target="_blank" style="display:inline-block;padding:15px 32px;font-family:${FONTE};font-size:16px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;background:${COR.roxo};">${escaparHtml(c.botao.texto)}</a><!--<![endif]-->
  </td></tr></table>
  <p style="margin:0 0 6px;font-family:${FONTE};font-size:13px;line-height:20px;color:${COR.suave};">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
  <p style="margin:0;font-family:${FONTE};font-size:13px;line-height:20px;word-break:break-all;"><a href="${url}" target="_blank" style="color:${COR.roxo};text-decoration:underline;">${url}</a></p>
</td></tr>
<tr><td style="padding:24px 32px 8px;font-family:${FONTE};font-size:12px;line-height:19px;color:${COR.suave};text-align:center;">
  <p style="margin:0 0 10px;">${escaparHtml(c.motivo)}</p>
  <p style="margin:0 0 10px;">Dúvidas? Fale com o suporte técnico da LHG: <a href="mailto:${SUPORTE_EMAIL}" style="color:${COR.roxo};">${SUPORTE_EMAIL}</a> · <a href="${SUPORTE_URL}" style="color:${COR.roxo};">hub.lhgmoteis.com.br/suporte</a></p>
  <p style="margin:0;font-weight:600;">HUB LHG · Este é um e-mail automático; não responda.</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
  const texto = [
    'HUB LHG',
    '',
    c.titulo,
    '',
    ...c.paragrafos.flatMap((t) => [t, '']),
    ...(c.detalhes?.length
      ? [...c.detalhes.map(([r, v]) => `${r}: ${v}`), '']
      : []),
    `${c.botao.texto}:`,
    c.botao.url,
    '',
    '--',
    c.motivo,
    `Dúvidas? Fale com o suporte técnico da LHG: ${SUPORTE_EMAIL} · ${SUPORTE_URL}`,
    'HUB LHG · Este é um e-mail automático; não responda.',
  ].join('\n');
  return { html, texto };
}

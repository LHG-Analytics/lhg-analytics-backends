import { Logger } from '@nestjs/common';

/** Remetente fixo do login central (domínio verificado no Resend). */
export const REMETENTE = 'HUB LHG <nao-responda@lhgmoteis.com.br>';
export const RESEND_URL = 'https://api.resend.com/emails';
/** Espera máxima por envio: quem chama segue com o link mesmo se falhar. */
export const EMAIL_TIMEOUT_MS = 5000;

export type ErroEmail = 'NAO_CONFIGURADO' | 'FALHA_ENVIO';
export type ResultadoEmail =
  | { enviado: true }
  | { enviado: false; erro: ErroEmail };

export interface Mensagem {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

/**
 * Envio de e-mail pela API do Resend (RESEND_API_KEY: chave própria do
 * authentication, só de envio). Sem a chave, nada é enviado
 * (NAO_CONFIGURADO). Erro de rede, timeout ou resposta não 2xx → FALHA_ENVIO.
 * Nunca lança, e nunca registra destinatário, assunto, conteúdo nem a chave:
 * o log diz só o status HTTP.
 */
export class EmailService {
  private readonly logger = new Logger('Email');
  private readonly chave: string | null;

  constructor(
    get: (name: string) => string | undefined,
    private readonly enviarHttp: typeof fetch = fetch,
  ) {
    const k = get('RESEND_API_KEY')?.trim();
    this.chave = k ? k : null;
  }

  get configurado(): boolean {
    return this.chave !== null;
  }

  async enviar(m: Mensagem): Promise<ResultadoEmail> {
    if (!this.chave) return { enviado: false, erro: 'NAO_CONFIGURADO' };
    try {
      const r = await this.enviarHttp(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.chave}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: REMETENTE,
          to: [m.para],
          subject: m.assunto,
          html: m.html,
          text: m.texto,
        }),
        signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
      });
      if (r.ok) return { enviado: true };
      this.logger.warn(`email: envio recusado pelo Resend (HTTP ${r.status})`);
    } catch (e) {
      this.logger.warn(
        `email: falha no envio (${(e as Error)?.name ?? 'erro'})`,
      );
    }
    return { enviado: false, erro: 'FALHA_ENVIO' };
  }
}

/** Texto seguro dentro do HTML do e-mail. */
export function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Moldura comum dos e-mails do HUB: título, parágrafos, um botão e o rodapé. */
export function emailComBotao(o: {
  titulo: string;
  paragrafos: string[];
  botao: { texto: string; url: string };
  rodape: string;
}): { html: string; texto: string } {
  const p = (t: string) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1f2933">${escaparHtml(t)}</p>`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:28px">
<tr><td>
<h1 style="margin:0 0 18px;font-size:20px;color:#111827">${escaparHtml(o.titulo)}</h1>
${o.paragrafos.map(p).join('\n')}
<p style="margin:22px 0"><a href="${escaparHtml(o.botao.url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-size:15px">${escaparHtml(o.botao.texto)}</a></p>
<p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:#52606d">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all">${escaparHtml(o.botao.url)}</span></p>
<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#7b8794">${escaparHtml(o.rodape)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const texto = [
    o.titulo,
    '',
    ...o.paragrafos.flatMap((t) => [t, '']),
    `${o.botao.texto}: ${o.botao.url}`,
    '',
    o.rodape,
  ].join('\n');
  return { html, texto };
}

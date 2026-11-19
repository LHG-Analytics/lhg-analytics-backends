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

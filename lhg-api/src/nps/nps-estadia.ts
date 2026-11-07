/**
 * Endpoint A do NPS (QR exclusivo): validação da consulta e conversão de horas.
 *
 * O Automo grava timestamp SEM fuso, na hora local de São Paulo. O relógio do
 * servidor da réplica está ~9 min adiantado: a janela NUNCA usa o now() do
 * banco; ela parte do `agora` enviado pelo NPS (conferido contra o relógio
 * deste servidor) e entra no SQL como parâmetro.
 */
import * as moment from 'moment-timezone';
import { getTenant } from '../tenant/tenant.registry';
import { TenantConfig } from '../tenant/tenant.interfaces';

export const FUSO_AUTOMO = 'America/Sao_Paulo';
export const JANELA_PADRAO_MIN = 120;
export const JANELA_MAX_MIN = 240;
/** Diferença máxima aceita entre `agora` e o relógio deste servidor. */
export const AGORA_TOLERANCIA_S = 300;

const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export interface ConsultaEstadia {
  tenant: TenantConfig;
  suite: number;
  janelaMin: number;
  /** Início da janela pós-check-out, na hora local do Automo (sem fuso). */
  limiteLocal: string;
}

export type LeituraConsulta = { ok: true; consulta: ConsultaEstadia } | { ok: false; erro: string };

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);

/** Hora (ms) → texto local do Automo, para comparar com as colunas sem fuso. */
export function paraLocalAutomo(ms: number): string {
  return moment.tz(ms, FUSO_AUTOMO).format('YYYY-MM-DD HH:mm:ss.SSS');
}

/** Texto local do Automo (sem fuso) → ISO 8601 com o deslocamento de São Paulo. */
export function deLocalAutomo(local: string | null): string | null {
  return local ? moment.tz(local, 'YYYY-MM-DDTHH:mm:ss.SSS', FUSO_AUTOMO).format('YYYY-MM-DDTHH:mm:ssZ') : null;
}

export function lerConsultaEstadia(q: Record<string, unknown>, agoraServidorMs: number): LeituraConsulta {
  const tenant = getTenant(texto(q.unidade) ?? '');
  if (!tenant) return { ok: false, erro: 'unidade inválida' };

  const suiteTxt = texto(q.suite) ?? '';
  if (!/^\d{1,6}$/.test(suiteTxt)) return { ok: false, erro: 'suite inválida' };

  const agoraTxt = texto(q.agora) ?? '';
  const agoraMs = ISO_COM_FUSO.test(agoraTxt) ? Date.parse(agoraTxt) : NaN;
  if (!Number.isFinite(agoraMs)) return { ok: false, erro: 'agora inválido (ISO 8601 com fuso)' };
  if (Math.abs(agoraMs - agoraServidorMs) > AGORA_TOLERANCIA_S * 1000) {
    return { ok: false, erro: 'agora fora da tolerância' };
  }

  const janelaTxt = texto(q.janela_min);
  let janelaMin = JANELA_PADRAO_MIN;
  if (janelaTxt !== undefined) {
    if (!/^\d{1,3}$/.test(janelaTxt) || Number(janelaTxt) > JANELA_MAX_MIN) {
      return { ok: false, erro: `janela_min inválida (0 a ${JANELA_MAX_MIN})` };
    }
    janelaMin = Number(janelaTxt);
  }

  return {
    ok: true,
    consulta: {
      tenant,
      suite: Number(suiteTxt),
      janelaMin,
      limiteLocal: paraLocalAutomo(agoraMs - janelaMin * 60_000),
    },
  };
}

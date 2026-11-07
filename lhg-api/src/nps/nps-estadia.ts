/**
 * Endpoints do NPS: validação das consultas e conversão de horas.
 *
 * O Automo grava timestamp SEM fuso, na hora local de São Paulo. O relógio do
 * servidor da réplica está ~9 min adiantado: nenhuma janela usa o now() do
 * banco. Ela parte do `agora` do NPS (Endpoint A, conferido contra o relógio
 * deste servidor), da marca d'água `desde` (B) ou do relógio deste servidor (C),
 * e entra no SQL como parâmetro.
 */
import * as moment from 'moment-timezone';
import { getTenant } from '../tenant/tenant.registry';
import { TenantConfig } from '../tenant/tenant.interfaces';

export const FUSO_AUTOMO = 'America/Sao_Paulo';
export const JANELA_PADRAO_MIN = 120;
export const JANELA_MAX_MIN = 240;
/** Diferença máxima aceita entre `agora` e o relógio deste servidor. */
export const AGORA_TOLERANCIA_S = 300;
/** Endpoint B: o `desde` pode voltar no máximo isto (sem varrer o histórico). */
export const CHECKOUTS_MAX_DIAS = 31;
export const CHECKOUTS_LIMITE_PADRAO = 500;
export const CHECKOUTS_LIMITE_MAX = 1000;
/** Endpoint C: o celular só sai para check-out nas últimas 72h (validade do convite). */
export const CONTATO_JANELA_H = 72;

const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const REF = /^\d{1,12}$/;

export interface ConsultaEstadia {
  tenant: TenantConfig;
  /** Número da suíte; ou `raiz`, para responder pela suíte ATUAL da cadeia. */
  suite: number | null;
  raiz: string | null;
  janelaMin: number;
  /** Início da janela pós-check-out, na hora local do Automo (sem fuso). */
  limiteLocal: string;
}

export interface ConsultaCheckouts {
  tenant: TenantConfig;
  /** Marca d'água (inclusive), hora local do Automo. */
  desdeLocal: string;
  /** Desempate da paginação: com ele, vale (fim, ref) > (desde, aposRef). */
  aposRef: string | null;
  limite: number;
}

export interface ConsultaContato {
  tenant: TenantConfig;
  locacao: string;
  /** Check-out mais antigo aceito (agora deste servidor − 72h), hora local do Automo. */
  limiteLocal: string;
}

type Leitura<T> = { ok: true; consulta: T } | { ok: false; erro: string };

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
const isoComFuso = (v: unknown) => {
  const t = texto(v) ?? '';
  return ISO_COM_FUSO.test(t) ? Date.parse(t) : NaN;
};

/** Hora (ms) → texto local do Automo, para comparar com as colunas sem fuso. */
export function paraLocalAutomo(ms: number): string {
  return moment.tz(ms, FUSO_AUTOMO).format('YYYY-MM-DD HH:mm:ss.SSS');
}

/** Texto local do Automo (sem fuso) → ISO 8601 com o deslocamento de São Paulo. */
export function deLocalAutomo(local: string | null, comMs = false): string | null {
  return local
    ? moment
        .tz(local, 'YYYY-MM-DDTHH:mm:ss.SSS', FUSO_AUTOMO)
        .format(comMs ? 'YYYY-MM-DDTHH:mm:ss.SSSZ' : 'YYYY-MM-DDTHH:mm:ssZ')
    : null;
}

/**
 * Celular brasileiro, só dígitos: DDD + 9 + 8 dígitos, com 55 ou 0 opcional na
 * frente. É o MESMO padrão no SQL (tem_contato do Endpoint B, como parâmetro) e
 * aqui (Endpoint C): o B nunca diz "tem contato" para um número que o C recusa.
 */
export const CELULAR_BR_DIGITOS = '^(55|0)?[1-9][1-9]9[0-9]{8}$';

/**
 * Celular brasileiro em E.164, ou null. O Automo guarda o telefone do site em
 * pessoa.telefone1 com máscaras variadas ("(11) 98765-4321", "+5511987654321",
 * "(11) 9876-54321"). Fixo (10 dígitos) ou lixo → null.
 */
export function celularE164(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  const d = bruto.replace(/\D/g, '');
  return new RegExp(CELULAR_BR_DIGITOS).test(d) ? `+55${d.slice(-11)}` : null;
}

export function lerConsultaEstadia(q: Record<string, unknown>, agoraServidorMs: number): Leitura<ConsultaEstadia> {
  const tenant = getTenant(texto(q.unidade) ?? '');
  if (!tenant) return { ok: false, erro: 'unidade inválida' };

  // Exatamente um: suite (QR) ou raiz (suíte atual da cadeia, troca de suíte).
  const suiteTxt = texto(q.suite);
  const raizTxt = texto(q.raiz);
  if ((suiteTxt === undefined) === (raizTxt === undefined)) {
    return { ok: false, erro: 'informe suite OU raiz' };
  }
  if (suiteTxt !== undefined && !/^\d{1,6}$/.test(suiteTxt)) return { ok: false, erro: 'suite inválida' };
  if (raizTxt !== undefined && !REF.test(raizTxt)) return { ok: false, erro: 'raiz inválida' };

  const agoraMs = isoComFuso(q.agora);
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
      suite: suiteTxt === undefined ? null : Number(suiteTxt),
      raiz: raizTxt ?? null,
      janelaMin,
      limiteLocal: paraLocalAutomo(agoraMs - janelaMin * 60_000),
    },
  };
}

export function lerConsultaCheckouts(
  q: Record<string, unknown>,
  agoraServidorMs: number,
): Leitura<ConsultaCheckouts> {
  const tenant = getTenant(texto(q.unidade) ?? '');
  if (!tenant) return { ok: false, erro: 'unidade inválida' };

  const desdeMs = isoComFuso(q.desde);
  if (!Number.isFinite(desdeMs)) return { ok: false, erro: 'desde inválido (ISO 8601 com fuso)' };
  if (desdeMs < agoraServidorMs - CHECKOUTS_MAX_DIAS * 86_400_000) {
    return { ok: false, erro: `desde anterior a ${CHECKOUTS_MAX_DIAS} dias` };
  }
  if (desdeMs > agoraServidorMs + AGORA_TOLERANCIA_S * 1000) return { ok: false, erro: 'desde no futuro' };

  const aposTxt = texto(q.apos_ref);
  if (aposTxt !== undefined && !REF.test(aposTxt)) return { ok: false, erro: 'apos_ref inválido' };

  const limiteTxt = texto(q.limite);
  let limite = CHECKOUTS_LIMITE_PADRAO;
  if (limiteTxt !== undefined) {
    if (!/^\d{1,4}$/.test(limiteTxt) || Number(limiteTxt) < 1 || Number(limiteTxt) > CHECKOUTS_LIMITE_MAX) {
      return { ok: false, erro: `limite inválido (1 a ${CHECKOUTS_LIMITE_MAX})` };
    }
    limite = Number(limiteTxt);
  }

  return {
    ok: true,
    consulta: { tenant, desdeLocal: paraLocalAutomo(desdeMs), aposRef: aposTxt ?? null, limite },
  };
}

export function lerConsultaContato(q: Record<string, unknown>, agoraServidorMs: number): Leitura<ConsultaContato> {
  const tenant = getTenant(texto(q.unidade) ?? '');
  if (!tenant) return { ok: false, erro: 'unidade inválida' };
  const locacao = texto(q.locacao) ?? '';
  if (!REF.test(locacao)) return { ok: false, erro: 'locacao inválida' };
  return {
    ok: true,
    consulta: {
      tenant,
      locacao,
      limiteLocal: paraLocalAutomo(agoraServidorMs - CONTATO_JANELA_H * 3_600_000),
    },
  };
}

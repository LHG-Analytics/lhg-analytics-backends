/**
 * Autenticação servidor-a-servidor do NPS LHG (HMAC-SHA256 por cliente).
 *
 * Cabeçalhos: X-LHG-Key-Id, X-LHG-Timestamp (unix, segundos) e X-LHG-Signature
 * (hex) = HMAC-SHA256(segredo, TEXTO), com TEXTO =
 *   METODO \n CAMINHO \n TIMESTAMP \n sha256hex(CORPO)            (sem ator)
 *   METODO \n CAMINHO \n TIMESTAMP \n sha256hex(CORPO) \n ATOR    (com X-LHG-Ator)
 * CAMINHO é o caminho canônico com a query string exatamente como enviada,
 * começando em /nps/ (ex.: /nps/v1/estadia?unidade=...). Pelo proxy público o
 * cliente chama /lhg/nps/..., mas assina /nps/... (o proxy tira o /lhg).
 *
 * X-LHG-Ator (opcional; obrigatório no Endpoint F e no C com finalidade) é o id
 * PSEUDÔNIMO de quem pediu no painel ([A-Za-z0-9_-], até 64; nunca e-mail ou
 * nome). Quando vem, entra ASSINADO como 5ª linha: trocar, tirar ou pôr o ator
 * numa requisição capturada invalida a assinatura.
 *
 * As chaves vêm SÓ do ambiente (NPS_HMAC_KEYS="id1:segredo1,id2:segredo2:contato"):
 * duas chaves ativas permitem rotação sem parada. O 3º campo opcional é o
 * ESCOPO: "nps" (padrão: estadia, check-outs, CPF e suítes), "contato" (só o
 * celular, para o Chat LHG) ou "nps_pessoal" (só o nome do hóspede, para o
 * painel interno). Uma chave nunca acessa as rotas de outro escopo (403). O
 * repo é público: nenhum segredo no código, nos testes ou em log.
 */
import * as crypto from 'crypto';

/** Tolerância do X-LHG-Timestamp em relação ao relógio DESTE servidor. */
export const NPS_HMAC_TOLERANCIA_S = 300;
/** Tamanho mínimo do segredo de cada chave. */
export const NPS_MIN_SEGREDO = 32;

const ID_VALIDO = /^[A-Za-z0-9_-]{1,32}$/;
/** Ator: id pseudônimo do usuário do painel (UUID, id numérico...). */
export const ATOR_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

export type EscopoNps = 'nps' | 'contato' | 'nps_pessoal';
const ESCOPOS: readonly EscopoNps[] = ['nps', 'contato', 'nps_pessoal'];

export interface ChaveNps {
  segredo: string;
  escopo: EscopoNps;
}

/** Lê NPS_HMAC_KEYS. Entradas inválidas são ignoradas (e contadas, sem valores). */
export function lerChavesNps(bruto: string | undefined): {
  chaves: Map<string, ChaveNps>;
  invalidas: number;
} {
  const chaves = new Map<string, ChaveNps>();
  let invalidas = 0;
  for (const item of (bruto ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [id = '', segredo = '', escopo = 'nps', ...resto] = item.split(':').map((s) => s.trim());
    if (
      !ID_VALIDO.test(id) ||
      segredo.length < NPS_MIN_SEGREDO ||
      !ESCOPOS.includes(escopo as EscopoNps) ||
      resto.length > 0 ||
      chaves.has(id)
    ) {
      invalidas++;
      continue;
    }
    chaves.set(id, { segredo, escopo: escopo as EscopoNps });
  }
  return { chaves, invalidas };
}

/** Hash do corpo BRUTO (os bytes exatos recebidos), ou de um texto em UTF-8. */
const sha256hex = (s: string | Buffer) => crypto.createHash('sha256').update(s).digest('hex');

/** Texto assinado: método, caminho canônico, timestamp, hash do corpo e (se houver) o ator. */
export function textoCanonico(
  metodo: string,
  caminho: string,
  timestamp: string,
  corpo: string | Buffer = '',
  ator?: string,
): string {
  const linhas = [metodo.toUpperCase(), caminho, timestamp, sha256hex(corpo)];
  if (ator !== undefined) linhas.push(ator);
  return linhas.join('\n');
}

export function assinarNps(
  segredo: string,
  metodo: string,
  caminho: string,
  timestamp: string,
  corpo: string | Buffer = '',
  ator?: string,
): string {
  return crypto
    .createHmac('sha256', segredo)
    .update(textoCanonico(metodo, caminho, timestamp, corpo, ator))
    .digest('hex');
}

export type MotivoRecusa = 'sem_config' | 'cabecalhos' | 'caminho' | 'chave' | 'relogio' | 'assinatura';
export type ResultadoHmac =
  | { ok: true; keyId: string; escopo: EscopoNps; ator: string | null }
  | { ok: false; motivo: MotivoRecusa };

export function verificarNps(p: {
  chaves: Map<string, ChaveNps>;
  keyId: unknown;
  timestamp: unknown;
  assinatura: unknown;
  metodo: string;
  caminho: string;
  corpo?: string | Buffer;
  /** Valor do X-LHG-Ator (undefined = cabeçalho ausente). */
  ator?: unknown;
  agoraMs: number;
}): ResultadoHmac {
  if (p.chaves.size === 0) return { ok: false, motivo: 'sem_config' };
  const { keyId, timestamp, assinatura, ator } = p;
  if (
    typeof keyId !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof assinatura !== 'string' ||
    !/^\d{1,12}$/.test(timestamp) ||
    !/^[0-9a-f]{64}$/i.test(assinatura) ||
    (ator !== undefined && (typeof ator !== 'string' || !ATOR_VALIDO.test(ator)))
  ) {
    return { ok: false, motivo: 'cabecalhos' };
  }
  if (!p.caminho.startsWith('/nps/')) return { ok: false, motivo: 'caminho' };
  const chave = p.chaves.get(keyId);
  if (!chave) return { ok: false, motivo: 'chave' };
  if (Math.abs(p.agoraMs / 1000 - Number(timestamp)) > NPS_HMAC_TOLERANCIA_S) {
    return { ok: false, motivo: 'relogio' };
  }
  const esperado = Buffer.from(
    assinarNps(chave.segredo, p.metodo, p.caminho, timestamp, p.corpo ?? '', ator as string | undefined),
    'hex',
  );
  const recebido = Buffer.from(assinatura.toLowerCase(), 'hex');
  if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) {
    return { ok: false, motivo: 'assinatura' };
  }
  return { ok: true, keyId, escopo: chave.escopo, ator: (ator as string | undefined) ?? null };
}

/**
 * Documento do hóspede → doc_hash. O CPF/cédula NUNCA sai do lhg-api em claro
 * e nunca vai para log: só o HMAC-SHA256 (hex) com a chave do CRM.
 *
 * Normalização (a MESMA no CRM, se ele precisar recalcular algum dia):
 *   'BR:' + 11 dígitos do CPF   (dígitos verificadores válidos, sem 11 iguais)
 *   'EC:' + 10 dígitos da cédula (LIV; província 01-24 ou 30, 3º dígito < 6, módulo 10)
 * O prefixo do país impede que um CPF e uma cédula colidam. Qualquer outra
 * coisa (passaporte, lixo, CPF genérico de balcão) → sem doc_hash.
 */
import * as crypto from 'crypto';

export type TipoDocumento = 'CPF' | 'CEDULA_EC';

export interface DocumentoNormalizado {
  tipo: TipoDocumento;
  /** 'BR:dddddddddddd' ou 'EC:dddddddddd' — só em memória. */
  texto: string;
}

/**
 * CPFs genéricos (contrato-raw-v1, seção 4, A7): os "de exemplo" que PASSAM no
 * dígito verificador e que recepções/sistemas usam no balcão. Viram "cliente"
 * falso se forem para o hash. Acrescentar aqui os CPFs de balcão das unidades.
 * (Os 11 dígitos iguais já são recusados pela regra abaixo.)
 */
export const CPFS_GENERICOS: ReadonlySet<string> = new Set([
  '12345678909',
  '01234567890',
  '00000000191',
  '98765432100',
  '11122233396',
  '10000000019',
]);

export function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d) || CPFS_GENERICOS.has(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function cedulaEcValida(d: string): boolean {
  if (!/^\d{10}$/.test(d) || /^(\d)\1{9}$/.test(d)) return false;
  const prov = Number(d.slice(0, 2));
  if (!((prov >= 1 && prov <= 24) || prov === 30) || Number(d[2]) >= 6) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(d[i]) * (i % 2 === 0 ? 2 : 1);
    if (v > 9) v -= 9;
    s += v;
  }
  return (10 - (s % 10)) % 10 === Number(d[9]);
}

/** `pais` = país da unidade: o LIV (Equador) aceita cédula; as outras, CPF. */
export function normalizarDocumento(bruto: unknown, pais: 'BR' | 'EC'): DocumentoNormalizado | null {
  if (typeof bruto !== 'string') return null;
  const d = bruto.replace(/\D/g, '');
  if (pais === 'EC' && cedulaEcValida(d)) return { tipo: 'CEDULA_EC', texto: `EC:${d}` };
  if (cpfValido(d)) return { tipo: 'CPF', texto: `BR:${d}` };
  return null;
}

export function docHash(segredo: string, doc: DocumentoNormalizado): string {
  return crypto.createHmac('sha256', segredo).update(doc.texto).digest('hex');
}

/**
 * Réplica atrasada: regras puras (sem rede nem banco).
 *
 * O lhg-api lê as RÉPLICAS do Automo. Se a replicação de uma unidade para
 * (ex.: GETAN Garavelo parou em 10/11/2026), a réplica continua aceitando
 * conexão, mas os dados ficam congelados e as telas mostram R$ 0 sem nenhum
 * erro. O atraso é medido NO PRÓPRIO banco (now() − último replay), sem
 * depender do relógio deste servidor.
 */
import * as moment from 'moment-timezone';

export const ATRASO_MAX_MIN_PADRAO = 120;

export interface StatusReplica {
  unidade: string;
  nome: string;
  /** false = o banco da unidade não aceitou conexão. */
  conecta: boolean;
  /** true = é réplica (pg_is_in_recovery); banco primário não tem atraso. */
  replica: boolean;
  /** Último dado replicado (ISO, UTC), ou null. */
  ultimoReplay: string | null;
  atrasoMin: number | null;
  /** Atrasada OU sem conexão: as telas avisam "dados até…" e sai e-mail. */
  atrasada: boolean;
  /** "dados até dd/mm hh:mm" no fuso da unidade (null se não atrasada). */
  dadosAte: string | null;
  /** Texto pronto para a tela (null = sem aviso): o dadosAte, ou "sem conexão…". */
  aviso: string | null;
  verificadoEm: string;
}

export const fusoDa = (slug: string) => (slug === 'liv' ? 'America/Guayaquil' : 'America/Sao_Paulo');

/** Linha do banco → status. `linha` null = não conectou. */
export function avaliar(
  t: { slug: string; displayName: string },
  linha: { replica: boolean; ultimo: string | null; atraso_s: number | string | null } | null,
  atrasoMaxMin: number,
  agora: Date,
): StatusReplica {
  const base = { unidade: t.slug, nome: t.displayName, verificadoEm: agora.toISOString() };
  if (!linha) {
    return {
      ...base,
      conecta: false,
      replica: true,
      ultimoReplay: null,
      atrasoMin: null,
      atrasada: true,
      dadosAte: null,
      aviso: 'sem conexão com o servidor da unidade',
    };
  }
  if (!linha.replica) {
    const s = { ...base, conecta: true, replica: false, ultimoReplay: null, atrasoMin: null };
    return { ...s, atrasada: false, dadosAte: null, aviso: null };
  }
  const atrasoMin = linha.atraso_s === null ? null : Math.max(0, Math.round(Number(linha.atraso_s) / 60));
  // Réplica sem nenhum replay registrado também é tratada como atrasada.
  const atrasada = atrasoMin === null || atrasoMin > atrasoMaxMin;
  const dadosAte = atrasada
    ? linha.ultimo
      ? `dados até ${moment(linha.ultimo).tz(fusoDa(t.slug)).format('DD/MM HH:mm')}`
      : 'sem dados replicados'
    : null;
  return {
    ...base,
    conecta: true,
    replica: true,
    ultimoReplay: linha.ultimo,
    atrasoMin,
    atrasada,
    dadosAte,
    aviso: dadosAte,
  };
}

/** "há 16 dias", "há 3 h", "há 45 min". */
export function haQuanto(min: number | null): string {
  if (min === null) return 'sem registro';
  if (min >= 2 * 24 * 60) return `há ${Math.floor(min / (24 * 60))} dias`;
  if (min >= 60) return `há ${Math.floor(min / 60)} h`;
  return `há ${min} min`;
}

/** Estado guardado por unidade (no Redis do cache). */
export interface EstadoAlerta {
  estado: 'normal' | 'atrasada';
  /** Dia (São Paulo) do último aviso de atraso enviado. */
  avisadoEm: string | null;
}

export type Aviso = 'atrasada' | 'normalizou' | null;

/**
 * Um aviso de atraso por unidade por DIA, e um aviso de "voltou ao normal"
 * quando ela se recupera. Sem estado anterior e unidade normal: nada.
 */
export function decidir(anterior: EstadoAlerta | null, s: StatusReplica, hojeSp: string): { aviso: Aviso; novo: EstadoAlerta } {
  if (s.atrasada) {
    const jaAvisouHoje = anterior?.estado === 'atrasada' && anterior.avisadoEm === hojeSp;
    return jaAvisouHoje
      ? { aviso: null, novo: anterior! }
      : { aviso: 'atrasada', novo: { estado: 'atrasada', avisadoEm: hojeSp } };
  }
  if (anterior?.estado === 'atrasada') return { aviso: 'normalizou', novo: { estado: 'normal', avisadoEm: null } };
  return { aviso: null, novo: { estado: 'normal', avisadoEm: anterior?.avisadoEm ?? null } };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Assunto e corpo do e-mail (texto e HTML simples). `ambiente` ≠ prod aparece no assunto. */
export function montarEmail(aviso: Exclude<Aviso, null>, s: StatusReplica, ambiente: string) {
  const tag = ambiente === 'prod' ? '' : `[${ambiente.toUpperCase()}] `;
  const quando = s.ultimoReplay
    ? moment(s.ultimoReplay).tz(fusoDa(s.unidade)).format('DD/MM/YYYY HH:mm')
    : 'sem registro';
  let assunto: string;
  let linhas: string[];
  if (aviso === 'normalizou') {
    assunto = `${tag}LHG Analytics: réplica de ${s.nome} voltou ao normal`;
    linhas = [
      `A réplica do Automo de ${s.nome} voltou a receber dados.`,
      `Último dado replicado: ${quando} (${haQuanto(s.atrasoMin)}).`,
    ];
  } else if (!s.conecta) {
    assunto = `${tag}LHG Analytics: ${s.nome} sem conexão com a réplica`;
    linhas = [
      `O banco (réplica do Automo) de ${s.nome} não está aceitando conexão.`,
      `As telas do Analytics dessa unidade ficam sem dados até a conexão voltar.`,
      `Verificar o servidor da unidade.`,
    ];
  } else {
    assunto = `${tag}LHG Analytics: réplica de ${s.nome} atrasada (${haQuanto(s.atrasoMin)})`;
    linhas = [
      `A réplica do Automo de ${s.nome} parou de receber dados.`,
      `Último dado replicado: ${quando} — ${haQuanto(s.atrasoMin)}.`,
      `As telas do Analytics dessa unidade mostram só o que veio até esse momento.`,
      `Verificar a replicação no servidor da unidade (primário → réplica).`,
    ];
  }
  linhas.push('', 'Aviso automático do LHG Analytics: um por unidade por dia, e outro quando normalizar.');
  return {
    assunto,
    texto: linhas.join('\n'),
    html: linhas.map((l) => (l ? `<p>${esc(l)}</p>` : '')).join(''),
  };
}

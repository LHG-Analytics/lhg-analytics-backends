/**
 * Configuração do job do CRM (Automo → schema `raw` do Supabase do CRM).
 *
 * Tudo vem do ambiente; sem CRM_ETL_DATABASE_URL ou sem a chave do HMAC o job
 * fica DESLIGADO (o lhg-api sobe normalmente). O repo é público: nenhum valor
 * aqui, nos testes ou em log.
 *
 *   CRM_ETL_DATABASE_URL     conexão com o Supabase do CRM (role de gravação só no schema raw)
 *   CRM_ETL_SCHEMA           schema de destino (padrão raw; o teste isolado usa outro)
 *   CRM_DOC_HMAC_KEYS        "keyId:segredo" (segredo ≥ 32); a 1ª é a ATUAL, as demais só para rotação
 *   CRM_ETL_UNIDADES         slugs separados por vírgula (padrão: as 6 LHG)
 *   CRM_ETL_BACKFILL_DESDE   início do histórico (padrão 2024-01-01)
 *   CRM_ETL_JANELA           horário em que o job roda, hora de São Paulo (padrão 02-06)
 *   CRM_ETL_REPROCESSAR_DIAS cada execução relê estes dias antes da marca d'água (padrão 7)
 */
export const UNIDADES_LHG = ['lush_ipiranga', 'lush_lapa', 'tout', 'andar_de_cima', 'liv', 'altana'] as const;

export const CRM_MIN_SEGREDO = 32;
const ID_CHAVE = /^[A-Za-z0-9_-]{1,32}$/;
const SCHEMA = /^[a-z_][a-z0-9_]{0,62}$/;

export interface CrmEtlConfig {
  ativo: boolean;
  /** Por que está desligado (sem valores). */
  motivo: string | null;
  urlDestino: string;
  schema: string;
  /** Chave ATUAL do doc_hash. */
  chave: { id: string; segredo: string } | null;
  unidades: string[];
  backfillDesde: string;
  /** [início, fim) em horas de São Paulo; o fim pode passar da meia-noite (ex.: 22-04). */
  janela: [number, number];
  reprocessarDias: number;
}

export function lerConfigCrmEtl(env: NodeJS.ProcessEnv = process.env): CrmEtlConfig {
  const urlDestino = (env.CRM_ETL_DATABASE_URL ?? '').trim();
  const schema = (env.CRM_ETL_SCHEMA ?? 'raw').trim();
  const chaves = (env.CRM_DOC_HMAC_KEYS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(':'));
  const primeira = chaves[0];
  const chave =
    primeira && primeira.length === 2 && ID_CHAVE.test(primeira[0]) && primeira[1].length >= CRM_MIN_SEGREDO
      ? { id: primeira[0], segredo: primeira[1] }
      : null;

  const unidades = (env.CRM_ETL_UNIDADES ?? UNIDADES_LHG.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const backfillDesde = (env.CRM_ETL_BACKFILL_DESDE ?? '2024-01-01').trim();
  const [ji, jf] = (env.CRM_ETL_JANELA ?? '02-06').split('-').map((s) => Number(s));
  const reprocessarDias = Number(env.CRM_ETL_REPROCESSAR_DIAS ?? 7);

  let motivo: string | null = null;
  if (!urlDestino) motivo = 'sem CRM_ETL_DATABASE_URL';
  else if (!chave) motivo = 'CRM_DOC_HMAC_KEYS ausente ou inválida';
  else if (!SCHEMA.test(schema)) motivo = 'CRM_ETL_SCHEMA inválido';
  else if (unidades.some((u) => !(UNIDADES_LHG as readonly string[]).includes(u))) motivo = 'CRM_ETL_UNIDADES com unidade fora das 6 LHG';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(backfillDesde)) motivo = 'CRM_ETL_BACKFILL_DESDE inválido';
  else if (![ji, jf].every((h) => Number.isInteger(h) && h >= 0 && h <= 24) || ji === jf) motivo = 'CRM_ETL_JANELA inválida';
  else if (!Number.isInteger(reprocessarDias) || reprocessarDias < 0 || reprocessarDias > 31)
    motivo = 'CRM_ETL_REPROCESSAR_DIAS inválido (0 a 31)';

  return {
    ativo: motivo === null,
    motivo,
    urlDestino,
    schema,
    chave,
    unidades,
    backfillDesde,
    janela: [ji, jf],
    reprocessarDias,
  };
}

/** A hora (0-23, São Paulo) está dentro da janela [início, fim)? Aceita janela que vira a meia-noite. */
export function dentroDaJanela(hora: number, [ini, fim]: [number, number]): boolean {
  return ini < fim ? hora >= ini && hora < fim : hora >= ini || hora < fim;
}

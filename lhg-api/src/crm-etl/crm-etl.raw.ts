/**
 * Contrato das tabelas do schema `raw` do CRM — FONTE ÚNICA: o gravador (Pg) e
 * a DDL proposta ao CRM (ddlRaw) saem daqui. PROPOSTA do Analytics, a fechar
 * com o agente LHG CRM; mudar aqui muda os dois.
 *
 * Modos:
 *  - upsert: chave natural (unidade + id do Automo); a releitura atualiza.
 *  - filhos: as linhas de uma estadia são SUBSTITUÍDAS por inteiro a cada
 *    leitura (item cancelado ou acompanhante removido no Automo some no CRM).
 */
export type Modo = 'upsert' | 'filhos';

export interface Coluna {
  nome: string;
  tipo: string;
  nulo?: boolean;
  /** upsert: não troca um valor existente por NULL (ex.: reserva lida pela data, antes da estadia). */
  manterSeNulo?: boolean;
}

export interface TabelaRaw {
  nome: string;
  modo: Modo;
  chave: string[];
  colunas: Coluna[];
}

const c = (nome: string, tipo: string, nulo = false, manterSeNulo = false): Coluna => ({ nome, tipo, nulo, manterSeNulo });
const hash = [c('doc_hash', 'text', true), c('doc_tipo', 'text', true), c('doc_key_id', 'text', true)];

export const TABELAS_RAW: Record<'estadias' | 'pessoas' | 'clientes' | 'itens' | 'pacotes' | 'reservas', TabelaRaw> = {
  estadias: {
    nome: 'estadias',
    modo: 'upsert',
    chave: ['unidade', 'id_estadia'],
    colunas: [
      c('unidade', 'text'),
      c('id_estadia', 'bigint'),
      c('id_locacao_final', 'bigint'),
      c('locacoes', 'bigint[]'),
      c('troca_de_suite', 'boolean'),
      c('moeda', 'text'),
      c('chegada_em', 'timestamptz'),
      c('checkin_em', 'timestamptz'),
      c('checkout_em', 'timestamptz'),
      c('dia_comercial', 'date'),
      c('duracao_min', 'integer'),
      c('tipo_periodo', 'text'),
      c('categoria_id', 'integer'),
      c('categoria', 'text'),
      c('suite', 'text'),
      c('ocupantes', 'integer', true),
      c('valor_permanencia', 'numeric(15,2)'),
      c('valor_ocupante_adicional', 'numeric(15,2)'),
      c('valor_consumo', 'numeric(15,2)'),
      c('valor_bruto', 'numeric(15,2)'),
      c('valor_desconto', 'numeric(15,2)'),
      c('valor_total', 'numeric(15,2)'),
      c('gorjeta', 'numeric(15,2)'),
      c('tipo_desconto', 'text', true),
      c('meios_pagamento', 'text[]'),
      c('meios_deposito', 'text[]'),
      c('tabela_preco', 'text', true),
      c('id_reserva', 'bigint', true),
      c('canal', 'text', true),
      c('id_funcionario', 'integer', true),
      c('qtd_pessoas', 'integer'),
      c('flag_teste', 'boolean'),
    ],
  },
  pessoas: {
    nome: 'pessoas_estadia',
    modo: 'filhos',
    chave: ['unidade', 'id_estadia', 'id_cliente'],
    colunas: [
      c('unidade', 'text'),
      c('id_estadia', 'bigint'),
      c('id_cliente', 'bigint'),
      c('id_pessoa', 'bigint', true),
      c('ordem', 'integer'),
      c('papel', 'text'),
      ...hash,
      c('tem_telefone', 'boolean'),
      c('tem_email', 'boolean'),
    ],
  },
  clientes: {
    nome: 'clientes',
    modo: 'upsert',
    chave: ['unidade', 'id_cliente'],
    colunas: [
      c('unidade', 'text'),
      c('id_cliente', 'bigint'),
      c('id_pessoa', 'bigint', true),
      ...hash,
      c('tem_telefone', 'boolean'),
      c('tem_email', 'boolean'),
      c('sexo', 'text', true),
      c('ano_nascimento', 'integer', true),
      c('cadastro_em', 'timestamptz', true),
    ],
  },
  itens: {
    nome: 'itens_consumo',
    modo: 'filhos',
    chave: ['unidade', 'id_item'],
    colunas: [
      c('unidade', 'text'),
      c('id_item', 'bigint'),
      c('id_estadia', 'bigint'),
      c('id_locacao', 'bigint'),
      c('produto_id', 'bigint'),
      c('produto', 'text', true),
      c('tipo_produto', 'text', true),
      c('grupo', 'text'),
      c('eh_pacote', 'boolean'),
      c('id_item_pai', 'bigint', true),
      c('id_pacote', 'bigint', true),
      c('quantidade', 'numeric(15,3)'),
      c('valor_unitario', 'numeric(15,2)'),
      c('valor_total', 'numeric(15,2)'),
      c('lancado_em', 'timestamptz', true),
    ],
  },
  pacotes: {
    nome: 'pacotes_estadia',
    modo: 'filhos',
    chave: ['unidade', 'id_item'],
    colunas: [
      c('unidade', 'text'),
      c('id_item', 'bigint'),
      c('id_estadia', 'bigint'),
      c('produto', 'text', true),
      c('quantidade', 'numeric(15,3)'),
      c('valor_total', 'numeric(15,2)'),
    ],
  },
  reservas: {
    nome: 'reservas',
    modo: 'upsert',
    chave: ['unidade', 'id_reserva'],
    colunas: [
      c('unidade', 'text'),
      c('id_reserva', 'bigint'),
      c('id_estadia', 'bigint', true, true),
      c('id_locacao', 'bigint', true),
      c('id_cliente', 'bigint', true),
      c('canal', 'text', true),
      c('criada_em', 'timestamptz', true),
      c('inicio_em', 'timestamptz', true),
      c('cancelada_em', 'timestamptz', true),
      c('no_show', 'boolean'),
      c('periodo', 'text', true),
      c('valor', 'numeric(15,2)', true),
      c('qtd_hospedes', 'integer', true),
      c('antecedencia_dias', 'integer', true),
      ...hash,
    ],
  },
};

/** Ordem de gravação dentro da transação. */
export const ORDEM_GRAVACAO = ['estadias', 'clientes', 'pessoas', 'itens', 'pacotes', 'reservas'] as const;

/** DDL proposta ao CRM (o job NÃO cria tabelas: quem cria é a migration do CRM). */
export function ddlRaw(schema: string): string {
  const tabelas = Object.values(TABELAS_RAW).map(
    (t) =>
      `CREATE TABLE ${schema}.${t.nome} (\n` +
      t.colunas.map((col) => `  ${col.nome} ${col.tipo}${col.nulo ? '' : ' NOT NULL'},`).join('\n') +
      `\n  atualizado_em timestamptz NOT NULL DEFAULT now(),\n  PRIMARY KEY (${t.chave.join(', ')})\n);`,
  );
  return [
    `CREATE SCHEMA IF NOT EXISTS ${schema};`,
    ...tabelas,
    `CREATE INDEX ON ${schema}.pessoas_estadia (unidade, id_estadia);`,
    `CREATE INDEX ON ${schema}.itens_consumo (unidade, id_estadia);`,
    `CREATE INDEX ON ${schema}.pacotes_estadia (unidade, id_estadia);`,
    `CREATE INDEX ON ${schema}.estadias (unidade, dia_comercial);`,
    `CREATE INDEX ON ${schema}.pessoas_estadia (doc_hash) WHERE doc_hash IS NOT NULL;`,
    `CREATE INDEX ON ${schema}.clientes (doc_hash) WHERE doc_hash IS NOT NULL;`,
    `CREATE TABLE ${schema}.etl_runs (
  id uuid PRIMARY KEY,
  unidade text NOT NULL,
  modo text NOT NULL,          -- incremental | backfill
  desde timestamp NOT NULL,    -- janela de check-out, hora local da unidade (sem fuso)
  ate timestamp NOT NULL,
  iniciado_em timestamptz NOT NULL,
  terminado_em timestamptz,
  status text NOT NULL,        -- ok | erro
  contagens jsonb,             -- linhas gravadas por tabela
  checksums jsonb,             -- por dia comercial: estadias, total_centavos, itens, pessoas
  erro text                    -- só a classe/código do erro (nunca dado pessoal)
);`,
    `CREATE INDEX ON ${schema}.etl_runs (unidade, status, ate DESC);`,
  ].join('\n\n');
}

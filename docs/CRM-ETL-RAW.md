# Job do CRM — contrato do schema `raw` (PROPOSTA do Analytics)

Job do lhg-api que lê as réplicas do Automo (os MESMOS pools do Analytics, sem conexão nova) e grava no schema `raw` do Supabase do CRM. **Proposta a fechar com o agente LHG CRM.** A fonte única é `lhg-api/src/crm-etl/crm-etl.raw.ts`: a DDL abaixo e o gravador saem de lá.

## O que sai do Automo (e o que não sai)

- **Não sai:** nome, CPF/cédula em claro, telefone, e-mail, endereço, motivo do desconto (texto livre) e nome do atendente.
- **Documento:** sai só como `doc_hash` = HMAC-SHA256 (hex) com a chave do CRM sobre o texto normalizado:
  - `BR:` + 11 dígitos do CPF, com DV válido e sem 11 dígitos iguais;
  - `EC:` + 10 dígitos da cédula, só no LIV, com província e módulo 10 válidos.
  - Qualquer outra coisa (passaporte, lixo, CPF genérico) → `doc_hash` nulo.
  - `doc_key_id` diz qual chave gerou o hash, para permitir rotação.
- **Contatos:** `tem_telefone` (≥ 10 dígitos em celular/telefone1/telefone2) e `tem_email` (formato válido), só como booleanos.

## Semântica

| Item | Regra |
|---|---|
| Estadia | Locação FINALIZADA no fim da cadeia de troca de suíte. `id_estadia` = RAIZ da cadeia (a mesma chave do NPS). As pernas TRANSFERIDA não têm valor nem venda; pessoas e reservas são lidas da cadeia inteira. |
| Janela | Por check-out (`datafinaldaocupacao`), hora local da unidade. |
| Datas | `timestamptz` com o fuso da unidade: São Paulo; LIV em `America/Guayaquil`. |
| `dia_comercial` | Dia do check-out pela regra 06:00–05:59 (check-out às 05:30 conta no dia anterior). |
| Moeda | `moeda` por linha: BRL; LIV em USD. |
| Valores | `valor_bruto` = permanência + ocupante adicional + consumo; `valor_total` = bruto − desconto (a mesma conta da wishlist). |
| `tipo_periodo` | A mesma regra do Analytics: chegada → check-out; Altana em 1/2/4/12h. |
| Titular | 1º cliente da 1ª perna da cadeia (ordem do Automo); os demais são `acompanhante`, sem repetir o mesmo cliente. |
| Itens | Uma linha por item não cancelado; `grupo` = as categorias de consumo da wishlist; `eh_pacote` → também em `pacotes_estadia`. |
| Reservas | As ligadas à cadeia e as com início na janela (inclui canceladas e no-show). `id_estadia` nunca é trocado por nulo. |
| `flag_teste` | Hoje sempre `false`: a regra depende do CRM. |

## Gravação

- **Idempotente:** `estadias`, `clientes` e `reservas` fazem upsert pela chave natural.
- **Substituição por estadia:** `pessoas_estadia`, `itens_consumo` e `pacotes_estadia` são trocados por inteiro a cada releitura. Assim, item cancelado ou acompanhante removido no Automo some também no CRM.
- **Uma transação por bloco e unidade:** as 6 tabelas e a linha de `etl_runs` entram juntas. A marca d'água (`max(ate)` das execuções ok) só avança com os dados gravados.
- **Agendamento:** a cada 10 min, só dentro de `CRM_ETL_JANELA` (padrão 02–06h de São Paulo).
  - **Histórico:** blocos de 1 mês desde `CRM_ETL_BACKFILL_DESDE`, sem sobreposição. O que não couber numa noite continua na seguinte.
  - **Incremental:** uma vez por noite, relendo os últimos `CRM_ETL_REPROCESSAR_DIAS` (padrão 7) para pegar estornos e ajustes tardios.
- **Checksums** por dia comercial, em `etl_runs.checksums`: `estadias`, `total_centavos`, `itens`, `pessoas`. O CRM recalcula das próprias tabelas e compara.
- **O job NÃO cria tabelas:** quem cria é a migration do CRM.

## Ambiente (só no Render; nada no repo)

| Variável | |
|---|---|
| `CRM_ETL_DATABASE_URL` | Conexão do CRM com uma ROLE dedicada (abaixo). Sem ela, o job fica desligado. |
| `CRM_DOC_HMAC_KEYS` | `keyId:segredo` (segredo ≥ 32). A 1ª é a atual. |
| `CRM_ETL_SCHEMA` | Padrão `raw`. O teste isolado no mesmo banco usa outro schema. |
| `CRM_ETL_UNIDADES` | Padrão: as 6 LHG. GETAN é recusada por enquanto. |
| `CRM_ETL_BACKFILL_DESDE`, `CRM_ETL_JANELA`, `CRM_ETL_REPROCESSAR_DIAS` | Padrões `2024-01-01`, `02-06` e `7`. |

Role sugerida (menor privilégio; criada pelo CRM):

```sql
CREATE ROLE crm_etl_lhg LOGIN PASSWORD '<gerada fora do chat>';
GRANT USAGE ON SCHEMA raw TO crm_etl_lhg;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA raw TO crm_etl_lhg;
```

## Ajustes do contrato-raw-v1 já aplicados

- **A1, gênero pelo 1º nome:** `clientes.genero` (F/M) e `clientes.genero_fonte` (automo/nome), calculados em memória a partir de um dicionário de 1º nome por unidade, montado dos próprios cadastros do Automo (`crm-etl.genero.ts`). `sexo` passa a ser o valor bruto do Automo (MASCULINO, FEMININO, OUTRO). O 1º nome nunca vai para o raw.
- **A7, CPFs genéricos:** lista fixa em `crm-etl.doc.ts` (`CPFS_GENERICOS`). Esses CPFs não viram doc_hash.

## DDL proposta

```sql
CREATE SCHEMA IF NOT EXISTS raw;

CREATE TABLE raw.estadias (
  unidade text NOT NULL,
  id_estadia bigint NOT NULL,
  id_locacao_final bigint NOT NULL,
  locacoes bigint[] NOT NULL,
  troca_de_suite boolean NOT NULL,
  moeda text NOT NULL,
  chegada_em timestamptz NOT NULL,
  checkin_em timestamptz NOT NULL,
  checkout_em timestamptz NOT NULL,
  dia_comercial date NOT NULL,
  duracao_min integer NOT NULL,
  tipo_periodo text NOT NULL,
  categoria_id integer NOT NULL,
  categoria text NOT NULL,
  suite text NOT NULL,
  ocupantes integer,
  valor_permanencia numeric(15,2) NOT NULL,
  valor_ocupante_adicional numeric(15,2) NOT NULL,
  valor_consumo numeric(15,2) NOT NULL,
  valor_bruto numeric(15,2) NOT NULL,
  valor_desconto numeric(15,2) NOT NULL,
  valor_total numeric(15,2) NOT NULL,
  gorjeta numeric(15,2) NOT NULL,
  tipo_desconto text,
  meios_pagamento text[] NOT NULL,
  meios_deposito text[] NOT NULL,
  tabela_preco text,
  id_reserva bigint,
  canal text,
  id_funcionario integer,
  qtd_pessoas integer NOT NULL,
  flag_teste boolean NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade, id_estadia)
);

CREATE TABLE raw.pessoas_estadia (
  unidade text NOT NULL,
  id_estadia bigint NOT NULL,
  id_cliente bigint NOT NULL,
  id_pessoa bigint,
  ordem integer NOT NULL,
  papel text NOT NULL,
  doc_hash text,
  doc_tipo text,
  doc_key_id text,
  tem_telefone boolean NOT NULL,
  tem_email boolean NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade, id_estadia, id_cliente)
);

CREATE TABLE raw.clientes (
  unidade text NOT NULL,
  id_cliente bigint NOT NULL,
  id_pessoa bigint,
  doc_hash text,
  doc_tipo text,
  doc_key_id text,
  tem_telefone boolean NOT NULL,
  tem_email boolean NOT NULL,
  sexo text,
  genero text,
  genero_fonte text,
  ano_nascimento integer,
  cadastro_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade, id_cliente)
);

CREATE TABLE raw.itens_consumo (
  unidade text NOT NULL,
  id_item bigint NOT NULL,
  id_estadia bigint NOT NULL,
  id_locacao bigint NOT NULL,
  produto_id bigint NOT NULL,
  produto text,
  tipo_produto text,
  grupo text NOT NULL,
  eh_pacote boolean NOT NULL,
  id_item_pai bigint,
  id_pacote bigint,
  quantidade numeric(15,3) NOT NULL,
  valor_unitario numeric(15,2) NOT NULL,
  valor_total numeric(15,2) NOT NULL,
  lancado_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade, id_item)
);

CREATE TABLE raw.pacotes_estadia (
  unidade text NOT NULL,
  id_item bigint NOT NULL,
  id_estadia bigint NOT NULL,
  produto text,
  quantidade numeric(15,3) NOT NULL,
  valor_total numeric(15,2) NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade, id_item)
);

CREATE TABLE raw.reservas (
  unidade text NOT NULL,
  id_reserva bigint NOT NULL,
  id_estadia bigint,
  id_locacao bigint,
  id_cliente bigint,
  canal text,
  criada_em timestamptz,
  inicio_em timestamptz,
  cancelada_em timestamptz,
  no_show boolean NOT NULL,
  periodo text,
  valor numeric(15,2),
  qtd_hospedes integer,
  antecedencia_dias integer,
  doc_hash text,
  doc_tipo text,
  doc_key_id text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade, id_reserva)
);

CREATE INDEX ON raw.pessoas_estadia (unidade, id_estadia);

CREATE INDEX ON raw.itens_consumo (unidade, id_estadia);

CREATE INDEX ON raw.pacotes_estadia (unidade, id_estadia);

CREATE INDEX ON raw.estadias (unidade, dia_comercial);

CREATE INDEX ON raw.pessoas_estadia (doc_hash) WHERE doc_hash IS NOT NULL;

CREATE INDEX ON raw.clientes (doc_hash) WHERE doc_hash IS NOT NULL;

CREATE TABLE raw.etl_runs (
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
);

CREATE INDEX ON raw.etl_runs (unidade, status, ate DESC);
```

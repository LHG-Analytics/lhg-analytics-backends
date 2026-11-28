/**
 * Consultas do job do CRM nas réplicas do Automo (só leitura, pelos MESMOS
 * pools do lhg-api). Uma ESTADIA = a locação FINALIZADA no fim da cadeia de
 * troca de suíte; as pernas TRANSFERIDA da cadeia não têm valor nem venda (tudo
 * passa para a última), mas podem ter clientes e reservas ligados — por isso
 * pessoas e reservas são lidas pela cadeia inteira. A chave da estadia é a RAIZ
 * da cadeia (a mesma do NPS).
 *
 * A janela é por CHECK-OUT (datafinaldaocupacao, que tem índice): $1 ≤ fim < $2,
 * em texto local do Automo (sem fuso). Nenhuma consulta usa o now() do banco.
 */

/** Estadias com check-out na janela. `cats` = ids de categoria da unidade (inteiros do registry). */
export const sqlEstadias = (cats: number[]) => `
WITH RECURSIVE fin AS (
  SELECT la.id_apartamentostate AS id, la.id_locacaoorigem AS origem,
         la.datainicialdaocupacao AS ini, la.datafinaldaocupacao AS fim,
         COALESCE(la.valortotalpermanencia, 0)::numeric(15,2) AS perm,
         COALESCE(la.valortotalocupadicional, 0)::numeric(15,2) AS ocup,
         COALESCE(la.desconto, 0)::numeric(15,2) AS descv,
         COALESCE(la.gorjeta, 0)::numeric(15,2) AS gorjeta,
         la.tipodescontolocacao AS tipo_desc, la.numerodeocupantes AS ocupantes,
         ca.id AS categoria_id, ca.descricao AS categoria, a.numero AS suite,
         aps.id_funcionarioinicio AS funcionario
  FROM locacaoapartamento la
  JOIN apartamentostate aps ON aps.id = la.id_apartamentostate
  JOIN apartamento a ON a.id = aps.id_apartamento
  JOIN categoriaapartamento ca ON ca.id = a.id_categoriaapartamento
  WHERE ca.id IN (${cats.map((c) => Number(c)).join(',')})
    AND la.fimocupacaotipo = 'FINALIZADA'
    AND la.datafinaldaocupacao >= $1::timestamp AND la.datafinaldaocupacao < $2::timestamp
), sobe AS (
  SELECT f.id AS final, f.id AS atual, f.origem, 0 AS n FROM fin f
  UNION ALL
  SELECT s.final, l.id_apartamentostate, l.id_locacaoorigem, s.n + 1
  FROM sobe s JOIN locacaoapartamento l ON l.id_apartamentostate = s.origem
  WHERE s.n < 30
), cad AS (
  SELECT final, array_agg(atual ORDER BY n DESC) AS cadeia FROM sobe GROUP BY final
), pag AS (
  SELECT nl.id_originado AS id,
         array_agg(DISTINCT mp.nome) FILTER (WHERE NOT nl.depositolocacao) AS meios,
         array_agg(DISTINCT mp.nome) FILTER (WHERE nl.depositolocacao) AS meios_dep
  FROM novo_lancamento nl JOIN fin ON fin.id = nl.id_originado
  JOIN meiopagamento mp ON mp.id = nl.id_meiopagamento
  WHERE nl.dataexclusao IS NULL AND nl.valor > 0
  GROUP BY 1
)
SELECT fin.id::text AS id_locacao, cad.cadeia[1]::text AS raiz, cad.cadeia::text[] AS cadeia,
       to_char(r.datainicialdaocupacao, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS chegada,
       to_char(fin.ini, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS ini,
       to_char(fin.fim, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS fim,
       fin.perm::text AS perm, fin.ocup::text AS ocup, fin.descv::text AS descv, fin.gorjeta::text AS gorjeta,
       fin.tipo_desc, fin.ocupantes, fin.categoria_id, fin.categoria, fin.suite::text AS suite,
       fin.funcionario, pag.meios, pag.meios_dep
FROM fin
JOIN cad ON cad.final = fin.id
JOIN locacaoapartamento r ON r.id_apartamentostate = cad.cadeia[1]
LEFT JOIN pag ON pag.id = fin.id
ORDER BY fin.fim, fin.id`;

/** A unidade tem col_locacaoapartamento_cliente.ordem (a Altana não tem) e lê periodo_cobrado? */
export const SQL_CAPACIDADES = `
SELECT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'col_locacaoapartamento_cliente' AND column_name = 'ordem') AS tem_ordem,
       has_table_privilege('periodo_cobrado', 'SELECT') AS pode_tabela`;

/**
 * Pessoas ligadas a qualquer locação da cadeia ($1 = ids). O documento e os
 * contatos saem do banco só para virar hash/booleano em memória.
 */
export const sqlPessoas = (temOrdem: boolean) => `
SELECT x.id_locacaoapartamento::text AS loc, x.id_cliente::text AS id_cliente,
       ${temOrdem ? 'x.ordem' : 'NULL::bigint'} AS ordem,
       pp.id_pessoa::text AS id_pessoa, p.identificador AS doc,
       p.celular, p.telefone1, p.telefone2, p.email,
       nullif(upper(trim(p.sexo)), '') AS sexo,
       -- Só para o gênero pelo 1º nome (A1), em memória: NUNCA vai para o raw.
       split_part(trim(p.nome), ' ', 1) AS primeiro_nome,
       EXTRACT(YEAR FROM p.nascimento)::int AS ano_nascimento,
       to_char(cl.datacadastro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cadastro_em
FROM col_locacaoapartamento_cliente x
JOIN cliente cl ON cl.id = x.id_cliente
LEFT JOIN pessoapapel pp ON pp.id = cl.id
LEFT JOIN pessoa p ON p.id = pp.id_pessoa
WHERE x.id_locacaoapartamento = ANY($1::int[])
ORDER BY x.id_locacaoapartamento, ${temOrdem ? 'x.ordem NULLS LAST,' : ''} x.id_cliente`;

/** Itens vendidos (não cancelados) nas locações $1. */
export const SQL_ITENS = `
SELECT vl.id_locacaoapartamento::text AS loc, sei.id::text AS id_item,
       sei.id_saidaestoqueitempai::text AS id_item_pai, sei.id_pacoteprodutoutilizado::text AS id_pacote,
       p.id::text AS produto_id, p.descricao AS produto, tp.descricao AS tipo,
       sei.quantidade::text AS quantidade, COALESCE(sei.precovenda, 0)::numeric(15,2)::text AS preco,
       to_char(sei.datasaidaitem, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS lancado
FROM vendalocacao vl
JOIN saidaestoqueitem sei ON sei.id_saidaestoque = vl.id_saidaestoque AND sei.cancelado IS NULL
JOIN produtoestoque pe ON pe.id = sei.id_produtoestoque
JOIN produto p ON p.id = pe.id_produto
LEFT JOIN tipoproduto tp ON tp.id = p.id_tipoproduto
WHERE vl.id_locacaoapartamento = ANY($1::int[])
ORDER BY vl.id_locacaoapartamento, sei.id`;

/**
 * Reservas: as ligadas às locações $1 e as com início na janela ($2 ≤ início < $3),
 * para pegar também canceladas e no-show (que não viram locação).
 */
export const SQL_RESERVAS = `
SELECT r.id::text AS id_reserva, r.id_locacaoapartamento::text AS loc, r.id_cliente::text AS id_cliente,
       o.tipo_origem AS canal,
       to_char(r.dataatendimento, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS criada,
       to_char(r.datainicio, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS inicio,
       to_char(r.cancelada, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS cancelada,
       COALESCE(r.no_show, false) AS no_show,
       r.periodocontratado AS periodo, r.valorcontratado::numeric(15,2)::text AS valor,
       r.qtd_hospedes, p.identificador AS doc
FROM reserva r
LEFT JOIN tipo_origem_reserva o ON o.id = r.id_tipoorigemreserva
LEFT JOIN pessoapapel pp ON pp.id = r.id_cliente
LEFT JOIN pessoa p ON p.id = pp.id_pessoa
WHERE r.id IN (
  SELECT id FROM reserva WHERE id_locacaoapartamento = ANY($1::int[])
  UNION
  SELECT id FROM reserva WHERE datainicio >= $2::timestamp AND datainicio < $3::timestamp
)
ORDER BY r.id`;

/** Tabela de preço da 1ª cobrança de cada locação $1 (só se a unidade dá SELECT em periodo_cobrado). */
export const SQL_TABELA_PRECO = `
SELECT DISTINCT ON (pc.id_locacaoapartamento) pc.id_locacaoapartamento::text AS loc, tp.nome AS tabela
FROM periodo_cobrado pc
LEFT JOIN precolocacao pl ON pl.id = pc.id_precolocacao
LEFT JOIN tabelaprecolocacao tp ON tp.id = pl.id_tabeladelocacao
WHERE pc.id_locacaoapartamento = ANY($1::int[])
ORDER BY pc.id_locacaoapartamento, pc.inicio, pc.id`;

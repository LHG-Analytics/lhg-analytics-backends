/**
 * CTEs dos totais por CATEGORIA de suíte (base do DataTableSuiteCategory e do
 * TotalResult da Visão Geral). Compartilhados pelo dashboard (company.service)
 * e pelo resumo do Painel TV (painel.service): o MESMO texto nos dois, para os
 * números baterem. O TotalResult é a soma das categorias que têm suíte ativa
 * (junção suite_category_data × suite_counts pelo nome da categoria).
 */
export const cteDadosPorCategoria = (
  suiteIdsSqlList: string,
  formattedStart: string,
  formattedEnd: string
): string => `
        SELECT
          ca.descricao as suite_category_name,
          COUNT(*) as total_rentals,
          -- Receita total: (permanencia + ocupadicional + consumo) - desconto
          -- Importante: la.desconto já contém desconto de locação + desconto de consumo
          COALESCE(SUM(
            COALESCE(CAST(la.valortotalpermanencia AS DECIMAL(15,4)), 0) +
            COALESCE(CAST(la.valortotalocupadicional AS DECIMAL(15,4)), 0) +
            COALESCE(
              (
                SELECT COALESCE(SUM(
                  CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))
                ), 0)
                FROM vendalocacao vl
                INNER JOIN saidaestoque se ON vl.id_saidaestoque = se.id
                INNER JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque
                WHERE vl.id_locacaoapartamento = la.id_apartamentostate
                  AND sei.cancelado IS NULL
              ), 0
            ) -
            COALESCE(CAST(la.desconto AS DECIMAL(15,4)), 0)
          ), 0) as total_value,
          -- Receita apenas de locação líquida (valorliquidolocacao já contém desconto aplicado)
          COALESCE(SUM(
            COALESCE(CAST(la.valorliquidolocacao AS DECIMAL(15,4)), 0)
          ), 0) as rental_revenue,
          -- Tempo total de ocupação em segundos
          COALESCE(SUM(
            EXTRACT(EPOCH FROM la.datafinaldaocupacao - la.datainicialdaocupacao)
          ), 0) as total_occupied_time
        FROM locacaoapartamento la
        INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
        INNER JOIN apartamento a ON aps.id_apartamento = a.id
        INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
        WHERE la.datainicialdaocupacao >= '${formattedStart}'::timestamp
          AND la.datainicialdaocupacao <= '${formattedEnd}'::timestamp
          AND la.fimocupacaotipo = 'FINALIZADA'
          AND ca.id IN (${suiteIdsSqlList})
          GROUP BY ca.id, ca.descricao
`;

export const cteSuitesPorCategoria = (suiteIdsSqlList: string): string => `
        SELECT
          ca.descricao as suite_category_name,
          COUNT(DISTINCT a.id) as total_suites_in_category
        FROM categoriaapartamento ca
        INNER JOIN apartamento a ON ca.id = a.id_categoriaapartamento
        WHERE ca.id IN (${suiteIdsSqlList})
          AND a.dataexclusao IS NULL
          GROUP BY ca.id, ca.descricao
`;

/** Só o necessário para o TotalResult: locações e receita por categoria com suíte ativa. */
export const sqlTotaisPorCategoria = (
  suiteIdsSqlList: string,
  formattedStart: string,
  formattedEnd: string
): string => `
      WITH suite_category_data AS (${cteDadosPorCategoria(suiteIdsSqlList, formattedStart, formattedEnd)}      ),
      suite_counts AS (${cteSuitesPorCategoria(suiteIdsSqlList)}      )
      SELECT
        scd.suite_category_name,
        scd.total_rentals,
        scd.total_value
      FROM suite_category_data scd
      INNER JOIN suite_counts sc ON scd.suite_category_name = sc.suite_category_name
      ORDER BY scd.suite_category_name
    `;

/**
 * Categorias de suíte da unidade (as do registry): ID do Automo, nome e
 * quantas suítes ativas têm (a MESMA regra do cteSuitesPorCategoria).
 * Categoria do registry sem suíte ativa sai com 0.
 */
export const sqlListaCategorias = (suiteIdsSqlList: string): string => `
        SELECT ca.id, ca.descricao AS nome,
               COUNT(DISTINCT a.id) FILTER (WHERE a.dataexclusao IS NULL) AS suites
        FROM categoriaapartamento ca
        LEFT JOIN apartamento a ON a.id_categoriaapartamento = ca.id
        WHERE ca.id IN (${suiteIdsSqlList})
        GROUP BY ca.id, ca.descricao
        ORDER BY ca.id
`;

-- ============================================================================
-- ÍNDICES RECOMENDADOS PARA OTIMIZAÇÃO DAS QUERIES DO COMPANY SERVICE
-- ============================================================================
--
-- IMPORTANTE: Como você tem acesso READ-ONLY, peça ao DBA para executar esses
-- índices no banco de dados de cada motel.
--
-- Esses índices são projetados para acelerar as queries do company.service.ts
-- que são executadas frequentemente.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Índice 1: Locações por período e status (CRÍTICO - usado em TODAS as queries)
-- ----------------------------------------------------------------------------
-- A tabela locacaoapartamento é consultada em 10+ queries diferentes
-- Este índice cobre os filtros mais comuns: data de check-in, status e categoria
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_locacaoapartamento_periodo_categoria
ON locacaoapartamento (datainicialdaocupacao, fimocupacaotipo)
INCLUDE (id_apartamentostate, valortotalpermanencia, valortotalocupadicional, desconto, valortotal, gorjeta);

-- Comentário: Este índice permite "Index Only Scan" para as queries principais
-- evitando acessar a tabela heap. O INCLUDE adiciona colunas frequentemente usadas.

-- ----------------------------------------------------------------------------
-- Índice 2: ApartamentoState com relação de apartamento (usado em JOINs)
-- ----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_apartamentostate_apartamento
ON apartamentostate (id_apartamento)
INCLUDE (id);

-- ----------------------------------------------------------------------------
-- Índice 3: Apartamento por categoria e exclusão (CRÍTICO - metadados)
-- ----------------------------------------------------------------------------
-- Usado para contar suítes ativas por categoria
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_apartamento_categoria_ativa
ON apartamento (id_categoriaapartamento, dataexclusao)
WHERE dataexclusao IS NULL;

-- Comentário: Partial index apenas para apartamentos ativos reduz tamanho

-- ----------------------------------------------------------------------------
-- Índice 4: VendaLocação para buscar consumo por locação
-- ----------------------------------------------------------------------------
-- Usado na query DataTableSuiteCategory otimizada
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendalocacao_locacao
ON vendalocacao (id_locacaoapartamento);

-- ----------------------------------------------------------------------------
-- Índice 5: SaidaEstoqueItem para consumo não cancelado
-- ----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saidaestoqueitem_nao_cancelado
ON saidaestoqueitem (id_saidaestoque, cancelado)
INCLUDE (precovenda, quantidade)
WHERE cancelado IS NULL;

-- Comentário: Partial index para itens não cancelados

-- ----------------------------------------------------------------------------
-- Índice 6: LimpezaApartamento por período (usado em unavailable time)
-- ----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_limpezaapartamento_periodo
ON limpezaapartamento (datainicio, datafim)
WHERE datafim IS NOT NULL;

-- Comentário: Apenas limpezas finalizadas interessam

-- ----------------------------------------------------------------------------
-- Índice 7: Defeito por período e apartamento
-- ----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_defeito_periodo_apartamento
ON defeito (id_apartamento, datainicio, datafim)
WHERE datafim IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Índice 8: VendaDireta para vendas diretas completas
-- ----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendadireta_completa
ON vendadireta (id_saidaestoque, venda_completa)
WHERE venda_completa = true;

-- ----------------------------------------------------------------------------
-- Índice 9: SaidaEstoqueItem para vendas diretas por data
-- ----------------------------------------------------------------------------
-- Usado na query totalSaleDirectSQL
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saidaestoqueitem_data_nao_cancelado
ON saidaestoqueitem (datasaidaitem, cancelado)
WHERE cancelado IS NULL;

-- ============================================================================
-- VIEWS ÚTEIS (opcional, mas recomendado)
-- ============================================================================
-- Como você é READ-ONLY, peça ao DBA para criar essas VIEWs

-- VIEW 1: Locações com consumo pré-calculado (evita subquery)
-- Esta VIEW combina locação + consumo em um único lugar
CREATE OR REPLACE VIEW vw_locacao_com_consumo AS
SELECT
  la.id_apartamentostate,
  la.datainicialdaocupacao,
  la.datafinaldaocupacao,
  la.fimocupacaotipo,
  la.valortotalpermanencia,
  la.valortotalocupadicional,
  la.desconto,
  la.valortotal,
  la.gorjeta,
  ca.id as categoria_id,
  ca.descricao as categoria_nome,
  -- Consumo pré-calculado
  COALESCE(SUM(
    CAST(sei.precovenda AS DECIMAL(15,4)) * CAST(sei.quantidade AS DECIMAL(15,4))
  ), 0) as valor_consumo
FROM locacaoapartamento la
INNER JOIN apartamentostate aps ON la.id_apartamentostate = aps.id
INNER JOIN apartamento a ON aps.id_apartamento = a.id
INNER JOIN categoriaapartamento ca ON a.id_categoriaapartamento = ca.id
LEFT JOIN vendalocacao vl ON la.id_apartamentostate = vl.id_locacaoapartamento
LEFT JOIN saidaestoque se ON vl.id_saidaestoque = se.id
LEFT JOIN saidaestoqueitem sei ON se.id = sei.id_saidaestoque AND sei.cancelado IS NULL
GROUP BY
  la.id_apartamentostate,
  la.datainicialdaocupacao,
  la.datafinaldaocupacao,
  la.fimocupacaotipo,
  la.valortotalpermanencia,
  la.valortotalocupadicional,
  la.desconto,
  la.valortotal,
  la.gorjeta,
  ca.id,
  ca.descricao;

-- VIEW 2: Dia comercial (lógica das 6h)
-- CTE reutilizável para calcular o dia comercial
CREATE OR REPLACE VIEW vw_dia_comercial AS
SELECT
  la.id_apartamentostate,
  la.datainicialdaocupacao,
  -- Dia comercial (considerando corte às 6h)
  CASE
    WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6
    THEN la.datainicialdaocupacao - INTERVAL '1 day'
    ELSE la.datainicialdaocupacao
  END as dia_comercial,
  -- Dia da semana do dia comercial
  EXTRACT(DOW FROM CASE
    WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6
    THEN la.datainicialdaocupacao - INTERVAL '1 day'
    ELSE la.datainicialdaocupacao
  END) as dia_semana_num,
  -- Nome do dia da semana
  CASE EXTRACT(DOW FROM CASE
    WHEN EXTRACT(HOUR FROM la.datainicialdaocupacao) < 6
    THEN la.datainicialdaocupacao - INTERVAL '1 day'
    ELSE la.datainicialdaocupacao
  END)
    WHEN 0 THEN 'domingo'
    WHEN 1 THEN 'segunda-feira'
    WHEN 2 THEN 'terça-feira'
    WHEN 3 THEN 'quarta-feira'
    WHEN 4 THEN 'quinta-feira'
    WHEN 5 THEN 'sexta-feira'
    WHEN 6 THEN 'sábado'
  END as dia_semana_nome
FROM locacaoapartamento la
WHERE la.fimocupacaotipo = 'FINALIZADA';

-- VIEW 3: Metadados de suítes (cache no banco)
-- Esta VIEW pode ser consultada em vez de fazer a query de metadados toda vez
CREATE OR REPLACE VIEW vw_suite_metadata AS
SELECT
  ca.id as categoria_id,
  ca.descricao as categoria_nome,
  COUNT(DISTINCT a.id) as total_suites,
  -- Informação adicional: suítes ativas vs inativas
  COUNT(a.id) FILTER (WHERE a.dataexclusao IS NULL) as suites_ativas,
  COUNT(a.id) FILTER (WHERE a.dataexclusao IS NOT NULL) as suites_inativas
FROM categoriaapartamento ca
LEFT JOIN apartamento a ON ca.id = a.id_categoriaapartamento
WHERE ca.id IN (10,11,12,15,16,17,18,19,24)
GROUP BY ca.id, ca.descricao
ORDER BY ca.descricao;

-- ============================================================================
-- COMO USAR AS VIEWS NO CÓDIGO
-- ============================================================================
--
-- Antes (query completa):
-- const result = await prisma.$queryRaw`SELECT ... FROM locacaoapartamento ...`
--
-- Depois (usando VIEW):
-- const result = await prisma.$queryRaw`SELECT * FROM vw_locacao_com_consumo WHERE ...`
--
-- Isso simplifica muito o código TypeScript e move lógica para o banco.
--
-- ============================================================================

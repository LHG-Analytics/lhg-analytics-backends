/**
 * SQL de faturamento e quantidade de reservas POR CANAL (classificação refinada:
 * WEBSITE_IMMEDIATE/SCHEDULED, GUIA_GO/SCHEDULED, INTERNAL, BOOKING, EXPEDIA...).
 * Compartilhado pelo dashboard de Reservas (bookings.service) e pelo resumo do
 * Painel TV (painel.service): o MESMO texto nos dois, para os números baterem.
 * Para WEBSITE (origem 4) o valor é o PAGO: o lançamento RESERVA "cabeça" (sem
 * id_contapagarreceber). As parcelas do cartão também são lançamentos RESERVA
 * (com id_contapagarreceber) e, enquanto não processadas, têm versao 0: o
 * filtro antigo "versao = 0" as somava e inflava o mês corrente.
 */
export const sqlFaturamentoPorCanal = (
  formattedStart: string,
  formattedEnd: string
): string => `
  WITH reservas_com_canal_refinado AS (
    SELECT
      r."id",
      r."id_tipoorigemreserva",
      r."datainicio",
      r."dataatendimento",
      r."reserva_programada_guia",
      r."periodocontratado",
      CASE
        WHEN r."id_tipoorigemreserva" = 1 THEN 'INTERNAL'
        WHEN r."id_tipoorigemreserva" = 6 THEN 'INTERNAL'
        WHEN r."id_tipoorigemreserva" = 7 THEN 'BOOKING'
        WHEN r."id_tipoorigemreserva" = 8 THEN 'EXPEDIA'
        WHEN r."id_tipoorigemreserva" = 10 THEN 'GIFT_CARD'
        WHEN r."id_tipoorigemreserva" = 3 THEN
          CASE
            WHEN COALESCE(r."reserva_programada_guia", false) = true THEN 'GUIA_SCHEDULED'
            ELSE 'GUIA_GO'
          END
        WHEN r."id_tipoorigemreserva" = 4 THEN
          CASE
            -- Dayuse: periodo 06:00 + hora 13
            WHEN r."periodocontratado" = '06:00' AND EXTRACT(HOUR FROM r."datainicio") = 13 THEN 'WEBSITE_SCHEDULED'
            -- Pernoite: periodo 16:00 + hora 20
            WHEN r."periodocontratado" = '16:00' AND EXTRACT(HOUR FROM r."datainicio") = 20 THEN 'WEBSITE_SCHEDULED'
            -- Diária: periodo 21:00 + hora 15
            WHEN r."periodocontratado" = '21:00' AND EXTRACT(HOUR FROM r."datainicio") = 15 THEN 'WEBSITE_SCHEDULED'
            -- Periodo NULL + horários programados
            WHEN r."periodocontratado" IS NULL
                 AND EXTRACT(HOUR FROM r."datainicio") IN (12, 13, 15, 18, 20)
                 AND EXTRACT(MINUTE FROM r."datainicio") = 0 THEN 'WEBSITE_SCHEDULED'
            ELSE 'WEBSITE_IMMEDIATE'
          END
        ELSE CONCAT('CANAL_', r."id_tipoorigemreserva")
      END AS channel_type
    FROM "reserva" r
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}'
  ),
  -- Para canais que não são WEBSITE (4), usa valorcontratado
  valores_outros_canais AS (
    SELECT
      rcr."id",
      rcr.channel_type,
      r."valorcontratado" AS valor
    FROM reservas_com_canal_refinado rcr
    JOIN "reserva" r ON rcr."id" = r."id"
    WHERE rcr."id_tipoorigemreserva" != 4
  ),
  -- Para canal WEBSITE (4), usa o lançamento RESERVA "cabeça" (id_contapagarreceber nulo: o valor pago, sem as parcelas)
  valores_website AS (
    SELECT
      rcr."id",
      rcr.channel_type,
      COALESCE(SUM(nl."valor"), 0) AS valor
    FROM reservas_com_canal_refinado rcr
    JOIN "novo_lancamento" nl ON rcr."id" = nl."id_originado"
    WHERE rcr."id_tipoorigemreserva" = 4
      AND nl."id_contapagarreceber" IS NULL
      AND nl."dataexclusao" IS NULL
      AND nl."tipolancamento" = 'RESERVA'
    GROUP BY rcr."id", rcr.channel_type
  ),
  -- União de todos os valores
  todos_valores AS (
    SELECT "id", channel_type, valor FROM valores_outros_canais
    UNION ALL
    SELECT "id", channel_type, valor FROM valores_website
  )
  SELECT
    channel_type,
    ROUND(SUM(valor)::numeric, 2) AS "totalValue",
    COUNT(DISTINCT "id") AS "totalBookings"
  FROM todos_valores
  GROUP BY channel_type
  ORDER BY "totalValue" DESC;
`;

import { Prisma } from '@client-local';
import { Injectable } from '@nestjs/common';
import * as moment from 'moment-timezone';
import { CachePeriodEnum } from '../cache/cache.interfaces';
import { KpiCacheService } from '../cache/kpi-cache.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private kpiCacheService: KpiCacheService,
  ) {}

  private determineRentalPeriod(
    startDate: Date,
    expectedCheckout: Date,
    rentalTypeData: any,
  ): string {
    const occupationTimeSeconds = this.calculateOccupationTime(startDate, expectedCheckout);

    // Para reservas imediatas, classificar apenas por duração
    if (occupationTimeSeconds <= 3 * 3600 + 15 * 60) {
      return 'THREE_HOURS';
    } else if (occupationTimeSeconds <= 6 * 3600 + 15 * 60) {
      return 'SIX_HOURS';
    } else if (occupationTimeSeconds <= 12 * 3600 + 15 * 60) {
      return 'TWELVE_HOURS';
    }

    // Caso a duração seja maior que 12hrs 15min, retorna TWELVE_HOURS como padrão
    return 'TWELVE_HOURS';
  }

  private calculateOccupationTime(checkIn: Date, checkOut: Date): number {
    const checkInTime = new Date(checkIn).getTime();
    const checkOutTime = new Date(checkOut).getTime();
    return (checkOutTime - checkInTime) / 1000; // Tempo em segundos
  }

  async calculateKpibyDateRangeSQL(startDate: Date, endDate: Date): Promise<any> {
    // Calcula o período anterior automaticamente
    const startMoment = moment(startDate);
    const endMoment = moment(endDate);
    const daysDiff = endMoment.diff(startMoment, 'days') + 1; // +1 porque inclui ambos os dias

    // Período anterior: mesmo número de dias, terminando no dia anterior ao startDate
    const previousEndDate = startMoment.clone().subtract(1, 'day').toDate();
    const previousStartDate = moment(previousEndDate)
      .subtract(daysDiff - 1, 'days')
      .toDate();

    // Busca período atual com cache
    const currentResult = await this.kpiCacheService.getOrCalculate(
      'bookings',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpibyDateRangeSQLInternal(startDate, endDate),
      { start: startDate, end: endDate },
    );

    // Busca período anterior com cache
    const previousResult = await this.kpiCacheService.getOrCalculate(
      'bookings',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpibyDateRangeSQLInternal(previousStartDate, previousEndDate),
      { start: previousStartDate, end: previousEndDate },
    );

    const currentData = currentResult.data;
    const previousData = previousResult.data;

    // Extrair BigNumbers dos períodos
    const currentBigNumbers = currentData.BigNumbers[0];
    const previousBigNumbers = previousData.BigNumbers[0];

    // Calcular previsão mensal (monthlyForecast)
    const nowForForecast = moment.tz('America/Sao_Paulo');
    const currentMonthStart = nowForForecast.clone().startOf('month');
    const currentMonthEnd = nowForForecast.clone().endOf('month');
    const todayForForecast = nowForForecast.clone().startOf('day');
    const yesterday = todayForForecast.clone().subtract(1, 'day');

    // Dias do mês
    const totalDaysInMonth = currentMonthEnd.date();
    const daysElapsed = yesterday.date();
    const remainingDays = totalDaysInMonth - daysElapsed;

    // Buscar dados do mês atual para forecast (do dia 1 até ontem)
    const monthStartDate = currentMonthStart
      .clone()
      .set({ hour: 0, minute: 0, second: 0 })
      .toDate();
    const monthEndDate = yesterday.clone().set({ hour: 23, minute: 59, second: 59 }).toDate();

    // Busca dados do mês com cache
    const monthlyResult = await this.kpiCacheService.getOrCalculate(
      'bookings',
      CachePeriodEnum.CUSTOM,
      async () => this._calculateKpibyDateRangeSQLInternal(monthStartDate, monthEndDate),
      { start: monthStartDate, end: monthEndDate },
    );

    const monthlyData = monthlyResult.data;
    const monthlyBigNumbers = monthlyData.BigNumbers[0];

    // Calcular forecast
    let monthlyForecast: any = undefined;

    if (daysElapsed > 0) {
      const monthlyTotalValue = monthlyBigNumbers.currentDate.totalAllValue;
      const monthlyTotalBookings = monthlyBigNumbers.currentDate.totalAllBookings;

      // Média diária
      const dailyAverageValue = monthlyTotalValue / daysElapsed;
      const dailyAverageBookings = monthlyTotalBookings / daysElapsed;

      // Projeções
      const forecastValue = monthlyTotalValue + dailyAverageValue * remainingDays;
      const forecastBookings = monthlyTotalBookings + dailyAverageBookings * remainingDays;

      // Métricas recalculadas
      const forecastTicketAverage =
        forecastBookings > 0 ? Number((forecastValue / forecastBookings).toFixed(2)) : 0;

      monthlyForecast = {
        totalAllValueForecast: Number(forecastValue.toFixed(2)),
        totalAllBookingsForecast: Math.round(forecastBookings),
        totalAllTicketAverageForecast: forecastTicketAverage,
        totalAllRepresentativenessForecast:
          monthlyBigNumbers.currentDate.totalAllRepresentativeness,
      };
    }

    // Montar BigNumbers com previousDate e monthlyForecast
    const combinedBigNumbers = {
      currentDate: currentBigNumbers.currentDate,
      previousDate: {
        totalAllValuePreviousData: previousBigNumbers.currentDate.totalAllValue,
        totalAllBookingsPreviousData: previousBigNumbers.currentDate.totalAllBookings,
        totalAllTicketAveragePreviousData: previousBigNumbers.currentDate.totalAllTicketAverage,
        totalAllRepresentativenessPreviousData:
          previousBigNumbers.currentDate.totalAllRepresentativeness,
      },
      monthlyForecast,
    };

    // Retornar dados do período atual com BigNumbers combinado
    return {
      ...currentData,
      BigNumbers: [combinedBigNumbers],
    };
  }

  /**
   * Método interno que faz o cálculo real dos KPIs de Bookings
   * Chamado pelo cache service quando há cache miss
   */
  private async _calculateKpibyDateRangeSQLInternal(startDate: Date, endDate: Date): Promise<any> {
    const formattedStart = moment
      .utc(startDate)
      .set({ hour: 0, minute: 0, second: 0 })
      .format('YYYY-MM-DD HH:mm:ss');

    const formattedEnd = moment
      .utc(endDate)
      .set({ hour: 23, minute: 59, second: 59 })
      .format('YYYY-MM-DD HH:mm:ss');

    const totalBookingRevenueSQL = `
  SELECT
  COALESCE(r."id_tipoorigemreserva", 0) AS "id_tipoorigemreserva",
  ROUND(SUM(r."valorcontratado")::numeric, 2) AS "totalAllValue"
FROM "reserva" r
WHERE
  r."cancelada" IS NULL
  AND r."valorcontratado" IS NOT NULL
  AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}'
GROUP BY ROLLUP (r."id_tipoorigemreserva")
HAVING r."id_tipoorigemreserva" IN (1, 3, 4, 6, 7, 8) OR r."id_tipoorigemreserva" IS NULL
ORDER BY "id_tipoorigemreserva";
`;

    const totalBookingCountSQL = `
  SELECT
  COALESCE(r."id_tipoorigemreserva", 0) AS "id_tipoorigemreserva",
  COUNT(r."id") AS "totalAllBookings"
FROM "reserva" r
WHERE
  r."cancelada" IS NULL
  AND r."valorcontratado" IS NOT NULL
  AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}'
GROUP BY ROLLUP (r."id_tipoorigemreserva")
HAVING r."id_tipoorigemreserva" IN (1, 3, 4, 6, 7, 8) OR r."id_tipoorigemreserva" IS NULL
ORDER BY "id_tipoorigemreserva";
`;

    const totalRevenueSQL = `
WITH vendas_diretas AS (
  SELECT COALESCE(SUM((sei."precovenda" * sei."quantidade") - COALESCE(v."desconto", 0)), 0) AS total
  FROM "saidaestoqueitem" sei
  JOIN "saidaestoque" se ON sei."id_saidaestoque" = se."id"
  JOIN "vendadireta" vd ON se."id" = vd."id_saidaestoque"
  LEFT JOIN "venda" v ON se."id" = v."id_saidaestoque"
  WHERE se."datasaida" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND sei."cancelado" IS NULL
    AND sei."tipoprecovenda" IS NOT NULL
),
locacoes AS (
  SELECT COALESCE(SUM(la."valortotal"), 0) AS total
  FROM "locacaoapartamento" la
  JOIN "apartamentostate" ast ON la."id_apartamentostate" = ast."id"
  WHERE ast."datainicio" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND la."fimocupacaotipo" = 'FINALIZADA'
)
SELECT
  ROUND((COALESCE(vd.total, 0) + COALESCE(loc.total, 0))::numeric, 2) AS "totalRevenue"
FROM vendas_diretas vd, locacoes loc;
`;

    const paymentMethodsSQL = `
  WITH reservas_com_pagamento AS (
    -- Reservas que JÁ têm lançamentos do tipo RESERVA
    SELECT DISTINCT r."id" as reserva_id
    FROM "reserva" r
    JOIN "novo_lancamento" nl ON r."id" = nl."id_originado"
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND nl."dataexclusao" IS NULL
      AND nl."tipolancamento" = 'RESERVA'
      AND nl."id_contapagarreceber" IS NULL
      AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}'
  ),
  pagamentos_reserva AS (
    -- Lançamentos do tipo RESERVA (usa valor contratado)
    SELECT
      mp."nome" AS "paymentMethod",
      r."valorcontratado" AS "valor",
      r."id" as reserva_id
    FROM "reserva" r
    JOIN "novo_lancamento" nl ON r."id" = nl."id_originado"
    JOIN "meiopagamento" mp ON nl."id_meiopagamento" = mp."id"
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND nl."dataexclusao" IS NULL
      AND nl."tipolancamento" = 'RESERVA'
      AND nl."id_contapagarreceber" IS NULL
      AND mp."dataexclusao" IS NULL
      AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}'
  ),
  pagamentos_locacao AS (
    -- Lançamentos do tipo LOCACAO apenas para reservas SEM lançamento RESERVA
    SELECT
      mp."nome" AS "paymentMethod",
      nl."valor" AS "valor",
      r."id" as reserva_id
    FROM "reserva" r
    JOIN "novo_lancamento" nl ON r."id" = nl."id_originado"
    JOIN "meiopagamento" mp ON nl."id_meiopagamento" = mp."id"
    WHERE r."cancelada" IS NULL
      AND r."valorcontratado" IS NOT NULL
      AND nl."dataexclusao" IS NULL
      AND nl."tipolancamento" = 'LOCACAO'
      AND nl."id_contapagarreceber" IS NULL
      AND mp."dataexclusao" IS NULL
      AND r."id" NOT IN (SELECT reserva_id FROM reservas_com_pagamento)
      AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}'
  ),
  todos_pagamentos AS (
    SELECT "paymentMethod", "valor", reserva_id FROM pagamentos_reserva
    UNION ALL
    SELECT "paymentMethod", "valor", reserva_id FROM pagamentos_locacao
  )
  SELECT
    "paymentMethod",
    ROUND(SUM("valor")::numeric, 2) AS "totalValue",
    COUNT(DISTINCT reserva_id) AS "quantidadeReservas"
  FROM todos_pagamentos
  GROUP BY "paymentMethod"
  ORDER BY "totalValue" DESC;
`;

    const rentalTypeSQL = `
  SELECT
    r."id",
    r."dataatendimento",
    r."datainicio",
    r."valorcontratado",
    r."id_tipoorigemreserva",
    r."id_locacaoapartamento" AS "rentalApartmentId",
    la."datainicialdaocupacao" AS "checkIn",
    la."datafinaldaocupacao" AS "checkOut"
  FROM "reserva" r
  LEFT JOIN "locacaoapartamento" la ON r."id_locacaoapartamento" = la."id_apartamentostate"
  WHERE r."cancelada" IS NULL
    AND r."valorcontratado" IS NOT NULL
    AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}';
`;

    // SQL para obter dados agrupados por data para os períodos
    const billingByDateSQL = `
  SELECT
    DATE(r."dataatendimento") as booking_date,
    ROUND(SUM(r."valorcontratado")::numeric, 2) AS total_value,
    COUNT(*) AS total_bookings
  FROM "reserva" r
  WHERE r."cancelada" IS NULL
    AND r."valorcontratado" IS NOT NULL
    AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND DATE(r."dataatendimento") BETWEEN DATE('${formattedStart}') AND DATE('${formattedEnd}')
  GROUP BY booking_date
  ORDER BY booking_date DESC;
`;

    // SQL para dados de ecommerce por data (canal 4 = RESERVA_API)
    const ecommerceByDateSQL = `
  SELECT
    DATE(r."dataatendimento") as booking_date,
    ROUND(SUM(r."valorcontratado")::numeric, 2) AS total_value,
    COUNT(*) AS total_bookings
  FROM "reserva" r
  WHERE r."cancelada" IS NULL
    AND r."valorcontratado" IS NOT NULL
    AND r."id_tipoorigemreserva" = 4
    AND r."dataatendimento" BETWEEN '${formattedStart}' AND '${formattedEnd}'
    AND DATE(r."dataatendimento") BETWEEN DATE('${formattedStart}') AND DATE('${formattedEnd}')
  GROUP BY booking_date
  ORDER BY booking_date DESC;
`;

    // Query SQL para classificação refinada de canais
    // Para WEBSITE (id=4): usa periodocontratado + hora para classificar SCHEDULED vs IMMEDIATE
    // Para WEBSITE: usa novo_lancamento com versao=0 e tipolancamento='RESERVA' para obter o valor correto
    const billingPerChannelSQL = `
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
        WHEN r."id_tipoorigemreserva" = 9 THEN 'AIRBNB'
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
  -- Para canal WEBSITE (4), usa novo_lancamento com versao=0 e tipolancamento='RESERVA'
  valores_website AS (
    SELECT
      rcr."id",
      rcr.channel_type,
      COALESCE(SUM(nl."valor"), 0) AS valor
    FROM reservas_com_canal_refinado rcr
    JOIN "novo_lancamento" nl ON rcr."id" = nl."id_originado"
    WHERE rcr."id_tipoorigemreserva" = 4
      AND nl."versao" = 0
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

    const [
      bookingRevenue,
      bookingCount,
      totalRevenue,
      paymentMethodsData,
      rentalTypeData,
      billingPerChannelData,
      billingByDateData,
      ecommerceByDateData,
    ] = await Promise.all([
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([totalBookingRevenueSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([totalBookingCountSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([totalRevenueSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([paymentMethodsSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([rentalTypeSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([billingPerChannelSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([billingByDateSQL])),
      this.prisma.prismaLocal.$queryRaw<any[]>(Prisma.sql([ecommerceByDateSQL])),
    ]);

    const totalLineRevenue = bookingRevenue.find(
      (r: any) => r.id_tipoorigemreserva === null || r.id_tipoorigemreserva === 0,
    );

    const totalLineCount = bookingCount.find(
      (r: any) => r.id_tipoorigemreserva === null || r.id_tipoorigemreserva === 0,
    );

    // Calcula o ticket médio
    const totalValue = Number(totalLineRevenue?.totalAllValue ?? 0);
    const totalBookings = Number(totalLineCount?.totalAllBookings ?? 0);
    const ticketAverage = totalBookings > 0 ? Number((totalValue / totalBookings).toFixed(2)) : 0;

    // Extrai a receita total
    const revenueTotal = Number(totalRevenue[0]?.totalRevenue ?? 0);

    // Calcula a representatividade
    const representativeness =
      revenueTotal > 0 ? Number((totalValue / revenueTotal).toFixed(4)) : 0;

    // Processa os dados dos métodos de pagamento
    const paymentMethods = {
      categories: paymentMethodsData.map((item: any) => item.paymentMethod),
      series: paymentMethodsData.map((item: any) => Number(item.totalValue)),
    };

    // Definir todas as categorias de canal possíveis na ordem desejada (incluindo AIRBNB)
    const allChannelCategories = [
      'EXPEDIA',
      'BOOKING',
      'AIRBNB',
      'GUIA_SCHEDULED',
      'GUIA_GO',
      'INTERNAL',
      'WEBSITE_IMMEDIATE',
      'WEBSITE_SCHEDULED',
    ];

    // Criar mapa dos dados retornados da query
    const channelDataMap = new Map();
    billingPerChannelData.forEach((item: any) => {
      channelDataMap.set(item.channel_type, Number(item.totalValue));
    });

    // Garantir que todas as categorias sejam incluídas, mesmo com valor 0
    const billingPerChannel = {
      categories: allChannelCategories,
      series: allChannelCategories.map((category) => channelDataMap.get(category) || 0),
    };

    // Processa os tipos de locação usando a lógica existente
    const rentalCounts = {
      THREE_HOURS: 0,
      SIX_HOURS: 0,
      TWELVE_HOURS: 0,
      DAY_USE: 0,
      OVERNIGHT: 0,
      DAILY: 0,
    };

    let validRecordsCount = 0;
    let invalidRecordsCount = 0;

    // Objetos para armazenar receita por tipo de reserva
    const rentalRevenue = {
      THREE_HOURS: 0,
      SIX_HOURS: 0,
      TWELVE_HOURS: 0,
      DAY_USE: 0,
      OVERNIGHT: 0,
      DAILY: 0,
    };

    // Calcula o tipo de locação para cada reserva
    rentalTypeData.forEach((booking: any) => {
      if (booking.datainicio) {
        validRecordsCount++;

        // Primeiro verifica se é um período programado (dayuse, daily, overnight)
        const dataInicio = new Date(booking.datainicio);
        const hora = dataInicio.getHours();

        let rentalType = '';

        // Períodos programados - não precisa calcular encerramento_previsto
        if (hora === 13) {
          rentalType = 'DAY_USE'; // 13:00 - Dayuse
        } else if (hora === 20) {
          rentalType = 'OVERNIGHT'; // 20:00 - Pernoite
        } else if (hora === 15) {
          rentalType = 'DAILY'; // 15:00 - Diária
        } else {
          // Para períodos imediatos, usa checkIn/checkOut da locacaoapartamento
          if (booking.checkIn && booking.checkOut) {
            const checkInDate = new Date(booking.checkIn);
            const checkOutDate = new Date(booking.checkOut);
            rentalType = this.determineRentalPeriod(checkInDate, checkOutDate, rentalTypeData);
          } else {
            // Default para THREE_HOURS quando não tem locacaoapartamento vinculada
            rentalType = 'THREE_HOURS';
          }
        }

        if (rentalCounts[rentalType as keyof typeof rentalCounts] !== undefined) {
          rentalCounts[rentalType as keyof typeof rentalCounts]++;
          // Acumula também a receita por tipo
          rentalRevenue[rentalType as keyof typeof rentalRevenue] += Number(
            booking.valorcontratado || 0,
          );
        }
      } else {
        invalidRecordsCount++;
      }
    });

    const reservationsByRentalType = {
      categories: Object.keys(rentalCounts),
      series: Object.values(rentalCounts),
    };

    // Cria KpiTableByChannelType consolidado
    const kpiTableByChannelType = {
      bookingsTotalRentalsByChannelType: {} as Record<string, number>,
      bookingsRevenueByChannelType: {} as Record<string, number>,
      bookingsTicketAverageByChannelType: {} as Record<string, number>,
      bookingsRepresentativenessByChannelType: {} as Record<string, number>,
    };

    // Popula dados por canal usando dados refinados de classificação
    let totalChannelBookings = 0;
    let totalChannelRevenue = 0;

    billingPerChannelData.forEach((channelItem: any) => {
      const channelName = channelItem.channel_type;
      const revenue = Number(channelItem.totalValue);
      const count = Number(channelItem.totalBookings);

      // Calcula ticket médio
      const ticketAverage = count > 0 ? Number((revenue / count).toFixed(2)) : 0;

      // Calcula representatividade
      const representativeness = revenueTotal > 0 ? Number((revenue / revenueTotal).toFixed(4)) : 0;

      // Popula os dados
      kpiTableByChannelType.bookingsTotalRentalsByChannelType[channelName] = count;
      kpiTableByChannelType.bookingsRevenueByChannelType[channelName] = Number(revenue.toFixed(2));
      kpiTableByChannelType.bookingsTicketAverageByChannelType[channelName] = ticketAverage;
      kpiTableByChannelType.bookingsRepresentativenessByChannelType[channelName] =
        representativeness;

      totalChannelBookings += count;
      totalChannelRevenue += revenue;
    });

    // Adiciona totais
    kpiTableByChannelType.bookingsTotalRentalsByChannelType['TOTALALLBOOKINGS'] =
      totalChannelBookings;
    kpiTableByChannelType.bookingsRevenueByChannelType['TOTALALLVALUE'] = Number(
      totalChannelRevenue.toFixed(2),
    );
    kpiTableByChannelType.bookingsTicketAverageByChannelType['TOTALALLTICKETAVERAGE'] =
      totalChannelBookings > 0
        ? Number((totalChannelRevenue / totalChannelBookings).toFixed(2))
        : 0;
    kpiTableByChannelType.bookingsRepresentativenessByChannelType['TOTALALLREPRESENTATIVENESS'] =
      revenueTotal > 0 ? Number((totalChannelRevenue / revenueTotal).toFixed(4)) : 0;

    // Calcula BigNumbersEcommerce (soma WEBSITE_IMMEDIATE + WEBSITE_SCHEDULED)
    const ecommerceRevenueImediata =
      kpiTableByChannelType.bookingsRevenueByChannelType['WEBSITE_IMMEDIATE'] || 0;
    const ecommerceRevenueProgramada =
      kpiTableByChannelType.bookingsRevenueByChannelType['WEBSITE_SCHEDULED'] || 0;
    const ecommerceRevenue = ecommerceRevenueImediata + ecommerceRevenueProgramada;

    const ecommerceBookingsImediata =
      kpiTableByChannelType.bookingsTotalRentalsByChannelType['WEBSITE_IMMEDIATE'] || 0;
    const ecommerceBookingsProgramada =
      kpiTableByChannelType.bookingsTotalRentalsByChannelType['WEBSITE_SCHEDULED'] || 0;
    const ecommerceBookings = ecommerceBookingsImediata + ecommerceBookingsProgramada;

    const ecommerceTicketAverage =
      ecommerceBookings > 0 ? Number((ecommerceRevenue / ecommerceBookings).toFixed(2)) : 0;
    const ecommerceRepresentativeness =
      revenueTotal > 0 ? Number((ecommerceRevenue / revenueTotal).toFixed(4)) : 0;

    const bigNumbersEcommerce = {
      currentDate: {
        totalAllValue: ecommerceRevenue,
        totalAllBookings: ecommerceBookings,
        totalAllTicketAverage: ecommerceTicketAverage,
        totalAllRepresentativeness: ecommerceRepresentativeness,
      },
    };

    // Gera array completo de datas no período solicitado
    const periodsArray: string[] = [];
    let currentDate = moment(startDate).utc();
    const finalDate = moment(endDate).utc();

    while (currentDate.isSameOrBefore(finalDate, 'day')) {
      periodsArray.push(currentDate.format('DD/MM/YYYY'));
      currentDate.add(1, 'day');
    }

    // Cria mapeamento de dados por data
    const billingDataMap = new Map();
    billingByDateData.forEach((item: any) => {
      const dateKey = new Date(item.booking_date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      billingDataMap.set(dateKey, item);
    });

    const ecommerceDataMap = new Map();
    ecommerceByDateData.forEach((item: any) => {
      const dateKey = new Date(item.booking_date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      ecommerceDataMap.set(dateKey, item);
    });

    // Calcula dados por período de data (dia a dia) baseado na lógica original
    const billingOfReservationsByPeriod = {
      categories: [...periodsArray], // Ordem crescente (01/07 até 31/07)
      series: [...periodsArray].map((dateKey: string) => {
        const item = billingDataMap.get(dateKey);
        return item ? Number(item.total_value) : 0;
      }),
    };

    const representativenessOfReservesByPeriod = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = billingDataMap.get(dateKey);
        const dayRevenue = item ? Number(item.total_value) : 0;
        return totalValue > 0 ? Number((dayRevenue / totalValue).toFixed(2)) : 0;
      }),
    };

    const numberOfReservationsPerPeriod = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = billingDataMap.get(dateKey);
        return item ? Number(item.total_bookings) : 0;
      }),
    };

    const reservationsOfEcommerceByPeriod = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = ecommerceDataMap.get(dateKey);
        return item ? Number(item.total_bookings) : 0;
      }),
    };

    const billingOfEcommerceByPeriod = {
      categories: [...periodsArray],
      series: [...periodsArray].map((dateKey: string) => {
        const item = ecommerceDataMap.get(dateKey);
        return item ? Number(item.total_value) : 0;
      }),
    };

    // BigNumbers usa os totais do billingPerChannelData para consistência com KpiTableByChannelType
    const bigNumbersTicketAverage =
      totalChannelBookings > 0 ? Number((totalChannelRevenue / totalChannelBookings).toFixed(2)) : 0;
    const bigNumbersRepresentativeness =
      revenueTotal > 0 ? Number((totalChannelRevenue / revenueTotal).toFixed(4)) : 0;

    const bigNumbers = {
      currentDate: {
        totalAllValue: Number(totalChannelRevenue.toFixed(2)),
        totalAllBookings: totalChannelBookings,
        totalAllTicketAverage: bigNumbersTicketAverage,
        totalAllRepresentativeness: bigNumbersRepresentativeness,
      },
    };

    return {
      Company: 'Andar de Cima',
      BigNumbers: [bigNumbers],
      PaymentMethods: paymentMethods,
      BillingPerChannel: billingPerChannel,
      ReservationsByRentalType: reservationsByRentalType,
      BillingOfReservationsByPeriod: billingOfReservationsByPeriod,
      RepresentativenessOfReservesByPeriod: representativenessOfReservesByPeriod,
      NumberOfReservationsPerPeriod: numberOfReservationsPerPeriod,
      KpiTableByChannelType: [kpiTableByChannelType],
      BigNumbersEcommerce: [bigNumbersEcommerce],
      ReservationsOfEcommerceByPeriod: reservationsOfEcommerceByPeriod,
      BillingOfEcommerceByPeriod: billingOfEcommerceByPeriod,
    };
  }
}

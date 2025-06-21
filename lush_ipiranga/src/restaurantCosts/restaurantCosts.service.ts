import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PeriodEnum } from '@client-online';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { RestaurantCosts } from './entities/restaurantCosts.entity';

@Injectable()
export class RestaurantCostsService {
  private apiUrl: string;
  private user: string;
  private pass: string;
  private unitId: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.apiUrl = this.config.get('DESBRAVADOR_API_URL');
    this.user = this.config.get('DESBRAVADOR_USER');
    this.pass = this.config.get('DESBRAVADOR_PASS');
    this.unitId = Number(this.config.get('DESBRAVADOR_IPIRANGA_ID'));
  }

  async calculateCMV(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    const companyId = 1;

    const token = await this.getToken();

    const movimentos = await this.getMovimentos(token, startDate, endDate);

    console.log('[DEBUG] Movimentos retornados:', movimentos);

    console.log(
      '[DEBUG] Movimentos recebidos:',
      movimentos.length,
      JSON.stringify(movimentos.slice(0, 5), null, 2),
    );

    const saidas = movimentos.filter((m) =>
      [2, 20, 21, 22, 31].includes(m.codigoTipoMovimento),
    );

    const totalCost = saidas.reduce(
      (acc, item) => acc + Number(item.custo || 0),
      0,
    );

    // Receita A&B via SQL
    const formattedStart = startDate.toISOString().split('T')[0];
    const formattedEnd = endDate.toISOString().split('T')[0];

    const abProductTypes = [
      78, 64, 77, 57, 56, 79, 54, 55, 80, 53, 62, 59, 61, 58, 63,
    ];

    const abProductTypesSqlList = abProductTypes.join(', ');

    const revenueAbPeriodSql = `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN tp.id IN (${abProductTypesSqlList}) THEN
              (soi."precovenda" * soi."quantidade") * 
              (
                1 - COALESCE(s."desconto", 0) / NULLIF(so_total."total_bruto", 0)
              )
            ELSE 0
          END
        ), 0) AS "totalValue"
      FROM "locacaoapartamento" ra
      LEFT JOIN "vendalocacao" sl ON sl."id_locacaoapartamento" = ra."id_apartamentostate"
      LEFT JOIN "saidaestoque" so ON so.id = sl."id_saidaestoque"
      LEFT JOIN "saidaestoqueitem" soi ON soi."id_saidaestoque" = so.id AND soi."cancelado" IS NULL
      LEFT JOIN "produtoestoque" ps ON ps.id = soi."id_produtoestoque"
      LEFT JOIN "produto" p ON p.id = ps."id_produto"
      LEFT JOIN "tipoproduto" tp ON tp.id = p."id_tipoproduto"
      LEFT JOIN "venda" s ON s."id_saidaestoque" = so.id
      LEFT JOIN (
        SELECT 
          soi."id_saidaestoque", 
          SUM(soi."precovenda" * soi."quantidade") AS total_bruto
        FROM "saidaestoqueitem" soi
        WHERE soi."cancelado" IS NULL
        GROUP BY soi."id_saidaestoque"
      ) AS so_total ON so_total."id_saidaestoque" = so.id
      WHERE ra."datainicialdaocupacao" BETWEEN '${formattedStart}' AND '${formattedEnd}'
        AND ra."fimocupacaotipo" = 'FINALIZADA'
    `;

    const revenueResult =
      await this.prisma.prismaLocal.$queryRawUnsafe<{ totalValue: number }[]>(
        revenueAbPeriodSql,
      );

    const totalRevenue = revenueResult?.[0]?.totalValue ?? 0;

    const cmvDecimal = totalRevenue > 0 ? totalCost / totalRevenue : 0;

    const totalAllCMV = cmvDecimal;

    // Ajuste de horário UTC para data de referência
    const adjustedEndDate = new Date(endDate);
    adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
    adjustedEndDate.setUTCHours(5, 59, 59, 999);

    const result = await this.insertRestaurantCMV({
      totalAllCMV: new Prisma.Decimal(Number(totalAllCMV.toFixed(2))),
      createdDate: adjustedEndDate,
      period,
      companyId,
    });

    // Retorno limpo conforme solicitado
    return {
      totalAllCMV: result.totalAllCMV.toNumber(),
    };
  }

  private async getToken(): Promise<string> {
    const res = await this.http.axiosRef.post(
      `${this.apiUrl}/Auth`,
      { user: this.user, pass: this.pass },
      { timeout: 10000 },
    );
    return res.data.token ?? res.data;
  }

  private async getMovimentos(token: string, start: Date, end: Date) {
    const dtInicial = start.toISOString().split('T')[0];
    const dtFinal = end.toISOString().split('T')[0];
    console.log('dtInicial:', dtInicial);
    console.log('dtFinal:', dtFinal);

    const url = `${this.apiUrl}/Executar?action=GetMovimentoEstoque&DTINICIAL='${dtInicial}'&DTFINAL='${dtFinal}'&CDEMPRESA=${this.unitId}`;

    const res = await this.http.axiosRef.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = res.data;

    // Se já é um array diretamente
    if (Array.isArray(data)) {
      return data;
    }

    // Se veio no formato { resultado: [...] }
    if (data && Array.isArray(data.resultado)) {
      return data.resultado;
    }

    // Se não veio nada utilizável
    console.warn('⚠️ Resposta inesperada da API Desbravador:', data);
    return [];
  }

  private async insertRestaurantCMV(
    data: RestaurantCosts,
  ): Promise<RestaurantCosts> {
    return this.prisma.prismaOnline.restaurantCMV.upsert({
      where: {
        period_createdDate: {
          period: data.period!,
          createdDate: data.createdDate,
        },
      },
      create: {
        ...data,
      },
      update: {
        ...data,
      },
    });
  }

  @Cron('0 0 * * *', { disabled: true })
  async handleCron() {
    const timezone = 'America/Sao_Paulo'; // Defina seu fuso horário

    // Obter a data atual no fuso horário correto
    const currentDate = moment().tz(timezone).toDate();

    // Últimos 7 dias
    const endDateLast7Days = currentDate;
    endDateLast7Days.setUTCHours(23, 59, 59, 999);

    const startDateLast7Days = new Date(endDateLast7Days);
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 7); // Vai 6 dias para trás
    startDateLast7Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: parsedStartDateLast7Days,
      endDate: parsedEndDateLast7Days,
    } = this.parseDateString(
      this.formatDateString(startDateLast7Days),
      this.formatDateString(endDateLast7Days),
    );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast7Days = parsedStartDateLast7Days;
    const previousStartDateLast7Days = new Date(previousParsedEndDateLast7Days);
    previousStartDateLast7Days.setDate(
      previousStartDateLast7Days.getDate() - 7,
    );
    previousStartDateLast7Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: previousParsedStartDateLast7Days,
      endDate: previousParsedEndDateLast7DaysParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast7Days),
      this.formatDateString(previousParsedEndDateLast7Days),
    );

    // Log para verificar as datas
    const startTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob RestaurantRevenue - últimos 7 dias: ${startTimeLast7Days}`,
    );

    // Chamar a função para o período atual
    await this.calculateCMV(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.calculateCMV(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );

    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob RestaurantRevenue - últimos 7 dias: ${endTimeLast7Days}`,
    );

    // Últimos 30 dias
    const endDateLast30Days = new Date(currentDate);
    endDateLast30Days.setUTCHours(23, 59, 59, 999);

    const startDateLast30Days = new Date(endDateLast30Days);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30); // Vai 29 dias para trás
    startDateLast30Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: parsedStartDateLast30Days,
      endDate: parsedEndDateLast30Days,
    } = this.parseDateString(
      this.formatDateString(startDateLast30Days),
      this.formatDateString(endDateLast30Days),
    );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast30Days = parsedStartDateLast30Days;
    const previousStartDateLast30Days = new Date(
      previousParsedEndDateLast30Days,
    );
    previousStartDateLast30Days.setDate(
      previousStartDateLast30Days.getDate() - 30,
    );
    previousStartDateLast30Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: previousParsedStartDateLast30Days,
      endDate: previousParsedEndDateLast30DaysParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast30Days),
      this.formatDateString(previousParsedEndDateLast30Days),
    );

    // Log para verificar as datas
    const startTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob RestaurantRevenue - últimos 30 dias: ${startTimeLast30Days}`,
    );

    // Chamar a função para o período atual
    await this.calculateCMV(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.calculateCMV(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );

    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob RestaurantRevenue - últimos 30 dias: ${endTimeLast30Days}`,
    );

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = new Date(currentDate);
    endDateLast6Months.setUTCHours(23, 59, 59, 999);

    const startDateLast6Months = new Date(endDateLast6Months);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6); // Vai 6 meses para trás
    startDateLast6Months.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const {
      startDate: parsedStartDateLast6Months,
      endDate: parsedEndDateLast6Months,
    } = this.parseDateString(
      this.formatDateString(startDateLast6Months),
      this.formatDateString(endDateLast6Months),
    );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast6Months = parsedStartDateLast6Months;
    const previousStartDateLast6Months = new Date(
      previousParsedEndDateLast6Months,
    );
    previousStartDateLast6Months.setMonth(
      previousStartDateLast6Months.getMonth() - 6,
    );
    previousStartDateLast6Months.setHours(0, 0, 0, 0); // Configuração de horas

    // Parse as datas para o formato desejado
    const {
      startDate: previousParsedStartDateLast6Months,
      endDate: previousParsedEndDateLast6MonthsParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast6Months),
      this.formatDateString(previousParsedEndDateLast6Months),
    );

    // Log para verificar as datas
    const startTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob RestaurantRevenue - últimos 6 meses: ${startTimeLast6Months}`,
    );

    // Chamar a função para o período atual
    await this.calculateCMV(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.calculateCMV(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );

    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob RestaurantRevenue - últimos 6 meses: ${endTimeLast6Months}`,
    );
  }

  private formatDateString(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Mês é baseado em 0
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
  }

  // Lógica para ajustar as datas com os horários
  private parseDateString(
    startDateString: string,
    endDateString: string,
  ): { startDate: Date; endDate: Date } {
    const [startDay, startMonth, startYear] = startDateString.split('/');
    const [endDay, endMonth, endYear] = endDateString.split('/');

    const parsedStartDate = new Date(
      Date.UTC(+startYear, +startMonth - 1, +startDay),
    );
    const parsedEndDate = new Date(Date.UTC(+endYear, +endMonth - 1, +endDay));

    parsedStartDate.setUTCHours(0, 0, 0, 0); // Define início às 06:00
    parsedEndDate.setUTCHours(23, 59, 59, 999); // Define final às 05:59:59.999

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }
}

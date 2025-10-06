import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import 'moment/locale/pt-br';
import { ChannelTypeEnum, PeriodEnum, Prisma } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingsTicketAverage,
  BookingsTicketAverageByChannelType,
} from './entities/bookingsTicketAverage.entity';

@Injectable()
export class BookingsTicketAverageService {
  constructor(private prisma: PrismaService) {}

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private async fetchKpiData(startDate: Date, adjustedEndDate: Date) {
    return await Promise.all([
      this.prisma.prismaLocal.booking.findMany({
        where: {
          dateService: {
            gte: startDate,
            lte: adjustedEndDate,
          },
          canceled: {
            equals: null,
          },
        },
        select: {
          id: true,
          priceRental: true,
          idTypeOriginBooking: true,
          dateService: true,
          startDate: true,
          rentalApartmentId: true,
        },
      }),
    ]);
  }

  async findAllBookingsTicketAverage(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1; // Defina o ID da empresa conforme necessário

      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      }

      const [allBookings] = await this.fetchKpiData(startDate, adjustedEndDate);

      if (!allBookings || allBookings.length === 0) {
        throw new NotFoundException('No bookings found.');
      }

      // Calcular o total de priceRental
      const totalPriceRental = allBookings.reduce((total: any, booking: any) => {
        const price = booking.priceRental
          ? new Prisma.Decimal(booking.priceRental)
          : new Prisma.Decimal(0);
        return total.plus(price);
      }, new Prisma.Decimal(0));

      let totalBookings = allBookings.length;

      // Calcular a média usando Prisma.Decimal
      const averageTicket =
        totalBookings > 0 ? totalPriceRental.dividedBy(totalBookings).toNumber() : 0;

      // Monta o resultado total
      const totalResult = {
        totalAllTicketAverage: this.formatCurrency(averageTicket), // Formata o valor em reais
        totalBookings: totalBookings,
        createdDate: adjustedEndDate, // Ajusta a data para o final do período
      };

      // Inserir no banco de dados
      await this.insertBookingsTicketAverage({
        totalAllTicketAverage: new Prisma.Decimal(averageTicket),
        period: period as PeriodEnum,
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
        companyId,
      });

      return totalResult;
    } catch (error) {
      console.error('Erro ao buscar Bookings TicketAverage data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to fetch Bookings TicketAverage data: ${errorMessage}`);
    }
  }

  async insertBookingsTicketAverage(data: BookingsTicketAverage): Promise<BookingsTicketAverage> {
    return this.prisma.prismaOnline.bookingsTicketAverage.upsert({
      where: {
        period_createdDate: {
          period: data.period as PeriodEnum as PeriodEnum,
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

  async calculateBookingsTicketAverageByChannelType(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    const companyId = 1; // Defina o ID da empresa conforme necessário

    // Ajustar a data final para não incluir a data atual
    const adjustedEndDate = new Date(endDate);
    if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
    } else if (period === PeriodEnum.LAST_6_M) {
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
    }

    const allBookings = await this.prisma.prismaLocal.booking.findMany({
      where: {
        dateService: {
          gte: startDate,
          lte: adjustedEndDate,
        },
        canceled: {
          equals: null,
        },
      },
      include: {
        originBooking: true, // Inclui os dados da origem da reserva
      },
    });

    if (!allBookings || allBookings.length === 0) {
      throw new NotFoundException('No bookings found.');
    }

    // Inicializa um objeto para armazenar os totais por canal
    const channelTotals = {
      [ChannelTypeEnum.WEBSITE_SCHEDULED]: {
        total: new Prisma.Decimal(0),
        count: 0,
      },
      [ChannelTypeEnum.WEBSITE_IMMEDIATE]: {
        total: new Prisma.Decimal(0),
        count: 0,
      },
      [ChannelTypeEnum.INTERNAL]: { total: new Prisma.Decimal(0), count: 0 },
      [ChannelTypeEnum.GUIA_GO]: { total: new Prisma.Decimal(0), count: 0 },
      [ChannelTypeEnum.GUIA_SCHEDULED]: {
        total: new Prisma.Decimal(0),
        count: 0,
      },
      [ChannelTypeEnum.BOOKING]: { total: new Prisma.Decimal(0), count: 0 },
      [ChannelTypeEnum.EXPEDIA]: { total: new Prisma.Decimal(0), count: 0 },
    };

    // Função para determinar o channelType com base no idTypeOriginBooking e na dateService
    const getChannelType = (
      idTypeOriginBooking: number,
      dateService: Date,
      startDate: Date,
    ): ChannelTypeEnum | null => {
      const isSameDate = (date1: Date, date2: Date) => {
        return (
          date1.getFullYear() === date2.getFullYear() &&
          date1.getMonth() === date2.getMonth() &&
          date1.getDate() === date2.getDate()
        );
      };

      // Função para verificar se a diferença entre duas datas é de até 1 hora
      const isWithinOneHour = (date1: Date, date2: Date) => {
        const differenceInMilliseconds = Math.abs(date1.getTime() - date2.getTime());
        return differenceInMilliseconds <= 3600000; // 1 hora em milissegundos
      };

      switch (idTypeOriginBooking) {
        case 1: // SISTEMA
          return ChannelTypeEnum.INTERNAL;
        case 3: // GUIA_DE_MOTEIS
          if (isWithinOneHour(dateService, startDate)) {
            // Se a diferença for de até 1 hora, retorna GUIA_GO
            return ChannelTypeEnum.GUIA_GO;
          } else {
            // Se não estiver dentro de 1 hora, verifica se são do mesmo dia
            return isSameDate(dateService, startDate)
              ? ChannelTypeEnum.GUIA_GO
              : ChannelTypeEnum.GUIA_SCHEDULED;
          }
        case 4: // RESERVA_API
          if (isWithinOneHour(dateService, startDate)) {
            // Se a diferença for de até 1 hora, retorna WEBSITE_IMMEDIATE
            return ChannelTypeEnum.WEBSITE_IMMEDIATE;
          } else {
            // Se não estiver dentro de 1 hora, verifica se são do mesmo dia
            return isSameDate(dateService, startDate)
              ? ChannelTypeEnum.WEBSITE_IMMEDIATE
              : ChannelTypeEnum.WEBSITE_SCHEDULED;
          }
        case 6: // INTERNA
          return ChannelTypeEnum.INTERNAL;
        case 7: // BOOKING
          return ChannelTypeEnum.BOOKING;
        case 8: // EXPEDIA
          return ChannelTypeEnum.EXPEDIA;
        default:
          return null; // Para outros casos, retorna null
      }
    };

    // Processa cada reserva para calcular o total e a contagem por canal
    for (const booking of allBookings) {
      if (!booking.originBooking) {
        continue; // Skip if originBooking is null
      }
      if (!booking.originBooking) {
        continue; // Skip if originBooking is null
      }
      const channelType = getChannelType(
        booking.originBooking?.id, // Acessa o idTypeOriginBooking da reserva
        booking.dateService, // Acessa a data do serviço
        booking.startDate, // Passa a data de início
      );

      if (channelType) {
        const priceRental = booking.priceRental
          ? new Prisma.Decimal(booking.priceRental)
          : new Prisma.Decimal(0);
        channelTotals[channelType].total = channelTotals[channelType].total.plus(priceRental);
        channelTotals[channelType].count++;
      }
    }

    // Monta o resultado total agregado
    const totalResults: Record<string, any> = {};
    let totalCount = 0;
    let totalSum = new Prisma.Decimal(0);

    for (const [channel, { total, count }] of Object.entries(channelTotals)) {
      const average = count > 0 ? total.dividedBy(count).toNumber() : 0;
      totalResults[channel] = {
        total: this.formatCurrency(total.toNumber()), // Formata o total em reais
        average: this.formatCurrency(average), // Formata a média em reais
        count,
      };

      // Acumula o total e a contagem para o cálculo da média total
      totalCount += count;
      totalSum = totalSum.plus(total);
    }

    // Calcular a média total de todos os canais
    const totalAllTicketAverage = totalCount > 0 ? totalSum.dividedBy(totalCount).toNumber() : 0;

    // Inserir no banco de dados para cada tipo de canal
    for (const [channel, { total, count }] of Object.entries(channelTotals)) {
      const average = count > 0 ? total.dividedBy(count).toNumber() : 0;

      await this.insertBookingsTicketAverageByChannelType({
        totalAllTicketAverage: new Prisma.Decimal(totalAllTicketAverage),
        totalTicketAverage: new Prisma.Decimal(average),
        period: period as PeriodEnum,
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
        companyId,
        channelType: channel as ChannelTypeEnum, // Passa o tipo convertido
      });
    }

    return {
      totalResults,
      createdDate: adjustedEndDate,
    };
  }

  async insertBookingsTicketAverageByChannelType(
    data: BookingsTicketAverageByChannelType,
  ): Promise<BookingsTicketAverageByChannelType> {
    return this.prisma.prismaOnline.bookingsTicketAverageByChannelType.upsert({
      where: {
        period_createdDate_channelType: {
          period: data.period as PeriodEnum as PeriodEnum,
          createdDate: data.createdDate,
          channelType: data.channelType as ChannelTypeEnum,
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
    const { startDate: parsedStartDateLast7Days, endDate: parsedEndDateLast7Days } =
      this.parseDateString(
        this.formatDateString(startDateLast7Days),
        this.formatDateString(endDateLast7Days),
      );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast7Days = parsedStartDateLast7Days;
    const previousStartDateLast7Days = new Date(previousParsedEndDateLast7Days);
    previousStartDateLast7Days.setDate(previousStartDateLast7Days.getDate() - 7);
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
    const startTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob BookingsTicketAverage - últimos 7 dias: ${startTimeLast7Days}`);

    // Chamar a função para o período atual
    await this.findAllBookingsTicketAverage(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsTicketAverage(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateBookingsTicketAverageByChannelType(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateBookingsTicketAverageByChannelType(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );

    const endTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob BookingsTicketAverage - últimos 7 dias: ${endTimeLast7Days}`);

    // Últimos 30 dias
    const endDateLast30Days = new Date(currentDate);
    endDateLast30Days.setUTCHours(23, 59, 59, 999);

    const startDateLast30Days = new Date(endDateLast30Days);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30); // Vai 29 dias para trás
    startDateLast30Days.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const { startDate: parsedStartDateLast30Days, endDate: parsedEndDateLast30Days } =
      this.parseDateString(
        this.formatDateString(startDateLast30Days),
        this.formatDateString(endDateLast30Days),
      );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast30Days = parsedStartDateLast30Days;
    const previousStartDateLast30Days = new Date(previousParsedEndDateLast30Days);
    previousStartDateLast30Days.setDate(previousStartDateLast30Days.getDate() - 30);
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
    const startTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob BookingsTicketAverage - últimos 30 dias: ${startTimeLast30Days}`);

    // Chamar a função para o período atual
    await this.findAllBookingsTicketAverage(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsTicketAverage(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateBookingsTicketAverageByChannelType(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateBookingsTicketAverageByChannelType(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );

    const endTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob BookingsTicketAverage - últimos 30 dias: ${endTimeLast30Days}`);

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = new Date(currentDate);
    endDateLast6Months.setUTCHours(23, 59, 59, 999);

    const startDateLast6Months = new Date(endDateLast6Months);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6); // Vai 6 meses para trás
    startDateLast6Months.setHours(0, 0, 0, 0);

    // Parse as datas para o formato desejado
    const { startDate: parsedStartDateLast6Months, endDate: parsedEndDateLast6Months } =
      this.parseDateString(
        this.formatDateString(startDateLast6Months),
        this.formatDateString(endDateLast6Months),
      );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast6Months = parsedStartDateLast6Months;
    const previousStartDateLast6Months = new Date(previousParsedEndDateLast6Months);
    previousStartDateLast6Months.setMonth(previousStartDateLast6Months.getMonth() - 6);
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
    const startTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob BookingsTicketAverage - últimos 6 meses: ${startTimeLast6Months}`);

    // Chamar a função para o período atual
    await this.findAllBookingsTicketAverage(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsTicketAverage(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateBookingsTicketAverageByChannelType(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateBookingsTicketAverageByChannelType(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );

    const endTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob BookingsTicketAverage - últimos 6 meses: ${endTimeLast6Months}`);
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

    const parsedStartDate = new Date(Date.UTC(+startYear, +startMonth - 1, +startDay));
    const parsedEndDate = new Date(Date.UTC(+endYear, +endMonth - 1, +endDay));

    parsedStartDate.setUTCHours(0, 0, 0, 0); // Define início às 06:00
    parsedEndDate.setUTCHours(23, 59, 59, 999); // Define final às 05:59:59.999

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }
}

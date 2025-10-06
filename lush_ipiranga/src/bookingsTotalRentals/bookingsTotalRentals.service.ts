import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PeriodEnum, RentalTypeEnum, ChannelTypeEnum } from '@client-online';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingsTotalRental,
  BookingsTotalRentalByRentalType,
  BookingsTotalRentalByPeriod,
  BookingsTotalRentalByChannelType,
  BookingsTotalRentalsByPeriodEcommerce,
} from './entities/bookingsTotalRental.entity';
import * as moment from 'moment-timezone';

@Injectable()
export class BookingsTotalRentalsService {
  constructor(private prisma: PrismaService) {}

  async findAllBookingsTotalRentals(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1; // Defina o ID da empresa conforme necessário

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
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
      });

      if (!allBookings || allBookings.length === 0) {
        throw new NotFoundException('No bookings found.');
      }

      const totalAllBookings = allBookings.length; // Total de reservas agregadas

      // Monta o resultado total agregado
      const totalResult = {
        totalBookings: totalAllBookings, // Total geral de reservas
        createdDate: adjustedEndDate,
      };

      // Inserir no banco de dados
      await this.insertBookingsTotalRentals({
        totalAllBookings,
        companyId,
        period: period || null,
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
      });

      return {
        'Total Result': totalResult,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(`Falha ao buscar KpiTotalRentals: ${error.message}`);
      } else {
        throw new BadRequestException('Falha ao buscar KpiTotalRentals: erro desconhecido.');
      }
    }
  }

  async insertBookingsTotalRentals(data: BookingsTotalRental): Promise<BookingsTotalRental> {
    return this.prisma.prismaOnline.bookingsTotalRentals.upsert({
      where: {
        period_createdDate: {
          period: data.period as PeriodEnum,
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

  async bookingsTotalRentalsByRentalType(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
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
          rentalApartmentId: {
            not: null,
          },
        },
        include: {
          rentalApartment: true, // Inclui os dados do apartamento
        },
      });

      if (!allBookings || allBookings.length === 0) {
        throw new NotFoundException('No bookings found.');
      }

      // Inicializa um contador para cada tipo de locação
      const rentalCounts = {
        [RentalTypeEnum.THREE_HOURS]: 0,
        [RentalTypeEnum.SIX_HOURS]: 0,
        [RentalTypeEnum.TWELVE_HOURS]: 0,
        [RentalTypeEnum.DAY_USE]: 0,
        [RentalTypeEnum.OVERNIGHT]: 0,
        [RentalTypeEnum.DAILY]: 0,
      };

      // Processa cada reserva para contar o tipo de locação
      for (const booking of allBookings) {
        const checkIn = booking.rentalApartment?.checkIn; // Acessa checkIn do apartamento
        const checkOut = booking.rentalApartment?.checkOut; // Acessa checkOut do apartamento

        // Determina o tipo de locação
        if (!checkIn || !checkOut) {
          continue; // Pula esta reserva se checkIn ou checkOut estiverem indefinidos
        }
        const rentalType = this.determineRentalPeriod(checkIn, checkOut, allBookings);

        // Incrementa o contador para o tipo de locação correspondente
        if (Object.prototype.hasOwnProperty.call(rentalCounts, rentalType)) {
          rentalCounts[rentalType as keyof typeof rentalCounts]++;
        }
      }

      // Monta o resultado total agregado
      const totalResult = {
        totalBookingsByType: rentalCounts, // Total de reservas por tipo
        createdDate: adjustedEndDate,
      };

      // Inserir no banco de dados para cada tipo de locação
      for (const [type, count] of Object.entries(rentalCounts)) {
        // Converte a string para RentalTypeEnum
        const rentalTypeEnum = type as RentalTypeEnum; // Fazendo a conversão

        await this.insertBookingsTotalRentalsByRentalType({
          totalBookings: count,
          companyId,
          period: period,
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          rentalType: rentalTypeEnum, // Passa o tipo convertido
        });
      }

      return {
        'Total Result': totalResult,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(
          `Falha ao buscar o total de reservas por tipo de locação: ${error.message}`,
        );
      } else {
        throw new BadRequestException(
          'Falha ao buscar o total de reservas por tipo de locação: erro desconhecido',
        );
      }
    }
  }

  async insertBookingsTotalRentalsByRentalType(
    data: BookingsTotalRentalByRentalType,
  ): Promise<BookingsTotalRentalByRentalType> {
    return this.prisma.prismaOnline.bookingsTotalRentalsByRentalType.upsert({
      where: {
        period_createdDate_rentalType: {
          period: data.period as PeriodEnum,
          createdDate: data.createdDate,
          rentalType: data.rentalType as RentalTypeEnum,
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

  private async calculateTotalBookingsByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados

      // Ajustar a endDate para o final do dia anterior
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Subtrai um dia
      adjustedEndDate.setUTCHours(23, 59, 59, 999); // Define o final do dia

      // Iniciar currentDate no início do dia da startDate
      let currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0); // Início do dia contábil às 00:00:00

      // Para LAST_7_D e LAST_30_D, iteração diária
      while (currentDate <= adjustedEndDate) {
        // Use <= para incluir o último dia
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          // Para LAST_7_D e LAST_30_D, iteração diária
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo dia
        } else if (period === PeriodEnum.LAST_6_M) {
          // Para LAST_6_M, iteração mensal
          currentDate.setDate(currentDate.getDate() - 1); // Subtrai um dia
          currentDate.setUTCHours(23, 59, 59, 999);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo mês
        }

        // Consultar as reservas no período
        const allBookings = await this.prisma.prismaLocal.booking.findMany({
          where: {
            dateService: {
              gte: currentDate,
              lte: nextDate,
            },
            canceled: {
              equals: null,
            },
          },
        });

        // Contar o total de reservas
        const totalBookingsForCurrentPeriod = allBookings.length;

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0]; // Formatar a data para YYYY-MM-DD
        results[dateKey] = {
          totalBookings: totalBookingsForCurrentPeriod,
        };

        // Inserir os dados no banco de dados
        await this.insertBookingsTotalRentalsByPeriod({
          totalBookings: totalBookingsForCurrentPeriod,
          period: period,
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          companyId: 1,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalBookingsForThePeriod = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        TotalBookingsForThePeriod: totalBookingsForThePeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular o total de reservas por período:', error);
      if (error instanceof Error) {
        throw new BadRequestException(
          `Falha ao calcular o total de reservas por período: ${error.message}`,
        );
      } else {
        throw new BadRequestException(
          'Falha ao calcular o total de reservas por período: erro desconhecido',
        );
      }
    }
  }

  async insertBookingsTotalRentalsByPeriod(
    data: BookingsTotalRentalByPeriod,
  ): Promise<BookingsTotalRentalByPeriod> {
    return this.prisma.prismaOnline.bookingsTotalRentalsByPeriod.upsert({
      where: {
        period_createdDate: {
          period: data.period as PeriodEnum,
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

  async bookingsTotalRentalsByChannelType(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1; // Defina o ID da empresa conforme necessário

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);

      if (
        period === PeriodEnum.LAST_7_D ||
        period === PeriodEnum.LAST_30_D ||
        period === PeriodEnum.LAST_6_M
      ) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
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
        select: {
          originBooking: true, // Inclui os dados da origem da reserva
          startDate: true,
          dateService: true,
        },
      });

      if (!allBookings || allBookings.length === 0) {
        throw new NotFoundException('No bookings found.');
      }

      // Inicializa um contador para cada tipo de canal
      const channelCounts = {
        [ChannelTypeEnum.WEBSITE_SCHEDULED]: 0,
        [ChannelTypeEnum.WEBSITE_IMMEDIATE]: 0,
        [ChannelTypeEnum.INTERNAL]: 0,
        [ChannelTypeEnum.GUIA_GO]: 0,
        [ChannelTypeEnum.GUIA_SCHEDULED]: 0,
        [ChannelTypeEnum.BOOKING]: 0,
        [ChannelTypeEnum.EXPEDIA]: 0,
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

      // Processa cada reserva para contar o tipo de canal
      for (const booking of allBookings) {
        // Verifica se originBooking não é nulo antes de acessar o id
        const channelType = booking.originBooking
          ? getChannelType(
              booking.originBooking.id, // Acessa o idTypeOriginBooking da reserva
              booking.dateService, // Acessa a data do serviço
              booking.startDate, // Passa a data de início
            )
          : null;

        // Incrementa o contador para o tipo de canal correspondente
        if (channelType && channelCounts[channelType] !== undefined) {
          channelCounts[channelType]++;
        }
      }

      // Calcular o total de reservas
      const totalAllBookings = Object.values(channelCounts).reduce(
        (total, count) => total + count,
        0,
      );

      // Monta o resultado total agregado
      const totalResult = {
        totalBookingsByChannel: channelCounts, // Total de reservas por canal
        createdDate: adjustedEndDate,
      };

      // Inserir no banco de dados para cada tipo de canal
      for (const [type, count] of Object.entries(channelCounts)) {
        // Converte a string para ChannelTypeEnum
        const channelTypeEnum = type as ChannelTypeEnum; // Fazendo a conversão

        await this.insertBookingsTotalRentalsByChannelType({
          totalBookings: count, // Contagem de reservas por canal
          totalAllBookings, // Total de reservas de todos os canais
          companyId,
          period: period,
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          channelType: channelTypeEnum, // Passa o tipo convertido
        });
      }

      return {
        'Total Result': totalResult,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(
          `Falha ao buscar o total de reservas por tipo de canal: ${error.message}`,
        );
      } else {
        throw new BadRequestException(
          'Falha ao buscar o total de reservas por tipo de canal: erro desconhecido',
        );
      }
    }
  }

  async insertBookingsTotalRentalsByChannelType(
    data: BookingsTotalRentalByChannelType,
  ): Promise<BookingsTotalRentalByChannelType> {
    return this.prisma.prismaOnline.bookingsTotalRentalsByChannelType.upsert({
      where: {
        period_createdDate_channelType: {
          period: data.period as PeriodEnum,
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

  private async calculateTotalBookingsByPeriodEcommerce(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados

      // Ajustar a endDate para o final do dia anterior
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Subtrai um dia
      adjustedEndDate.setUTCHours(23, 59, 59, 999); // Define o final do dia

      // Iniciar currentDate no início do dia da startDate
      let currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0); // Início do dia contábil às 00:00:00

      while (currentDate <= adjustedEndDate) {
        // Use <= para incluir o último dia
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          // Para LAST_7_D e LAST_30_D, iteração diária
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo dia
        } else if (period === PeriodEnum.LAST_6_M) {
          // Para LAST_6_M, iteração mensal
          currentDate.setDate(currentDate.getDate() - 1); // Subtrai um dia
          currentDate.setUTCHours(23, 59, 59, 999);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo mês
        }
        // Consultar as reservas no período
        const allBookings = await this.prisma.prismaLocal.booking.findMany({
          where: {
            dateService: {
              gte: currentDate,
              lte: nextDate,
            },
            canceled: {
              equals: null,
            },
            idTypeOriginBooking: {
              equals: 4,
            },
          },
        });

        // Contar o total de reservas
        const totalBookingsForCurrentPeriod = allBookings.length;

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0]; // Formatar a data para YYYY-MM-DD
        results[dateKey] = {
          totalBookings: totalBookingsForCurrentPeriod,
        };

        // Inserir os dados no banco de dados
        await this.insertBookingsTotalRentalsByPeriodEcommerce({
          totalBookings: totalBookingsForCurrentPeriod,
          period: period,
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          companyId: 1,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalBookingsForThePeriod = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        TotalBookingsForThePeriod: totalBookingsForThePeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular o total de reservas por período:', error);
      let errorMessage = 'Erro desconhecido';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new BadRequestException(
        `Failed to calculate total bookings by period: ${errorMessage}`,
      );
    }
  }

  async insertBookingsTotalRentalsByPeriodEcommerce(
    data: BookingsTotalRentalsByPeriodEcommerce,
  ): Promise<BookingsTotalRentalsByPeriodEcommerce> {
    return this.prisma.prismaOnline.bookingsTotalRentalsByPeriodEcommerce.upsert({
      where: {
        period_createdDate: {
          period: data.period as PeriodEnum,
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
    console.log(`Início CronJob BookingsTotalRentals - últimos 7 dias: ${startTimeLast7Days}`);

    // Chamar a função para o período atual
    await this.findAllBookingsTotalRentals(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsTotalRentals(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    await this.bookingsTotalRentalsByRentalType(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateTotalBookingsByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.bookingsTotalRentalsByChannelType(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.bookingsTotalRentalsByChannelType(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateTotalBookingsByPeriodEcommerce(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    const endTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob BookingsTotalRentals - últimos 7 dias: ${endTimeLast7Days}`);

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
    console.log(`Início CronJob BookingsTotalRentals - últimos 30 dias: ${startTimeLast30Days}`);

    // Chamar a função para o período atual
    await this.findAllBookingsTotalRentals(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsTotalRentals(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.bookingsTotalRentalsByRentalType(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalBookingsByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.bookingsTotalRentalsByChannelType(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.bookingsTotalRentalsByChannelType(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalBookingsByPeriodEcommerce(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );

    const endTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob BookingsTotalRentals - últimos 30 dias: ${endTimeLast30Days}`);

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
    console.log(`Início CronJob BookingsTotalRentals - últimos 6 meses: ${startTimeLast6Months}`);

    // Chamar a função para o período atual
    await this.findAllBookingsTotalRentals(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsTotalRentals(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.bookingsTotalRentalsByRentalType(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalBookingsByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.bookingsTotalRentalsByChannelType(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.bookingsTotalRentalsByChannelType(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalBookingsByPeriodEcommerce(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );

    const endTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob BookingsTotalRentals - últimos 6 meses: ${endTimeLast6Months}`);
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

  private determineRentalPeriod(checkIn: Date, checkOut: Date, Booking: any): string {
    const occupationTimeSeconds = this.calculateOccupationTime(checkIn, checkOut);

    // Convertendo check-in e check-out para objetos Date
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    const checkInHour = checkInDate.getHours();
    const checkOutHour = checkOutDate.getHours();
    const checkOutMinutes = checkOutDate.getMinutes();

    // Verificação por horas de ocupação (3, 6 e 12 horas)
    if (occupationTimeSeconds <= 3 * 3600 + 15 * 60) {
      return 'THREE_HOURS';
    } else if (occupationTimeSeconds <= 6 * 3600 + 15 * 60) {
      return 'SIX_HOURS';
    } else if (occupationTimeSeconds <= 12 * 3600 + 15 * 60) {
      return 'TWELVE_HOURS';
    }

    // Se houver reservas, calcular os tipos adicionais
    if (Booking && Array.isArray(Booking) && Booking.length > 0) {
      // Regra para Day Use
      if (checkInHour >= 13 && checkOutHour <= 19 && checkOutMinutes <= 15) {
        return 'DAY_USE';
      }

      // Regra para Overnight
      const overnightMinimumStaySeconds = 12 * 3600 + 15 * 60;
      if (
        checkInHour >= 20 &&
        checkInHour <= 23 &&
        checkOutHour >= 8 &&
        (checkOutHour < 12 || (checkOutHour === 12 && checkOutMinutes <= 15)) &&
        occupationTimeSeconds >= overnightMinimumStaySeconds
      ) {
        return 'OVERNIGHT';
      }

      // Verificação para Diária
      if (
        occupationTimeSeconds > 16 * 3600 + 15 * 60 ||
        (checkInHour <= 15 && (checkOutHour > 12 || (checkOutHour === 12 && checkOutMinutes <= 15)))
      ) {
        return 'DAILY';
      }
    }

    // Caso nenhuma condição acima seja satisfeita, retorna 12 horas como padrão
    return 'TWELVE_HOURS';
  }

  private calculateOccupationTime(checkIn: Date, checkOut: Date): number {
    const checkInTime = new Date(checkIn).getTime();
    const checkOutTime = new Date(checkOut).getTime();
    return (checkOutTime - checkInTime) / 1000; // Tempo em segundos
  }
}

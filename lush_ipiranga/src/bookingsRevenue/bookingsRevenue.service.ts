import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import {
  ChannelTypeEnum,
  PeriodEnum,
  Prisma,
} from '../../dist/generated/client-online';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingsRevenue,
  BookingsRevenueByChannelType,
  BookingsRevenueByPayment,
  BookingsRevenueByPeriod,
  BookingsRevenueByPeriodEcommerce,
} from './entities/bookingsRevenue.entity';

@Injectable()
export class BookingsRevenueService {
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
          priceRental: {
            not: null,
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
      this.prisma.prismaLocal.originBooking.findMany({
        where: {
          deletionDate: {
            equals: null,
          },
        },
        select: {
          typeOrigin: true,
        },
      }),
      this.prisma.prismaLocal.newRelease.findMany({
        where: {
          deletionDate: {
            equals: null,
          },
          releaseType: {
            equals: 'RESERVA',
          },
        },
        select: {
          halfPaymentId: true,
          originalsId: true,
        },
      }),
      this.prisma.prismaLocal.halfPayment.findMany({
        where: {
          deletionDate: {
            equals: null,
          },
        },
        select: {
          id: true, // Adicione o id para o mapeamento
          name: true,
        },
      }),
    ]);
  }

  async findAllBookingsRevenue(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      }

      // Buscar todas as receitas de reservas no intervalo de datas
      const [allBookingsRevenue] = await this.fetchKpiData(
        startDate,
        adjustedEndDate,
      );

      if (!allBookingsRevenue || allBookingsRevenue.length === 0) {
        throw new NotFoundException('No booking revenue found.');
      }

      // Calcular o total de priceRental
      const totalAllValue = allBookingsRevenue.reduce((total, booking) => {
        return total.plus(Number(booking.priceRental));
      }, new Prisma.Decimal(0));

      // Inserir a receita de reservas no banco de dados
      await this.insertBookingsRevenue({
        totalAllValue,
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
        period: period || null,
        companyId,
      });

      // Retornar o total formatado como moeda
      const formattedBookingsRevenueData = {
        totalAllValue: this.formatCurrency(totalAllValue.toNumber()),
      };

      return formattedBookingsRevenueData;
    } catch (error) {
      console.error('Erro ao buscar Bookings Revenue data:', error);
      throw new BadRequestException(
        `Failed to fetch Bookings Revenue data: ${error.message}`,
      );
    }
  }

  private async insertBookingsRevenue(
    data: BookingsRevenue,
  ): Promise<BookingsRevenue> {
    return this.prisma.prismaOnline.bookingsRevenue.upsert({
      where: {
        period_createdDate: {
          period: data.period,
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

  private async calculateRevenueByChannelType(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ) {
    const companyId = 1;

    const adjustedEndDate = new Date(endDate);
    if (
      period === PeriodEnum.LAST_7_D ||
      period === PeriodEnum.LAST_30_D ||
      period === PeriodEnum.LAST_6_M
    ) {
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
    }

    // Buscar todas as receitas de reservas e os tipos de origem
    const [allBookingsRevenue] = await this.fetchKpiData(
      startDate,
      adjustedEndDate,
    );

    if (!allBookingsRevenue || allBookingsRevenue.length === 0) {
      throw new NotFoundException('No booking revenue found.');
    }

    // Mapa para armazenar os totais por channelType
    const revenueByChannelType = new Map<ChannelTypeEnum, Prisma.Decimal>([
      [ChannelTypeEnum.INTERNAL, new Prisma.Decimal(0)],
      [ChannelTypeEnum.GUIA_GO, new Prisma.Decimal(0)],
      [ChannelTypeEnum.GUIA_SCHEDULED, new Prisma.Decimal(0)],
      [ChannelTypeEnum.WEBSITE_IMMEDIATE, new Prisma.Decimal(0)],
      [ChannelTypeEnum.WEBSITE_SCHEDULED, new Prisma.Decimal(0)],
      [ChannelTypeEnum.BOOKING, new Prisma.Decimal(0)],
      [ChannelTypeEnum.EXPEDIA, new Prisma.Decimal(0)],
    ]);

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

      switch (idTypeOriginBooking) {
        case 1: // SISTEMA
          return ChannelTypeEnum.INTERNAL;
        case 3: // GUIA_DE_MOTEIS
          return isSameDate(dateService, startDate)
            ? ChannelTypeEnum.GUIA_GO
            : ChannelTypeEnum.GUIA_SCHEDULED;
        case 4: // RESERVA_API
          return isSameDate(dateService, startDate)
            ? ChannelTypeEnum.WEBSITE_IMMEDIATE
            : ChannelTypeEnum.WEBSITE_SCHEDULED;
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

    // Calcular o total de priceRental por channelType
    allBookingsRevenue.forEach((booking) => {
      const channelType = getChannelType(
        booking.idTypeOriginBooking,
        booking.dateService,
        booking.startDate,
      ); // Mapeia o idTypeOriginBooking para channelType

      if (channelType) {
        // Acumula o valor atual ao total existente
        const currentTotal = revenueByChannelType.get(channelType);
        revenueByChannelType.set(
          channelType,
          currentTotal.plus(new Prisma.Decimal(booking.priceRental)),
        );
      }
    });

    // Calcular o total de todos os canais
    const totalAllValue = Array.from(revenueByChannelType.values()).reduce(
      (total, current) => {
        return total.plus(current);
      },
      new Prisma.Decimal(0),
    );

    // Definir a data de criação como a data ajustada
    const createdDate = new Date(adjustedEndDate);
    createdDate.setUTCHours(5, 59, 59, 999); // Ajusta a hora para 05:59

    // Inserir ou atualizar os resultados na tabela BookingsByChannelType
    for (const [channelType, totalValue] of revenueByChannelType.entries()) {
      await this.insertBookingsRevenueByChannelType({
        channelType,
        period,
        totalValue,
        totalAllValue, // O totalAllValue é o mesmo para todos os channelTypes
        createdDate, // Usar a data de criação ajustada
        companyId,
      });
    }

    // Preparar o retorno no formato desejado
    const categories = Array.from(revenueByChannelType.keys());
    const series = Array.from(revenueByChannelType.values()).map(
      (value) => this.formatCurrency(value.toNumber() || 0), // Garantir que valores nulos sejam convertidos para R$0,00
    );

    const result = {
      BookingRevenueByChannelType: {
        categories,
        series,
      },
    };

    return result;
  }

  private async insertBookingsRevenueByChannelType(
    data: BookingsRevenueByChannelType,
  ): Promise<BookingsRevenueByChannelType> {
    return this.prisma.prismaOnline.bookingsRevenueByChannelType.upsert({
      where: {
        period_createdDate_channelType: {
          period: data.period,
          createdDate: data.createdDate,
          channelType: data.channelType,
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

  private async calculateTotalBookingRevenueByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados
      const companyId = 1;

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
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo mês
        }

        // Buscar todas as receitas de reservas para o período atual
        const allBookingsRevenue =
          await this.prisma.prismaLocal.booking.findMany({
            where: {
              dateService: {
                gte: currentDate,
                lte: nextDate,
              },
              canceled: {
                equals: null,
              },
              priceRental: {
                not: null,
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
          });

        let totalValueForCurrentPeriod = new Prisma.Decimal(0);

        // Calcular o total para o período atual
        allBookingsRevenue.forEach((booking) => {
          // Certifique-se de que priceRental é um Decimal
          totalValueForCurrentPeriod = totalValueForCurrentPeriod.plus(
            new Prisma.Decimal(booking.priceRental || 0), // Adiciona 0 se priceRental for nulo
          );
        });

        // Formatar o totalValue
        const formattedTotalValue = this.formatCurrency(
          totalValueForCurrentPeriod.toNumber() || 0,
        );

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0]; // Usando toISOString para formatar a data
        results[dateKey] = {
          totalValue: formattedTotalValue,
        };

        // Inserir a receita de reservas no banco de dados
        await this.insertBookingsRevenueByPeriod({
          totalValue: totalValueForCurrentPeriod,
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          period: period || null,
          companyId,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalBookingRevenueByDate = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        BookingRevenueByDate: totalBookingRevenueByDate,
      };
    } catch (error) {
      console.error('Erro ao calcular a receita total por período:', error);
      throw new BadRequestException(
        `Failed to calculate total booking revenue by period: ${error.message}`,
      );
    }
  }

  private async insertBookingsRevenueByPeriod(
    data: BookingsRevenueByPeriod,
  ): Promise<BookingsRevenueByPeriod> {
    return this.prisma.prismaOnline.bookingsRevenueByPeriod.upsert({
      where: {
        period_createdDate: {
          period: data.period,
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

  private async calculateRevenueByPaymentMethod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    const companyId = 1; // Defina o ID da empresa conforme necessário

    // Ajustar a data final para não incluir a data atual
    const adjustedEndDate = new Date(endDate);
    if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
    }

    // Buscar todas as reservas e os novos lançamentos
    const [allBookings, originBookings, newReleases, halfPayments] =
      await this.fetchKpiData(startDate, adjustedEndDate);

    if (!allBookings || allBookings.length === 0) {
      throw new NotFoundException('No bookings found.');
    }

    // Cria um mapa para associar halfPaymentId ao name
    const halfPaymentMap = new Map<number, string>();
    for (const halfPayment of halfPayments) {
      halfPaymentMap.set(halfPayment.id, halfPayment.name);
    }

    // Inicializa um objeto para armazenar os totais por meio de pagamento
    const revenueByPaymentMethod = new Map<string, Prisma.Decimal>(); // Mapeia o nome do meio de pagamento

    // Calcular o total de priceRental por meio de pagamento
    for (const booking of allBookings) {
      const matchingNewRelease = newReleases.find(
        (release) => release.originalsId === booking.id, // Comparando booking.id com release.originalsId
      );

      if (matchingNewRelease) {
        const halfPaymentId = matchingNewRelease.halfPaymentId;
        const paymentName = halfPaymentMap.get(halfPaymentId); // Obtém o nome do meio de pagamento

        // Inicializa o total para o meio de pagamento se não existir
        if (!revenueByPaymentMethod.has(paymentName)) {
          revenueByPaymentMethod.set(paymentName, new Prisma.Decimal(0));
        }

        // Acumula o valor atual ao total existente
        const currentTotal = revenueByPaymentMethod.get(paymentName);
        revenueByPaymentMethod.set(
          paymentName,
          currentTotal.plus(new Prisma.Decimal(booking.priceRental)),
        );
      }
    }

    // Monta o resultado total agregado e insere no banco de dados
    for (const [paymentName, totalValue] of revenueByPaymentMethod.entries()) {
      let createdDate = new Date(); // Data atual
      createdDate.setDate(createdDate.getDate() - 1); // Define como o dia anterior
      createdDate.setUTCHours(5, 59, 59, 999); // Ajusta a hora para 05:59

      await this.insertBookingsRevenueByPaymentMethod({
        totalValue,
        createdDate,
        period: period,
        paymentMethod: paymentName, // Nome do meio de pagamento
        companyId,
      });
    }

    // Monta o resultado total para retorno
    const totalResults = {};
    for (const [paymentName, totalValue] of revenueByPaymentMethod.entries()) {
      totalResults[paymentName] = {
        total: this.formatCurrency(totalValue.toNumber()), // Formata o total em reais
      };
    }

    // Retornar os resultados calculados
    return {
      totalResults,
      createdDate: adjustedEndDate,
    };
  }

  private async insertBookingsRevenueByPaymentMethod(
    data: BookingsRevenueByPayment,
  ): Promise<BookingsRevenueByPayment> {
    return this.prisma.prismaOnline.bookingsRevenueByPayment.upsert({
      where: {
        period_createdDate_paymentMethod: {
          period: data.period,
          createdDate: data.createdDate,
          paymentMethod: data.paymentMethod,
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

  private async calculateTotalBookingRevenueByPeriodEcommerce(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados
      const companyId = 1;

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
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo mês
        }

        // Buscar todas as receitas de reservas para o período atual
        const allBookingsRevenue =
          await this.prisma.prismaLocal.booking.findMany({
            where: {
              dateService: {
                gte: currentDate,
                lte: nextDate,
              },
              canceled: {
                equals: null,
              },
              priceRental: {
                not: null,
              },
              idTypeOriginBooking: {
                equals: 4,
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
          });

        let totalValueForCurrentPeriod = new Prisma.Decimal(0);

        // Calcular o total para o período atual
        allBookingsRevenue.forEach((booking) => {
          // Certifique-se de que priceRental é um Decimal
          totalValueForCurrentPeriod = totalValueForCurrentPeriod.plus(
            new Prisma.Decimal(booking.priceRental || 0), // Adiciona 0 se priceRental for nulo
          );
        });

        // Formatar o totalValue
        const formattedTotalValue = this.formatCurrency(
          totalValueForCurrentPeriod.toNumber() || 0,
        );

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0]; // Usando toISOString para formatar a data
        results[dateKey] = {
          totalValue: formattedTotalValue,
        };

        // Inserir a receita de reservas no banco de dados
        await this.insertBookingsRevenueByPeriodEcommerce({
          totalValue: totalValueForCurrentPeriod,
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          period: period || null,
          companyId,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalBookingRevenueByDate = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        BookingRevenueByDate: totalBookingRevenueByDate,
      };
    } catch (error) {
      console.error('Erro ao calcular a receita total por período:', error);
      throw new BadRequestException(
        `Failed to calculate total booking revenue by period: ${error.message}`,
      );
    }
  }

  private async insertBookingsRevenueByPeriodEcommerce(
    data: BookingsRevenueByPeriodEcommerce,
  ): Promise<BookingsRevenueByPeriodEcommerce> {
    return this.prisma.prismaOnline.bookingsRevenueByPeriodEcommerce.upsert({
      where: {
        period_createdDate: {
          period: data.period,
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
    const endDateLast7Days = new Date(currentDate);
    endDateLast7Days.setDate(endDateLast7Days.getDate() - 1); // Exclui o dia de hoje
    endDateLast7Days.setHours(23, 59, 59, 999);

    const startDateLast7Days = new Date(endDateLast7Days);
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 6); // Vai 6 dias para trás
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
      `Início CronJob BookingRevenue - últimos 7 dias: ${startTimeLast7Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllBookingsRevenue(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsRevenue(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateRevenueByChannelType(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateRevenueByChannelType(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateTotalBookingRevenueByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateRevenueByPaymentMethod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateTotalBookingRevenueByPeriodEcommerce(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob BookingRevenue - últimos 7 dias: ${endTimeLast7Days}`,
    );

    // Últimos 30 dias
    const endDateLast30Days = new Date(currentDate);
    endDateLast30Days.setDate(endDateLast30Days.getDate() - 1); // Exclui o dia de hoje
    endDateLast30Days.setHours(23, 59, 59, 999);

    const startDateLast30Days = new Date(endDateLast30Days);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 29); // Vai 29 dias para trás
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
      `Início CronJob BookingRevenue - últimos 30 dias: ${startTimeLast30Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllBookingsRevenue(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsRevenue(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRevenueByChannelType(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRevenueByChannelType(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalBookingRevenueByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRevenueByPaymentMethod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalBookingRevenueByPeriodEcommerce(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );

    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob BookingRevenue - últimos 30 dias: ${endTimeLast30Days}`,
    );

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = new Date(currentDate);
    endDateLast6Months.setDate(endDateLast6Months.getDate() - 1); // Exclui o dia de hoje
    endDateLast6Months.setHours(23, 59, 59, 999);

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
      `Início CronJob BookingRevenue - últimos 6 meses: ${startTimeLast6Months}`,
    );

    // Chamar a função para o período atual
    await this.findAllBookingsRevenue(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsRevenue(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRevenueByChannelType(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRevenueByChannelType(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalBookingRevenueByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRevenueByPaymentMethod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalBookingRevenueByPeriodEcommerce(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );

    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob BookingRevenue - últimos 6 meses: ${endTimeLast6Months}`,
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

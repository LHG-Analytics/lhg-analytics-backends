import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import {
  PeriodEnum,
  ChannelTypeEnum,
  Prisma,
} from '../../dist/generated/client-online';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingsRepresentativeness,
  BookingsRepresentativenessByPeriod,
  BookingsRepresentativenessByChannelType,
} from './entities/bookingsRepresentativeness.entity';

@Injectable()
export class BookingsRepresentativenessService {
  constructor(private prisma: PrismaService) {}

  private async calculateTotalSaleDirect(
    startDate: Date,
    endDate: Date,
  ): Promise<Prisma.Decimal> {
    const stockOutItems = await this.prisma.prismaLocal.stockOutItem.findMany({
      where: {
        stockOuts: {
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        canceled: null,
        typePriceSale: {
          not: null,
        },
      },
      include: {
        stockOuts: {
          include: {
            saleDirect: true,
            sale: {
              select: {
                discount: true,
              },
            },
          },
        },
      },
    });

    return stockOutItems.reduce((totalSaleDirect, stockOutItem) => {
      const stockOut = stockOutItem.stockOuts;

      if (stockOut && stockOut.saleDirect) {
        const saleDirects = Array.isArray(stockOut.saleDirect)
          ? stockOut.saleDirect
          : [stockOut.saleDirect];
        const discountSale = stockOut.sale?.discount
          ? new Prisma.Decimal(stockOut.sale.discount)
          : new Prisma.Decimal(0);

        saleDirects.forEach((saleDirect) => {
          if (saleDirect && stockOutItem.stockOutId === saleDirect.stockOutId) {
            const itemTotal = new Prisma.Decimal(stockOutItem.priceSale).times(
              new Prisma.Decimal(stockOutItem.quantity),
            );
            totalSaleDirect = totalSaleDirect.plus(
              itemTotal.minus(discountSale),
            );
          }
        });
      }

      return totalSaleDirect;
    }, new Prisma.Decimal(0));
  }

  private async fetchKpiData(startDate: Date, adjustedEndDate: Date) {
    return await Promise.all([
      this.calculateTotalSaleDirect(startDate, adjustedEndDate),
      this.prisma.prismaLocal.rentalApartment.findMany({
        where: {
          checkIn: {
            gte: startDate,
            lte: adjustedEndDate,
          },
          endOccupationType: 'FINALIZADA',
        },
      }),
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
    ]);
  }

  async findAllBookingsRepresentativeness(
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

      // Buscar todas as receitas de reservas e apartamentos
      const [totalSaleDirect, allRentalApartments, allBookingsRevenue] =
        await this.fetchKpiData(startDate, adjustedEndDate);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      // Calcular o total de rentalApartment
      const totalValueForRentalApartments = allRentalApartments.reduce(
        (total, apartment) => {
          return total.plus(new Prisma.Decimal(apartment.totalValue || 0)); // Adiciona 0 se totalValue for nulo
        },
        new Prisma.Decimal(0),
      );

      // Calcular a receita total
      const totalRevenue = totalSaleDirect.plus(totalValueForRentalApartments);

      // Calcular a receita total de bookings
      const totalAllValue = allBookingsRevenue.reduce((total, booking) => {
        return total.plus(new Prisma.Decimal(booking.priceRental || 0)); // Adiciona 0 se priceRental for nulo
      }, new Prisma.Decimal(0));

      // Calcular a representatividade
      const representativeness =
        totalRevenue && !totalRevenue.isZero()
          ? totalAllValue.dividedBy(totalRevenue).toNumber()
          : 0; // Se totalRevenue for null ou zero, retorna 0

      // Inserir a representatividade no banco de dados
      await this.insertBookingsRepresentativeness({
        totalAllRepresentativeness: new Prisma.Decimal(representativeness),
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)),
        period: period,
        companyId,
      });

      // Retornar apenas o totalAllRepresentativeness e createdDate
      return {
        totalAllRepresentativeness: this.formatPercentage(representativeness),
        createdDate: adjustedEndDate,
      };
    } catch (error) {
      console.error('Erro ao buscar Bookings Representativeness data:', error);
      throw new BadRequestException(
        `Failed to fetch Bookings Representativeness data: ${error.message}`,
      );
    }
  }

  private async insertBookingsRepresentativeness(
    data: BookingsRepresentativeness,
  ): Promise<BookingsRepresentativeness> {
    return this.prisma.prismaOnline.bookingsRepresentativeness.upsert({
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

  private async calculateBookingsRepresentativenessByPeriod(
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
        const [totalSaleDirect, allRentalApartments, allBookingsRevenue] =
          await Promise.all([
            this.calculateTotalSaleDirect(currentDate, nextDate),
            this.prisma.prismaLocal.rentalApartment.findMany({
              where: {
                checkIn: {
                  gte: currentDate,
                  lte: nextDate,
                },
                endOccupationType: 'FINALIZADA',
              },
            }),
            this.prisma.prismaLocal.booking.findMany({
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
            }),
          ]);

        // Calcular a receita total de reservas para o período atual
        const totalAllValue = allBookingsRevenue.reduce((total, booking) => {
          return total.plus(new Prisma.Decimal(booking.priceRental || 0)); // Adiciona 0 se priceRental for nulo
        }, new Prisma.Decimal(0));

        // Calcular a receita total de locação para o período atual
        const totalValueForRentalApartments = allRentalApartments.reduce(
          (total, apartment) => {
            return total.plus(new Prisma.Decimal(apartment.totalValue || 0)); // Adiciona 0 se totalValue for nulo
          },
          new Prisma.Decimal(0),
        );

        // Calcular a receita total (vendas diretas + locação)
        const totalRevenue = totalSaleDirect.plus(
          totalValueForRentalApartments,
        );

        // Calcular a representatividade
        const representativeness =
          totalRevenue && !totalRevenue.isZero()
            ? totalAllValue.dividedBy(totalRevenue).toNumber()
            : 0; // Se totalRevenue for null ou zero, retorna 0

        // Inserir a representatividade no banco de dados
        await this.insertBookingsRepresentativenessByPeriod({
          totalRepresentativeness: new Prisma.Decimal(representativeness),
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)), // Data de criação
          period: period,
          companyId,
        });

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0]; // Usando toISOString para formatar a data
        results[dateKey] = {
          representativeness: this.formatPercentage(representativeness), // Formatar representatividade
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)), // Data de criação
        };

        currentDate = new Date(nextDate);
      }

      // Retornar apenas o resultado final
      return {
        BookingRepresentativenessByDate: results,
      };
    } catch (error) {
      console.error(
        'Erro ao calcular a representatividade de bookings por período:',
        error,
      );
      throw new BadRequestException(
        `Failed to calculate bookings representativeness by period: ${error.message}`,
      );
    }
  }

  private async insertBookingsRepresentativenessByPeriod(
    data: BookingsRepresentativenessByPeriod,
  ): Promise<BookingsRepresentativenessByPeriod> {
    return this.prisma.prismaOnline.bookingsRepresentativenessByPeriod.upsert({
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

  private async calculateBookingsRepresentativenessByChannelType(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      // Ajustar a endDate para o final do dia anterior
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Subtrai um dia
      adjustedEndDate.setUTCHours(23, 59, 59, 999); // Define o final do dia

      // Buscar todas as receitas de reservas e os tipos de origem
      const [totalSaleDirect, allRentalApartments, allBookingsRevenue] =
        await Promise.all([
          this.calculateTotalSaleDirect(startDate, adjustedEndDate),
          this.prisma.prismaLocal.rentalApartment.findMany({
            where: {
              checkIn: {
                gte: startDate,
                lte: adjustedEndDate,
              },
              endOccupationType: 'FINALIZADA',
            },
          }),
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
        ]);

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
        switch (idTypeOriginBooking) {
          case 1: // SISTEMA
            return ChannelTypeEnum.INTERNAL;
          case 3: // GUIA_DE_MOTEIS
            return dateService.toDateString() === startDate.toDateString()
              ? ChannelTypeEnum.GUIA_GO
              : ChannelTypeEnum.GUIA_SCHEDULED;
          case 4: // RESERVA_API
            return dateService.toDateString() === startDate.toDateString()
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

      // Calcular a receita total (vendas diretas + locações)
      const totalRevenue = totalSaleDirect.plus(
        allRentalApartments.reduce((total, apartment) => {
          return total.plus(new Prisma.Decimal(apartment.totalValue || 0)); // Adiciona 0 se totalValue for nulo
        }, new Prisma.Decimal(0)),
      );

      // Calcular a representatividade para cada canal
      const representativenessByChannel = {};
      let totalAllRepresentativeness = new Prisma.Decimal(0); // Inicializa a representatividade total

      for (const [channelType, totalValue] of revenueByChannelType.entries()) {
        const representativeness =
          totalRevenue && !totalRevenue.isZero() // Se a receita total for 0 ou null
            ? totalValue.dividedBy(totalRevenue).toNumber() // Receita do canal dividido pela receita total
            : 0; // Se totalRevenue for null ou zero, retorna 0

        representativenessByChannel[channelType] = representativeness;

        // Acumula a representatividade total
        totalAllRepresentativeness = totalAllRepresentativeness.plus(
          totalValue || new Prisma.Decimal(0), // Se totalValue for null, usa 0
        );
      }

      // Calcular o totalAllRepresentativeness
      const finalTotalAllRepresentativeness =
        totalRevenue && !totalRevenue.isZero()
          ? totalAllRepresentativeness.dividedBy(totalRevenue).toNumber()
          : 0; // Se totalRevenue for null ou zero, retorna 0

      // Inserir ou atualizar os resultados na tabela BookingsByChannelType
      for (const channelType of revenueByChannelType.keys()) {
        await this.insertBookingsRepresentativenessByChannelType({
          channelType,
          period,
          totalRepresentativeness: new Prisma.Decimal(
            representativenessByChannel[channelType],
          ), // Armazenar a representatividade
          totalAllRepresentativeness: new Prisma.Decimal(
            finalTotalAllRepresentativeness,
          ), // Armazenar a representatividade total
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)),
          companyId,
        });
      }

      // Preparar o retorno no formato desejado
      return {
        representativenessByChannel,
      };
    } catch (error) {
      console.error(
        'Erro ao calcular a representatividade de bookings por canal:',
        error,
      );
      throw new BadRequestException(
        `Failed to calculate bookings representativeness by channel: ${error.message}`,
      );
    }
  }

  private async insertBookingsRepresentativenessByChannelType(
    data: BookingsRepresentativenessByChannelType,
  ): Promise<BookingsRepresentativenessByChannelType> {
    return this.prisma.prismaOnline.bookingsRepresentativenessByChannelType.upsert(
      {
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
      },
    );
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
      `Início CronJob BookingRepresentativeness - últimos 7 dias: ${startTimeLast7Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllBookingsRepresentativeness(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsRepresentativeness(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateBookingsRepresentativenessByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateBookingsRepresentativenessByChannelType(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateBookingsRepresentativenessByChannelType(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );

    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob BookingRepresentativeness - últimos 7 dias: ${endTimeLast7Days}`,
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
      `Início CronJob BookingRepresentativeness - últimos 30 dias: ${startTimeLast30Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllBookingsRepresentativeness(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsRepresentativeness(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateBookingsRepresentativenessByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateBookingsRepresentativenessByChannelType(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateBookingsRepresentativenessByChannelType(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );

    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob BookingRepresentativeness - últimos 30 dias: ${endTimeLast30Days}`,
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
      `Início CronJob BookingRepresentativeness - últimos 6 meses: ${startTimeLast6Months}`,
    );

    // Chamar a função para o período atual
    await this.findAllBookingsRepresentativeness(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllBookingsRepresentativeness(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateBookingsRepresentativenessByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateBookingsRepresentativenessByChannelType(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateBookingsRepresentativenessByChannelType(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );

    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob BookingRepresentativeness - últimos 6 meses: ${endTimeLast6Months}`,
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

  private formatPercentage(value: number): string {
    const percentageValue = value * 100;
    return `${percentageValue.toFixed(2)}%`;
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PeriodEnum } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import { KpiTotalRentals, KpiTotalRentalsByPeriod } from './entities/kpiTotalRental.entity';

@Injectable()
export class KpiTotalRentalsService {
  constructor(private prisma: PrismaService) {}

  async findAllKpiTotalRentals(startDate: Date, endDate: Date, period?: PeriodEnum): Promise<any> {
    try {
      const companyId = 1; // Defina o ID da empresa conforme necessário

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        // Para LAST_6_M, subtrair um dia para não incluir a data atual
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      } else if (period === PeriodEnum.ESTE_MES) {
        // Para ESTE_MES, a data final já vem como hoje do handleCron
        // Não precisa ajustar, usa como está
      }

      const [allRentalApartments, suiteCategories, allBookings] = await Promise.all([
        this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: startDate,
              lte: endDate,
            },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            suiteStates: {
              include: {
                suite: {
                  include: {
                    suiteCategories: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.prismaLocal.suiteCategory.findMany({
          where: {
            id: {
              in: [2, 3, 4, 5, 6, 7, 12],
            },
          },
        }),
        this.prisma.prismaLocal.booking.findMany({
          where: {
            rentalApartment: {
              checkIn: {
                gte: startDate,
                lte: endDate,
              },
              endOccupationType: 'FINALIZADA',
            },
          },
        }),
      ]);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      const kpiTotalRentalsData = [];
      let totalAllRentalsApartments = 0; // Total de locações agregadas
      let totalAllBookings = 0; // Total de reservas agregadas
      const categoryTotalsMap = {};

      // Inicializa o mapa de totais por categoria
      for (const suiteCategory of suiteCategories) {
        categoryTotalsMap[suiteCategory.id] = {
          totalRentalsApartments: 0,
          totalBookings: 0,
        };
      }

      // Contabiliza as locações e reservas por categoria
      for (const rentalApartment of allRentalApartments) {
        const suiteCategoryId = rentalApartment.suiteStates?.suite?.suiteCategoryId;

        if (!suiteCategoryId || !categoryTotalsMap[suiteCategoryId]) {
          continue;
        }

        // Acumula total de locações por categoria
        categoryTotalsMap[suiteCategoryId].totalRentalsApartments++;
        totalAllRentalsApartments++;

        // Acumula total de reservas agregadas
        const bookingsForApartment = allBookings.filter(
          (booking) => booking.rentalApartmentId === rentalApartment.suiteStateId,
        );
        categoryTotalsMap[suiteCategoryId].totalBookings += bookingsForApartment.length;
        totalAllBookings += bookingsForApartment.length;
      }

      // Monta a estrutura de dados para cada categoria
      for (const suiteCategory of suiteCategories) {
        const categoryData = categoryTotalsMap[suiteCategory.id];

        const categoryResult = {
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          totalRentalsApartments: categoryData.totalRentalsApartments,
          totalBookings: categoryData.totalBookings,
          createdDate: adjustedEndDate,
        };

        kpiTotalRentalsData.push(categoryResult);

        // Inserir no banco de dados
        await this.insertKpiTotalRentals({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          totalRentalsApartments: categoryData.totalRentalsApartments,
          totalBookings: categoryData.totalBookings,
          totalAllBookings,
          totalAllRentalsApartments,
          companyId,
          period: period || null,
          createdDate: adjustedEndDate,
        });
      }

      // Monta o resultado total agregado
      const totalResult = {
        totalRentalsApartments: totalAllRentalsApartments, // Total geral de locações
        totalBookings: totalAllBookings, // Total geral de reservas
        createdDate: adjustedEndDate,
      };

      // Adiciona o resultado total no array de dados
      kpiTotalRentalsData.push({
        'Total Result': {
          ...totalResult,
        },
      });

      return kpiTotalRentalsData;
    } catch (error) {
      throw new BadRequestException(`Failed to fetch KpiTotalRentals: ${error.message}`);
    }
  }

  async insertKpiTotalRentals(data: KpiTotalRentals): Promise<KpiTotalRentals> {
    return this.prisma.prismaOnline.kpiTotalRentals.upsert({
      where: {
        suiteCategoryId_period_createdDate: {
          suiteCategoryId: data.suiteCategoryId,
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

  private async calculateTotalRentalsByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados

      let currentDate = new Date(startDate);
      currentDate.setUTCHours(6, 0, 0, 0); // Início do dia contábil às 06:00:00

      while (currentDate < endDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          // Para LAST_7_D e LAST_30_D, iteração diária
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(5, 59, 59, 999); // Fim do dia contábil às 05:59:59 do próximo dia
        } else if (period === PeriodEnum.LAST_6_M) {
          // Para LAST_6_M, iteração mensal
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(5, 59, 59, 999); // Fim do mês contábil
        }

        // Consultar os apartamentos alugados no período
        const rentals = await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: currentDate,
              lte: nextDate,
            },
            endOccupationType: 'FINALIZADA',
          },
        });

        // Contar o total de apartamentos alugados
        const totalRentalsForCurrentPeriod = rentals.length;

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0]; // Formatar a data para YYYY-MM-DD
        results[dateKey] = {
          totalRentalsApartments: totalRentalsForCurrentPeriod,
        };

        let createdDateWithTime;
        if (period === 'LAST_6_M') {
          // Cria uma nova instância de Date, subtraindo 1 dia de currentDate
          createdDateWithTime = new Date(currentDate); // Cria uma nova instância de Date
          createdDateWithTime.setDate(createdDateWithTime.getDate() - 1); // Remove 1 dia
          createdDateWithTime.setUTCHours(5, 59, 59, 999); // Define a hora
        } else {
          createdDateWithTime = new Date(currentDate); // Cria uma nova instância de Date
          createdDateWithTime.setUTCHours(5, 59, 59, 999);
        }

        // Inserir os dados no banco de dados
        await this.insertKpiTotalRentalsByPeriod({
          totalAllRentalsApartments: totalRentalsForCurrentPeriod,
          period: period,
          createdDate: createdDateWithTime,
          companyId: 1,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalRentalsForThePeriod = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        TotalRentalsForThePeriod: totalRentalsForThePeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular o total de apartamentos alugados por período:', error);
      throw new BadRequestException(
        `Failed to calculate total rentals by period: ${error.message}`,
      );
    }
  }

  async insertKpiTotalRentalsByPeriod(
    data: KpiTotalRentalsByPeriod,
  ): Promise<KpiTotalRentalsByPeriod> {
    return this.prisma.prismaOnline.kpiTotalRentalsByPeriod.upsert({
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
    const endDateLast7Days = currentDate;
    endDateLast7Days.setHours(5, 59, 59, 999);

    const startDateLast7Days = new Date(currentDate);
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 7);
    startDateLast7Days.setHours(6, 0, 0, 0);

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
    previousStartDateLast7Days.setHours(6, 0, 0, 0); // Configuração de horas

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
    console.log(`Início CronJob KpiTotalRentals - últimos 7 dias: ${startTimeLast7Days}`);

    // Chamar a função para o período atual
    await this.findAllKpiTotalRentals(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllKpiTotalRentals(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateTotalRentalsByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    const endTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiTotalRentals - últimos 7 dias: ${endTimeLast7Days}`);

    // Últimos 30 dias
    const endDateLast30Days = currentDate;
    endDateLast30Days.setHours(5, 59, 59, 999);

    const startDateLast30Days = new Date(currentDate);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30);
    startDateLast30Days.setHours(6, 0, 0, 0);

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
    previousStartDateLast30Days.setHours(6, 0, 0, 0); // Configuração de horas

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
    console.log(`Início CronJob KpiTotalRentals - últimos 30 dias: ${startTimeLast30Days}`);

    // Chamar a função para o período atual
    await this.findAllKpiTotalRentals(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllKpiTotalRentals(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalRentalsByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    const endTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiTotalRentals - últimos 30 dias: ${endTimeLast30Days}`);

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = currentDate;
    endDateLast6Months.setHours(5, 59, 59, 999);

    const startDateLast6Months = new Date(currentDate);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6);
    startDateLast6Months.setHours(6, 0, 0, 0);

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
    previousStartDateLast6Months.setHours(6, 0, 0, 0); // Configuração de horas

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
    console.log(`Início CronJob KpiTotalRentals - últimos 6 meses: ${startTimeLast6Months}`);

    // Chamar a função para o período atual
    await this.findAllKpiTotalRentals(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllKpiTotalRentals(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalRentalsByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    const endTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiTotalRentals - últimos 6 meses: ${endTimeLast6Months}`);

    // ESTE_MES - Do dia 1º do mês atual (às 06:00) até ontem (às 05:59)
    const endDateEsteMes = new Date(currentDate);
    // Não adiciona +1, usa o currentDate que já é a data atual
    endDateEsteMes.setHours(5, 59, 59, 999);

    const startDateEsteMes = moment().tz(timezone).startOf('month').toDate();
    startDateEsteMes.setHours(6, 0, 0, 0);

    const { startDate: parsedStartDateEsteMes, endDate: parsedEndDateEsteMes } =
      this.parseDateString(
        this.formatDateString(startDateEsteMes),
        this.formatDateString(endDateEsteMes),
      );

    const startTimeEsteMes = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob KpiTotalRentals - este mês: ${startTimeEsteMes}`);

    await this.findAllKpiTotalRentals(parsedStartDateEsteMes, parsedEndDateEsteMes, PeriodEnum.ESTE_MES);

    const endTimeEsteMes = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiTotalRentals - este mês: ${endTimeEsteMes}`);
  }

  private parseDateString(
    startDateString: string,
    endDateString: string,
  ): { startDate: Date; endDate: Date } {
    const [startDay, startMonth, startYear] = startDateString.split('/');
    const [endDay, endMonth, endYear] = endDateString.split('/');

    const parsedStartDate = new Date(Date.UTC(+startYear, +startMonth - 1, +startDay));
    const parsedEndDate = new Date(Date.UTC(+endYear, +endMonth - 1, +endDay));

    parsedStartDate.setUTCHours(6, 0, 0, 0); // Define início às 06:00
    parsedEndDate.setUTCHours(5, 59, 59, 999); // Define final às 05:59:59.999

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }

  private formatDateString(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Mês é baseado em 0
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
  }
}

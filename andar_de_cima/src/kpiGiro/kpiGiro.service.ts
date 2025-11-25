import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PeriodEnum, Prisma } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import { KpiGiro, KpiGiroByWeek } from './entities/kpiGiro.entity';
import * as moment from 'moment-timezone';

@Injectable()
export class KpiGiroService {
  constructor(private prisma: PrismaService) {}

  async findAllKpiGiro(startDate: Date, endDate: Date, period?: PeriodEnum): Promise<any[]> {
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

      const [allRentalApartments, suiteCategories] = await Promise.all([
        this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: startDate,
              lte: adjustedEndDate,
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
          include: {
            suites: true,
          },
        }),
      ]);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      const kpiGiroData = [];
      let totalSuites = 0; // Total de suítes de todas as categorias
      let allRentals = 0; // Total de locações de todas as categorias

      const categoryTotalsMap = {};

      // Calcula giro por categoria
      for (const suiteCategory of suiteCategories) {
        categoryTotalsMap[suiteCategory.id] = {
          giroTotal: 0,
          rentalsCount: 0,
        };

        // Contar o total de suítes na categoria
        const suitesInCategoryCount = suiteCategory.suites.length;
        totalSuites += suitesInCategoryCount;

        for (const rentalApartment of allRentalApartments) {
          if (rentalApartment.suiteStates.suite.suiteCategoryId === suiteCategory.id) {
            const categoryData = categoryTotalsMap[suiteCategory.id];

            // Incrementa o número de locações para a categoria
            categoryData.rentalsCount++;
            allRentals++; // Acumula o total de locações
          }
        }

        // Cálculo do giro para a categoria
        if (categoryTotalsMap[suiteCategory.id].rentalsCount > 0 && suitesInCategoryCount > 0) {
          const days = (adjustedEndDate.getTime() - startDate.getTime()) / (1000 * 86400); // Número de dias
          const giro =
            categoryTotalsMap[suiteCategory.id].rentalsCount / suitesInCategoryCount / days;

          categoryTotalsMap[suiteCategory.id].giroTotal += giro;
        }
      }

      // Inserindo dados no banco de dados
      for (const suiteCategory of suiteCategories) {
        const categoryData = categoryTotalsMap[suiteCategory.id];
        if (!categoryData || categoryData.rentalsCount === 0) continue;

        // Ajustar o createdDate para o mesmo dia do mês
        let createdDate = new Date(adjustedEndDate);
        if (period === PeriodEnum.LAST_6_M) {
          createdDate.setDate(adjustedEndDate.getDate()); // Manter o mesmo dia do mês
        }

        // Inserir no banco de dados
        await this.insertKpiGiro({
          suiteCategoryId: suiteCategory.id,
          giro: new Prisma.Decimal(categoryData.giroTotal),
          totalGiro: new Prisma.Decimal(
            allRentals /
              (totalSuites || 1) /
              ((adjustedEndDate.getTime() - startDate.getTime()) / (1000 * 86400)),
          ), // Cálculo do totalGiro médio
          createdDate: createdDate, // Usar a data ajustada
          period: period || null,
          companyId: companyId,
          suiteCategoryName: suiteCategory.description,
        });

        kpiGiroData.push({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          giro: parseFloat(categoryData.giroTotal.toFixed(2)),
          createdDate: createdDate.setUTCHours(5, 59, 59, 999), // Usar a data ajustada
        });
      }

      // Cálculo do totalGiro global
      const totalResult = {
        totalGiro: parseFloat(
          (
            allRentals /
            (totalSuites || 1) /
            ((adjustedEndDate.getTime() - startDate.getTime()) / (1000 * 86400))
          ).toFixed(2),
        ), // Formatar totalGiro com 2 casas decimais
        createdDate: adjustedEndDate.setUTCHours(5, 59, 59, 999), // Atualizar conforme necessário
      };

      return [
        {
          kpiGiro: kpiGiroData,
          totalResult,
        },
      ];
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async insertKpiGiro(data: KpiGiro): Promise<KpiGiro> {
    return this.prisma.prismaOnline.kpiGiro.upsert({
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

  private async calculateKpiGiroByWeek(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const kpiGiroByCategoryAndDay: { [key: string]: any } = {};
      const timezone = 'America/Sao_Paulo';

      const dayCountMap: { [key: string]: number } = {};
      let currentDate = moment.tz(startDate, timezone);
      const endDateAdjusted = moment.tz(endDate, timezone);

      // Configuração do cálculo dos dias da semana por período
      if (period === PeriodEnum.LAST_6_M) {
        const sixMonthsAgo = moment(currentDate).subtract(5, 'months').startOf('month');

        while (sixMonthsAgo.isBefore(endDateAdjusted)) {
          const dayOfWeek = sixMonthsAgo.format('dddd');
          dayCountMap[dayOfWeek] = (dayCountMap[dayOfWeek] || 0) + 1;
          sixMonthsAgo.add(1, 'day');
        }
      } else {
        const totalDays = period === PeriodEnum.LAST_7_D ? 7 : 30;

        for (let i = 0; i < totalDays; i++) {
          const dayOfWeek = currentDate.format('dddd');
          dayCountMap[dayOfWeek] = (dayCountMap[dayOfWeek] || 0) + 1;
          currentDate.add(1, 'day');
        }
      }

      // Obter dados necessários usando $transaction
      const [suiteCategories, occupiedSuites] = await this.prisma.prismaLocal.$transaction([
        this.prisma.prismaLocal.suiteCategory.findMany({
          where: {
            id: {
              in: [2, 3, 4, 5, 6, 7, 12],
            },
          },
          include: {
            suites: true,
          },
        }),
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
      ]);

      if (!Array.isArray(suiteCategories) || suiteCategories.length === 0) {
        throw new Error('Nenhuma categoria de suíte encontrada');
      }

      // Inicializar o objeto para cada categoria e dia da semana
      for (const suiteCategory of suiteCategories) {
        if (!suiteCategory || !suiteCategory.description) {
          continue;
        }

        const categoryDescription = suiteCategory.description;
        kpiGiroByCategoryAndDay[categoryDescription] = {};

        for (const dayOfWeek in dayCountMap) {
          kpiGiroByCategoryAndDay[categoryDescription][dayOfWeek] = {
            giroTotal: 0,
            rentalsCount: 0,
            createdDate: null,
          };
        }
      }

      // Cálculo do número de locações por categoria e dia
      let totalSuites = 0; // Total de suítes de todas as categorias
      let allRentals = 0; // Total de locações de todas as categorias

      for (const occupiedSuite of occupiedSuites) {
        const suiteCategoryDescription =
          occupiedSuite.suiteStates?.suite?.suiteCategories?.description;
        const dayOfOccupation = moment.tz(occupiedSuite.checkIn, timezone);
        const dayOfWeek = dayOfOccupation.format('dddd');

        if (!kpiGiroByCategoryAndDay[suiteCategoryDescription]) {
          continue;
        }

        // Incrementa o número de locações para a categoria e dia da semana
        kpiGiroByCategoryAndDay[suiteCategoryDescription][dayOfWeek].rentalsCount++;
        allRentals++;
      }

      // Cálculo do giro por categoria e dia
      const totalRentalsByDay: { [key: string]: number } = {}; // Para acumular locações por dia da semana

      for (const suiteCategory of suiteCategories) {
        const suitesInCategoryCount = suiteCategory.suites.length;
        totalSuites += suitesInCategoryCount;

        for (const dayOfWeek in kpiGiroByCategoryAndDay[suiteCategory.description]) {
          const categoryData = kpiGiroByCategoryAndDay[suiteCategory.description][dayOfWeek];

          // Acumular locações por dia da semana
          if (!totalRentalsByDay[dayOfWeek]) {
            totalRentalsByDay[dayOfWeek] = 0;
          }
          totalRentalsByDay[dayOfWeek] += categoryData.rentalsCount;

          // Cálculo do giro para a categoria e dia
          if (categoryData.rentalsCount > 0 && suitesInCategoryCount > 0) {
            const days = dayCountMap[dayOfWeek];
            const giro = categoryData.rentalsCount / suitesInCategoryCount / days;

            categoryData.giroTotal = giro;
          } else {
            // Se não houver locações para o dia da semana, definir como 0
            categoryData.giroTotal = new Prisma.Decimal(0);
            categoryData.rentalsCount = 0; // Manter contagem de locações como 0
          }

          // Calcular a data correspondente ao dia da semana
          const createdDate = moment
            .tz(startDate, timezone)
            .add(Object.keys(dayCountMap).indexOf(dayOfWeek), 'days')
            .set({ hour: 6, minute: 0, second: 0, millisecond: 0 });
          categoryData.createdDate = createdDate.toDate();
        }
      }

      // Agora, após calcular o giro, vamos calcular o totalGiro
      for (const suiteCategory of suiteCategories) {
        for (const dayOfWeek in kpiGiroByCategoryAndDay[suiteCategory.description]) {
          const categoryData = kpiGiroByCategoryAndDay[suiteCategory.description][dayOfWeek];

          if (!categoryData) continue;

          // Calcular o totalGiro com base no total acumulado de locações por dia
          const totalGiro = totalRentalsByDay[dayOfWeek] / (totalSuites || 1);

          // Dividir o totalGiro pela quantidade de dias da semana
          const daysCount = dayCountMap[dayOfWeek]; // Quantidade de dias da semana
          const adjustedTotalGiro = daysCount > 0 ? totalGiro / daysCount : 0;

          categoryData.totalGiro = new Prisma.Decimal(adjustedTotalGiro);
        }
      }

      // Inserindo dados no banco de dados
      for (const suiteCategory of suiteCategories) {
        for (const dayOfWeek in kpiGiroByCategoryAndDay[suiteCategory.description]) {
          const categoryData = kpiGiroByCategoryAndDay[suiteCategory.description][dayOfWeek];

          // Sempre insira, mesmo que não haja locações
          await this.insertKpiGiroByWeek({
            suiteCategoryId: suiteCategory.id,
            giro: new Prisma.Decimal(categoryData.giroTotal || 0),
            totalGiro: new Prisma.Decimal(categoryData.totalGiro || 0),
            createdDate: categoryData.createdDate,
            period: period || null,
            companyId: 1,
            suiteCategoryName: suiteCategory.description,
          });
        }
      }

      return kpiGiroByCategoryAndDay;
    } catch (error) {
      console.error('Erro ao calcular o total de KpiGiro por período:', error);
      throw new BadRequestException(
        `Falha ao calcular total de KpiGiro por período: ${error.message}`,
      );
    }
  }

  async insertKpiGiroByWeek(data: KpiGiroByWeek): Promise<KpiGiroByWeek> {
    return this.prisma.prismaOnline.kpiGiroByWeek.upsert({
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

  @Cron('0 0 * * *', { disabled: true })
  async handleCron() {
    const timezone = 'America/Sao_Paulo'; // Defina seu fuso horário

    // Obter a data atual no fuso horário correto
    const currentDate = moment().tz(timezone).toDate();

    // Últimos 7 dias
    const endDateLast7Days = currentDate; // data atual
    const startDateLast7Days = new Date(currentDate); // copiar data atual
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 7); // subtrair 7 dias

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

    const startTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob KpiGiro - últimos 7 dias: ${startTimeLast7Days}`);
    await this.findAllKpiGiro(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.findAllKpiGiro(
      previousStartDateLast7Days,
      previousParsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateKpiGiroByWeek(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    const endTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiGiro - últimos 7 dias: ${endTimeLast7Days}`);

    // Últimos 30 dias
    const endDateLast30Days = currentDate; // data atual
    const startDateLast30Days = new Date(currentDate); // copiar data atual
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30); // subtrair 30 dias

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

    const startTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob KpiGiro - últimos 30 dias: ${startTimeLast30Days}`);
    await this.findAllKpiGiro(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.findAllKpiGiro(
      previousStartDateLast30Days,
      previousParsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateKpiGiroByWeek(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    const endTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiGiro - últimos 30 dias: ${endTimeLast30Days}`);

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = currentDate; // data atual
    const startDateLast6Months = new Date(currentDate); // copiar data atual
    startDateLast6Months.setDate(startDateLast6Months.getDate() - 180); // subtrair 180 dias

    const { startDate: parsedStartDateLast6Months, endDate: parsedEndDateLast6Months } =
      this.parseDateString(
        this.formatDateString(startDateLast6Months),
        this.formatDateString(endDateLast6Months),
      );

    // Calcular as datas para o período anterior
    const previousParsedEndDateLast6Months = parsedStartDateLast6Months;

    // Usar moment.js para manipular a data
    const previousStartDateLast6Months = moment(previousParsedEndDateLast6Months)
      .subtract(6, 'months') // Subtrai 6 meses
      .toDate(); // Converte de volta para Date

    // Ajustar o dia do mês se necessário
    const dayOfMonth = previousParsedEndDateLast6Months.getDate();
    previousStartDateLast6Months.setDate(dayOfMonth);
    previousStartDateLast6Months.setHours(6, 0, 0, 0); // Configuração de horas

    // Parse as datas para o formato desejado
    const {
      startDate: previousParsedStartDateLast6Months,
      endDate: previousParsedEndDateLast6MonthsParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast6Months),
      this.formatDateString(previousParsedEndDateLast6Months),
    );

    const startTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob KpiGiro - últimos 6 meses: ${startTimeLast6Months}`);
    await this.findAllKpiGiro(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.findAllKpiGiro(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateKpiGiroByWeek(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    const endTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiGiro - últimos 6 meses: ${endTimeLast6Months}`);

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
    console.log(`Início CronJob KpiGiro - este mês: ${startTimeEsteMes}`);

    await this.findAllKpiGiro(parsedStartDateEsteMes, parsedEndDateEsteMes, PeriodEnum.ESTE_MES);

    const endTimeEsteMes = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiGiro - este mês: ${endTimeEsteMes}`);
  }

  private formatDateString(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Mês é baseado em 0
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
  }

  private parseDateString(
    startDateString: string,
    endDateString: string,
  ): { startDate: Date; endDate: Date } {
    const [startDay, startMonth, startYear] = startDateString.split('/');
    const [endDay, endMonth, endYear] = endDateString.split('/');

    const parsedStartDate = new Date(Date.UTC(+startYear, +startMonth - 1, +startDay));
    const parsedEndDate = new Date(Date.UTC(+endYear, +endMonth - 1, +endDay));

    parsedStartDate.setUTCHours(6, 0, 0, 0);
    parsedEndDate.setUTCHours(5, 59, 59, 999);

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }
}

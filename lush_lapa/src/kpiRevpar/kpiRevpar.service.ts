import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PeriodEnum, Prisma } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import { KpiRevpar, KpiRevparByPeriod } from './entities/kpiRevpar.entity';

@Injectable()
export class KpiRevparService {
  constructor(private prisma: PrismaService) {}

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  // Método principal do service
  async findAllKpiRevpar(startDate: Date, endDate: Date, period?: PeriodEnum) {
    try {
      const companyId = 1;

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D|| period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        // Para LAST_6_M, subtrair um dia para não incluir a data atual
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      }

      // Obter os dados de rentalApartment, suiteCategory e Company
      const [rentalApartments, suiteCategories] = await Promise.all([
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
            description: {
              in: [
                'LUSH',
                'LUSH HIDRO',
                'LUSH LOUNGE HIDRO',
                'LUSH SPA',
                'LUSH SPLASH',
                'LUSH SPA SPLASH',
              ],
            },
          },
          include: {
            suites: true,
          },
        }),
      ]);

      // Inicializar um mapa para armazenar os totais por categoria
      const categoryTotalsMap: Record<string, any> = {};

      let totalRevenue = new Prisma.Decimal(0);
      let totalSuites = 0;

      // Primeiro loop: calcula os valores por categoria sem inserir no banco
      for (const suiteCategory of suiteCategories) {
        categoryTotalsMap[suiteCategory.id] = {
          categoryTotalRentals: 0,
          categoryTotalRental: new Prisma.Decimal(0),
          giro: 0,
        };

        const rentalApartmentsInCategory = rentalApartments.filter(
          (rentalApartment: any) =>
            rentalApartment.suiteStates.suite.suiteCategoryId ===
            suiteCategory.id,
        );

        const rentalsCount = rentalApartmentsInCategory.length;
        const suitesInCategoryCount = suiteCategory.suites.length;

        let giro = 0;
        if (suitesInCategoryCount > 0) {
          const daysTimeInSeconds =
            (endDate.getTime() - startDate.getTime()) / 1000;
          const days = daysTimeInSeconds / 86400;
          giro = rentalsCount / suitesInCategoryCount / days;
        }

        // Acumular os valores para cada categoria
        for (const rentalApartment of rentalApartmentsInCategory) {
          categoryTotalsMap[suiteCategory.id].categoryTotalRentals++;
          categoryTotalsMap[suiteCategory.id].categoryTotalRental =
            categoryTotalsMap[suiteCategory.id].categoryTotalRental.plus(
              rentalApartment.permanenceValueLiquid
                ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
                : new Prisma.Decimal(0),
            );
          totalRevenue = totalRevenue.plus(
            rentalApartment.permanenceValueLiquid
              ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
              : new Prisma.Decimal(0),
          );
        }

        categoryTotalsMap[suiteCategory.id].giro = giro;
        totalSuites += suitesInCategoryCount;
      }

      // Agora que os valores estão acumulados, inserimos todos os dados de uma vez
      const kpiRevparResults = [];
      for (const suiteCategory of suiteCategories) {
        const categoryData = categoryTotalsMap[suiteCategory.id];
        const ticketAverageRental =
          categoryData.categoryTotalRentals > 0
            ? categoryData.categoryTotalRental
                .dividedBy(categoryData.categoryTotalRentals)
                .toNumber()
            : 0;

        const revpar = categoryData.giro * ticketAverageRental;

        const daysTimeInSeconds =
          (endDate.getTime() - startDate.getTime()) / 1000;
        const days = daysTimeInSeconds / 86400;
        const totalRevparGlobal = totalRevenue
          .dividedBy(totalSuites)
          .dividedBy(new Prisma.Decimal(days));

        // Inserir o KPI RevPAR por categoria após calcular todos os valores
        await this.insertKpiRevpar({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          revpar: new Prisma.Decimal(revpar),
          totalRevpar: new Prisma.Decimal(totalRevparGlobal),
          companyId,
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)),
          period,
        });

        kpiRevparResults.push({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          revpar: this.formatCurrency(revpar),
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)),
        });
      }

      const daysTimeInSeconds =
        (endDate.getTime() - startDate.getTime()) / 1000;
      const days = daysTimeInSeconds / 86400;
      const totalRevparGlobal = totalRevenue
        .dividedBy(totalSuites)
        .dividedBy(new Prisma.Decimal(days));

      return {
        kpiRevpar: kpiRevparResults,
        totalResult: {
          totalRevpar: this.formatCurrency(totalRevparGlobal.toNumber()),
          createdDate: adjustedEndDate,
        },
      };
    } catch (error) {
      console.error('Erro ao calcular o KPI Revpar:', error);
      throw new BadRequestException(
        `Falha ao calcular KPI Revpar: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async insertKpiRevpar(data: KpiRevpar): Promise<KpiRevpar> {
    return this.prisma.prismaOnline.kpiRevpar.upsert({
      where: {
        suiteCategoryId_period_createdDate: {
          suiteCategoryId: data.suiteCategoryId,
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

  private async calculateTotalRevparByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados

      let currentDate = new Date(startDate);
      currentDate.setHours(6, 0, 0, 0); // Início do dia contábil às 06:00:00

      while (currentDate < endDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D|| period === PeriodEnum.LAST_30_D) {
          // Para LAST_7_D e LAST_30_D, iteração diária
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(5, 59, 59, 999); // Fim do dia contábil às 05:59:59 do próximo dia
        } else if (period === PeriodEnum.LAST_6_M) {
          // Para LAST_6_M, iteração mensal
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(5, 59, 59, 999); // Fim do mês contábil
        }

        // Obter os dados de rentalApartment e suiteCategory
        const [rentalApartments, suiteCategories] = await Promise.all([
          this.prisma.prismaLocal.rentalApartment.findMany({
            where: {
              checkIn: {
                gte: currentDate,
                lte: nextDate,
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
              description: {
                in: [
                  'LUSH',
                  'LUSH HIDRO',
                  'LUSH LOUNGE HIDRO',
                  'LUSH SPA',
                  'LUSH SPLASH',
                  'LUSH SPA SPLASH',
                ],
              },
            },
            include: {
              suites: true,
            },
          }),
        ]);

        // Inicializar variáveis para calcular o RevPAR
        let totalRevenue = new Prisma.Decimal(0);
        let totalRentalsCount = rentalApartments.length;
        let totalSuites = 0;

        // Calcular a receita total e o número de suítes
        for (const suiteCategory of suiteCategories) {
          const suitesInCategoryCount = suiteCategory.suites.length;
          totalSuites += suitesInCategoryCount;

          const rentalApartmentsInCategory = rentalApartments.filter(
            (rentalApartment: any) =>
              rentalApartment.suiteStates.suite.suiteCategoryId ===
              suiteCategory.id,
          );

          for (const rentalApartment of rentalApartmentsInCategory) {
            totalRevenue = totalRevenue.plus(
              rentalApartment.permanenceValueLiquid
                ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
                : new Prisma.Decimal(0),
            );
          }
        }

        // Calcular o giro
        const daysTimeInSeconds =
          (nextDate.getTime() - currentDate.getTime()) / 1000;
        const days = daysTimeInSeconds / 86400;
        const giro = totalRentalsCount / totalSuites / days;

        // Calcular o ticket médio
        const ticketAverageRental =
          totalRentalsCount > 0
            ? totalRevenue.dividedBy(totalRentalsCount).toNumber()
            : 0;

        // Calcular o RevPAR
        const totalRevpar = giro * ticketAverageRental;

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0]; // Formatar a data para YYYY-MM-DD
        results[dateKey] = {
          totalRevpar: this.formatCurrency(totalRevpar), // Formatar o valor em R$
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

        // Inserir os dados no banco de dados apenas se houver dados válidos
        if (totalRentalsCount > 0 || totalSuites > 0) {
          await this.insertKpiRevparByPeriod({
            totalRevpar: new Prisma.Decimal(totalRevpar),
            createdDate: createdDateWithTime,
            period,
            companyId: 1,
          });
        }

        // Atualizar a data atual para o próximo período
        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalRevparForThePeriod = Object.keys(results).map((date: any) => ({
        [date]: results[date],
      }));

      return {
        TotalRevparForThePeriod: totalRevparForThePeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular o total de RevPAR por período:', error);
      throw new BadRequestException(
        `Failed to calculate total RevPAR by period: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async insertKpiRevparByPeriod(
    data: KpiRevparByPeriod,
  ): Promise<KpiRevparByPeriod> {
    return this.prisma.prismaOnline.kpiRevparByPeriod.upsert({
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
    previousStartDateLast7Days.setHours(6, 0, 0, 0); // Configuração de horas

    // Log para verificar as datas
    const startTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiRevpar - últimos 7 dias: ${startTimeLast7Days}`,
    );
    await this.findAllKpiRevpar(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.findAllKpiRevpar(
      previousStartDateLast7Days,
      previousParsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateTotalRevparByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiRevpar - últimos 7 dias: ${endTimeLast7Days}`,
    );

    // Últimos 30 dias
    const endDateLast30Days = currentDate;
    endDateLast30Days.setHours(5, 59, 59, 999);

    const startDateLast30Days = new Date(currentDate);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30);
    startDateLast30Days.setHours(6, 0, 0, 0);

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
    previousStartDateLast30Days.setHours(6, 0, 0, 0); // Configuração de horas

    // Log para verificar as datas
    const startTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiRevpar - últimos 30 dias: ${startTimeLast30Days}`,
    );
    await this.findAllKpiRevpar(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.findAllKpiRevpar(
      previousStartDateLast30Days,
      previousParsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalRevparByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiRevpar - últimos 30 dias: ${endTimeLast30Days}`,
    );

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = currentDate;
    endDateLast6Months.setHours(5, 59, 59, 999);

    const startDateLast6Months = new Date(currentDate);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6);
    startDateLast6Months.setHours(6, 0, 0, 0);

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
    previousStartDateLast6Months.setHours(6, 0, 0, 0); // Configuração de horas

    // Log para verificar as datas
    const startTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiRevpar - últimos 6 meses: ${startTimeLast6Months}`,
    );
    await this.findAllKpiRevpar(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.findAllKpiRevpar(
      previousStartDateLast6Months,
      previousParsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalRevparByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiRevpar - últimos 6 meses: ${endTimeLast6Months}`,
    );
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

    const parsedStartDate = new Date(
      Date.UTC(+startYear, +startMonth - 1, +startDay),
    );
    const parsedEndDate = new Date(Date.UTC(+endYear, +endMonth - 1, +endDay));

    parsedStartDate.setUTCHours(6, 0, 0, 0);
    parsedEndDate.setUTCHours(5, 59, 59, 999);

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }
}

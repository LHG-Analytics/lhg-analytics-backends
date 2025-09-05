import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PeriodEnum, Prisma } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import {
  KpiOccupancyRate,
  KpiOccupancyRateByPeriod,
  KpiOccupancyRateBySuiteCategory,
  KpiOccupancyRateByWeek,
} from './entities/kpiOccupancyRate.entity';

@Injectable()
export class KpiOccupancyRateService {
  constructor(private prisma: PrismaService) {}

  // Função para buscar todos os dados necessários de uma vez
  private async fetchKpiData(startDate: Date, endDate: Date) {
    return await this.prisma.prismaLocal.$transaction([
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
      this.prisma.prismaLocal.apartmentCleaning.findMany({
        where: {
          startDate: {
            gte: startDate,
            lte: endDate,
          },
          endDate: {
            not: null, // Excluir registros onde endDate é null
          },
        },
        include: {
          suiteState: {
            include: {
              suite: true,
            },
          },
        },
      }),
      this.prisma.prismaLocal.blockedMaintenanceDefect.findMany({
        where: {
          defect: {
            startDate: {
              gte: startDate,
              lte: endDate,
            },
            endDate: {
              not: null, // Excluir registros onde endDate é null
            },
          },
        },
        include: {
          defect: {
            include: {
              suite: true,
            },
          },
          suiteState: {
            include: {
              suite: true,
            },
          },
        },
      }),
    ]);
  }

  async findAllKpiOccupancyRate(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any[]> {
    try {
      const companyId = 1; // Defina o ID da empresa conforme necessário

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D|| period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        // Para LAST_6_M, subtrair um dia para não incluir a data atual
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      }

      const [
        suiteCategories,
        occupiedSuites,
        cleanings,
        blockedMaintenanceDefects,
      ] = await this.fetchKpiData(startDate, adjustedEndDate);

      if (!occupiedSuites || occupiedSuites.length === 0) {
        throw new NotFoundException('No occupied suites found.');
      }

      const kpiOccupancyRateData = [];
      let totalOccupiedTimeAllCategories = 0;
      let totalAvailableTimeAllCategories = 0;

      const categoryTotalsMap: Record<string, any> = {}; // Mapa para acumular os dados por categoria

      // Inicializa o mapa de totais por categoria
      for (const suiteCategory of suiteCategories) {
        categoryTotalsMap[suiteCategory.id] = {
          totalOccupiedTime: 0,
          unavailableTime: 0,
          availableTime: 0,
        };
      }

      // Iteração sobre as categorias para cálculo dos KPI de ocupação
      for (const suiteCategory of suiteCategories) {
        const occupiedSuitesInCategory = occupiedSuites.filter(
          (occupiedSuite: any) =>
            occupiedSuite.suiteStates.suite.suiteCategoryId ===
            suiteCategory.id,
        );

        let totalOccupiedTime = 0;
        let maxUnavailableTime = 0;
        let unavailableTimeCleaning = 0;

        // Calculando o total de tempo ocupado para a categoria
        for (const occupiedSuite of occupiedSuitesInCategory) {
          const occupiedTimeInSeconds =
            (new Date(occupiedSuite.checkOut).getTime() -
              new Date(occupiedSuite.checkIn).getTime()) /
            1000;
          totalOccupiedTime += occupiedTimeInSeconds;
        }

        const suitesInCategory = suiteCategory.suites;

        for (const suite of suitesInCategory) {
          let defectTimeInSeconds = 0;
          let maintenanceTimeInSeconds = 0;

          // Filtrar os defeitos e manutenções da suíte
          const suiteDefectsAndMaintenances = blockedMaintenanceDefects
            .filter(
              (blockedMaintenanceDefect: any) =>
                blockedMaintenanceDefect.defect.suite.id === suite.id &&
                blockedMaintenanceDefect.suiteState.suite.id === suite.id,
            )
            .reduce((acc: any, blockedMaintenanceDefect: any) => {
              const key = `${blockedMaintenanceDefect.defect.startDate.toISOString()}-${suite.id}`;

              if (acc.has(key)) {
                const existingDefect = acc.get(key);
                const maxEndDate = new Date(
                  Math.max(
                    new Date(existingDefect.defect.endDate).getTime(),
                    new Date(blockedMaintenanceDefect.defect.endDate).getTime(),
                  ),
                );
                acc.set(key, {
                  ...blockedMaintenanceDefect,
                  defect: {
                    ...blockedMaintenanceDefect.defect,
                    endDate: maxEndDate,
                  },
                });
              } else {
                acc.set(key, blockedMaintenanceDefect);
              }
              return acc;
            }, new Map())
            .values();

          for (const blockedMaintenanceDefect of suiteDefectsAndMaintenances) {
            const startDefect = new Date(
              blockedMaintenanceDefect.defect.startDate,
            );
            const endDefect = new Date(blockedMaintenanceDefect.defect.endDate);
            const startMaintenance = new Date(
              blockedMaintenanceDefect.suiteState.startDate,
            );
            const endMaintenance = new Date(
              blockedMaintenanceDefect.suiteState.endDate,
            );

            defectTimeInSeconds =
              (endDefect.getTime() - startDefect.getTime()) / 1000;
            maintenanceTimeInSeconds =
              (endMaintenance.getTime() - startMaintenance.getTime()) / 1000;

            maxUnavailableTime += Math.max(
              defectTimeInSeconds,
              maintenanceTimeInSeconds,
            );
          }

          const suiteCleanings = cleanings.filter(
            (cleaning: any) => cleaning.suiteState.suiteId === suite.id,
          );

          for (const cleaning of suiteCleanings) {
            const cleaningTimeInSeconds =
              (new Date(cleaning.endDate).getTime() -
                new Date(cleaning.startDate).getTime()) /
              1000;
            unavailableTimeCleaning += cleaningTimeInSeconds;
          }
        }

        const unavailableTime = maxUnavailableTime + unavailableTimeCleaning;
        const daysTimeInSeconds =
          (adjustedEndDate.getTime() - startDate.getTime()) / 1000;
        const suitesInCategoryCount = suitesInCategory.length;
        const availableTimeInSeconds =
          daysTimeInSeconds * suitesInCategoryCount - unavailableTime;

        totalOccupiedTimeAllCategories += totalOccupiedTime;
        totalAvailableTimeAllCategories += availableTimeInSeconds;

        // Acumulando os dados da categoria
        categoryTotalsMap[suiteCategory.id].totalOccupiedTime =
          totalOccupiedTime;
        categoryTotalsMap[suiteCategory.id].unavailableTime = unavailableTime;
        categoryTotalsMap[suiteCategory.id].availableTime =
          availableTimeInSeconds;

        // Cálculo do taxa de ocupação para a categoria
        if (availableTimeInSeconds > 0) {
          const occupancyRateDecimal =
            totalOccupiedTime / availableTimeInSeconds;

          kpiOccupancyRateData.push({
            suiteCategoryId: suiteCategory.id,
            suiteCategoryName: suiteCategory.description,
            occupancyRate: this.formatPercentage(occupancyRateDecimal), // Utilizando a função formatPercentage
            createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Usar a data ajustada
          });
        }
      }

      // Cálculo do totalOccupancyRate após o loop
      const totalOccupancyRateDecimal =
        totalOccupiedTimeAllCategories / (totalAvailableTimeAllCategories || 1);

      // Inserindo os dados no banco de dados
      for (const suiteCategory of suiteCategories) {
        const categoryData = categoryTotalsMap[suiteCategory.id];

        // Inserir no banco de dados
        await this.insertKpiOccupancyRate({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          occupancyRate: new Prisma.Decimal(
            Number(
              (
                (categoryData.totalOccupiedTime / categoryData.availableTime) *
                100
              ).toFixed(2),
            ),
          ), // Usar totalOccupiedTime e availableTime diretamente
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Usar a data ajustada
          period: period || null,
          companyId: companyId,
          totalOccupancyRate: new Prisma.Decimal(
            Number((totalOccupancyRateDecimal * 100).toFixed(2)),
          ), // Calcular totalOccupancyRate
        });
      }

      // Cálculo do resultado total
      const totalResult = {
        totalOccupancyRate: this.formatPercentage(totalOccupancyRateDecimal), // Utilizando a função formatPercentage
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Atualizar conforme necessário
      };

      return [
        {
          kpiOccupancyRate: kpiOccupancyRateData,
          totalResult,
        },
      ];
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch KpiOccupancyRate: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async insertKpiOccupancyRate(
    data: KpiOccupancyRate,
  ): Promise<KpiOccupancyRate> {
    return this.prisma.prismaOnline.kpiOccupancyRate.upsert({
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

  private async calculateTotalOccupancyRateByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados
      const weeklyResults: { [key: string]: { total: number; count: number } } =
        {}; // Para acumular resultados semanais

      let currentDate = new Date(startDate);
      currentDate.setUTCHours(6, 0, 0, 0); // Início do dia contábil às 06:00:00

      while (currentDate < endDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D|| period === PeriodEnum.LAST_30_D) {
          // Para LAST_7_D e LAST_30_D, iteração diária
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(5, 59, 59, 999); // Fim do dia contábil às 05:59:59 do próximo dia
          currentDate.setUTCHours(6, 0, 0, 0);
        } else if (period === PeriodEnum.LAST_6_M) {
          // Para LAST_6_M, iteração mensal
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(5, 59, 59, 999); // Fim do mês contábil
          currentDate.setUTCHours(6, 0, 0, 0);
        }

        const [
          suiteCategories,
          occupiedSuites,
          cleanings,
          blockedMaintenanceDefects,
        ] = await this.fetchKpiData(currentDate, nextDate);

        let totalOccupiedTime = 0;
        let totalUnavailableTime = 0; // Tempo indisponível por manutenção e limpeza

        // Calcular o tempo ocupado
        for (const occupiedSuite of occupiedSuites) {
          const occupiedTimeInSeconds =
            (new Date(occupiedSuite.checkOut).getTime() -
              new Date(occupiedSuite.checkIn).getTime()) /
            1000;
          totalOccupiedTime += occupiedTimeInSeconds;
        }

        // Calcular o tempo indisponível por manutenção e limpeza
        const categoryTotalsMap: Record<string, any> = {}; // Mapa para acumular os dados por categoria

        // Inicializa o mapa de totais por categoria
        for (const suiteCategory of suiteCategories) {
          categoryTotalsMap[suiteCategory.id] = {
            unavailableTime: 0,
          };
        }

        // Cálculo do tempo indisponível
        for (const suite of suiteCategories.flatMap((cat: any) => cat.suites)) {
          // Lógica para calcular o tempo de limpeza
          const suiteCleanings = cleanings.filter(
            (cleaning: any) => cleaning.suiteState.suiteId === suite.id,
          );

          for (const cleaning of suiteCleanings) {
            const cleaningStart = new Date(cleaning.startDate);
            const cleaningEnd = new Date(cleaning.endDate);

            // Verificar se a limpeza está dentro do período atual
            if (cleaningEnd > currentDate&& cleaningStart < nextDate) {
              const overlapStart = Math.max(
                cleaningStart.getTime(),
                currentDate.getTime(),
              );
              const overlapEnd = Math.min(
                cleaningEnd.getTime(),
                nextDate.getTime(),
              );

              const cleaningTimeInSeconds = (overlapEnd - overlapStart) / 1000;
              totalUnavailableTime += cleaningTimeInSeconds;
              categoryTotalsMap[suite.suiteCategoryId].unavailableTime +=
                cleaningTimeInSeconds;
            }
          }

          // Lógica para calcular o tempo de manutenção e defeitos
          const suiteDefectsAndMaintenances = blockedMaintenanceDefects
            .filter(
              (blockedMaintenanceDefect: any) =>
                blockedMaintenanceDefect.defect.suite.id === suite.id &&
                blockedMaintenanceDefect.suiteState.suite.id === suite.id,
            )
            .reduce((acc: any, blockedMaintenanceDefect: any) => {
              const key = `${blockedMaintenanceDefect.defect.startDate.toISOString()}-${suite.id}`;

              if (acc.has(key)) {
                const existingDefect = acc.get(key);
                const maxEndDate = new Date(
                  Math.max(
                    new Date(existingDefect.defect.endDate).getTime(),
                    new Date(blockedMaintenanceDefect.defect.endDate).getTime(),
                  ),
                );
                acc.set(key, {
                  ...blockedMaintenanceDefect,
                  defect: {
                    ...blockedMaintenanceDefect.defect,
                    endDate: maxEndDate,
                  },
                });
              } else {
                acc.set(key, blockedMaintenanceDefect);
              }
              return acc;
            }, new Map())
            .values();

          for (const blockedMaintenanceDefect of suiteDefectsAndMaintenances) {
            const defectStart = new Date(
              blockedMaintenanceDefect.defect.startDate,
            );
            const defectEnd = new Date(blockedMaintenanceDefect.defect.endDate);

            // Verificar se a manutenção está dentro do período atual
            if (defectEnd > currentDate&& defectStart < nextDate) {
              const overlapStart = Math.max(
                defectStart.getTime(),
                currentDate.getTime(),
              );
              const overlapEnd = Math.min(
                defectEnd.getTime(),
                nextDate.getTime(),
              );

              const defectTimeInSeconds = (overlapEnd - overlapStart) / 1000;
              totalUnavailableTime += defectTimeInSeconds;
              categoryTotalsMap[suite.suiteCategoryId].unavailableTime +=
                defectTimeInSeconds;
            }
          }
        }

        const totalSuitesCount = suiteCategories.reduce(
          (acc: any, category: any) => acc + category.suites.length,
          0,
        );
        const daysTimeInSeconds =
          (nextDate.getTime() - currentDate.getTime()) / 1000;
        let availableTimeInSeconds =
          daysTimeInSeconds * totalSuitesCount - totalUnavailableTime;

        if (availableTimeInSeconds < 0) {
          availableTimeInSeconds = 0;
        }

        // Calcular a taxa de ocupação
        const totalOccupancyRateDecimal =
          availableTimeInSeconds > 0
            ? totalOccupiedTime / availableTimeInSeconds
            : 0;

        // Determinar a semana atual
        const weekNumber = this.getWeekNumber(currentDate);

        // Acumular os resultados semanais
        if (!weeklyResults[weekNumber]) {
          weeklyResults[weekNumber] = { total: 0, count: 0 };
        }
        weeklyResults[weekNumber].total += totalOccupancyRateDecimal;
        weeklyResults[weekNumber].count++;

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0]; // Formatar a data para YYYY-MM-DD
        results[dateKey] = {
          totalOccupancyRate: this.formatPercentage(totalOccupancyRateDecimal), // Utilizando a função formatPercentage
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
        await this.insertKpiOccupancyRateByPeriod({
          totalOccupancyRate: new Prisma.Decimal(
            Number((totalOccupancyRateDecimal * 100).toFixed(2)),
          ),
          createdDate: createdDateWithTime,
          period,
          companyId: 1, // Ajuste conforme necessário
        });

        // Atualizar a data atual para o próximo período
        currentDate = new Date(nextDate);
      }

      // Calcular a taxa de ocupação semanal
      const weeklyOccupancyRates = Object.keys(weeklyResults).map(
        (weekNumber: any) => {
          const weeklyTotal = weeklyResults[weekNumber].total;
          const weeklyCount = weeklyResults[weekNumber].count;
          const weeklyOccupancyRate = weeklyTotal / weeklyCount;
          return {
            weekNumber,
            totalOccupancyRate: this.formatPercentage(weeklyOccupancyRate),
          };
        },
      );

      // Formatar o resultado final
      const totalOccupancyRateForThePeriod = Object.keys(results).map(
        (date: any) => ({
          [date]: results[date],
        }),
      );

      return {
        TotalOccupancyRateForThePeriod: totalOccupancyRateForThePeriod,
        WeeklyOccupancyRates: weeklyOccupancyRates,
      };
    } catch (error) {
      console.error(
        'Erro ao calcular o total de Occupancy Rate por período:',
        error,
      );
      throw new BadRequestException(
        `Falha ao calcular total de Occupancy Rate por período: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Função para calcular o número da semana do ano
  private getWeekNumber(date: Date): string {
    const onejan = new Date(date.getFullYear(), 0, 1);
    return Math.ceil(
      ((date.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) /
        7 -
        1,
    ).toString();
  }

  async insertKpiOccupancyRateByPeriod(
    data: KpiOccupancyRateByPeriod,
  ): Promise<KpiOccupancyRateByPeriod> {
    return this.prisma.prismaOnline.kpiOccupancyRateByPeriod.upsert({
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

  private async calculateOccupancyRateBySuiteCategory(
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

        const [
          suiteCategories,
          occupiedSuites,
          cleanings,
          blockedMaintenanceDefects,
        ] = await this.fetchKpiData(currentDate, nextDate);

        // Inicializa o mapa de totais por categoria
        const categoryTotalsMap: Record<string, any> = {};
        for (const suiteCategory of suiteCategories) {
          categoryTotalsMap[suiteCategory.id] = {
            totalOccupiedTime: 0,
            unavailableTime: 0,
            availableTime: 0,
          };
        }

        // Calcular o tempo ocupado por categoria
        for (const occupiedSuite of occupiedSuites) {
          const occupiedTimeInSeconds =
            (new Date(occupiedSuite.checkOut).getTime() -
              new Date(occupiedSuite.checkIn).getTime()) /
            1000;
          const suiteCategoryId =
            occupiedSuite.suiteStates.suite.suiteCategoryId;
          if (categoryTotalsMap[suiteCategoryId]) {
            categoryTotalsMap[suiteCategoryId].totalOccupiedTime +=
              occupiedTimeInSeconds;
          }
        }

        // Calcular o tempo não disponível (limpezas e manutenção)

        for (const suite of suiteCategories.flatMap((cat: any) => cat.suites)) {
          // Lógica para calcular o tempo de limpeza
          const suiteCleanings = cleanings.filter(
            (cleaning: any) =>
              cleaning.suiteState.suiteId === suite.id&&
              new Date(cleaning.startDate) <= nextDate &&
              new Date(cleaning.endDate) >= currentDate,
          );

          for (const cleaning of suiteCleanings) {
            const cleaningStart = new Date(cleaning.startDate);
            const cleaningEnd = new Date(cleaning.endDate);

            // Verificar se a limpeza está dentro do período atual
            if (cleaningEnd > currentDate&& cleaningStart < nextDate) {
              const overlapStart = Math.max(
                cleaningStart.getTime(),
                currentDate.getTime(),
              );
              const overlapEnd = Math.min(
                cleaningEnd.getTime(),
                nextDate.getTime(),
              );
              const cleaningTimeInSeconds = (overlapEnd - overlapStart) / 1000;

              const suiteCategoryId = suite.suiteCategoryId;
              if (categoryTotalsMap[suiteCategoryId]) {
                categoryTotalsMap[suiteCategoryId].unavailableTime +=
                  cleaningTimeInSeconds;
              }
            }
          }

          // Lógica para calcular o tempo de manutenção e defeitos
          const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
            (blockedMaintenanceDefect: any) =>
              blockedMaintenanceDefect.defect.suite.id === suite.id&&
              blockedMaintenanceDefect.suiteState.suite.id === suite.id,
          );

          for (const blockedMaintenanceDefect of suiteDefectsAndMaintenances) {
            const defectStart = new Date(
              blockedMaintenanceDefect.defect.startDate,
            );
            const defectEnd = new Date(blockedMaintenanceDefect.defect.endDate);

            // Verificar se a manutenção está dentro do período atual
            if (defectEnd > currentDate&& defectStart < nextDate) {
              const overlapStart = Math.max(
                defectStart.getTime(),
                currentDate.getTime(),
              );
              const overlapEnd = Math.min(
                defectEnd.getTime(),
                nextDate.getTime(),
              );
              const defectTimeInSeconds = (overlapEnd - overlapStart) / 1000;

              const suiteCategoryId = suite.suiteCategoryId;
              if (categoryTotalsMap[suiteCategoryId]) {
                categoryTotalsMap[suiteCategoryId].unavailableTime +=
                  defectTimeInSeconds;
              }
            }
          }
        }

        // Calcular o tempo disponível por categoria
        for (const suiteCategory of suiteCategories) {
          const suitesInCategory = suiteCategory.suites;
          const daysTimeInSeconds =
            (nextDate.getTime() - currentDate.getTime()) / 1000;
          const suitesInCategoryCount = suitesInCategory.length;
          let availableTimeInSeconds =
            daysTimeInSeconds * suitesInCategoryCount -
            (categoryTotalsMap[suiteCategory.id]
              ? categoryTotalsMap[suiteCategory.id].unavailableTime
              : 0);
          if (availableTimeInSeconds < 0) {
            availableTimeInSeconds = 0;
          }

          if (categoryTotalsMap[suiteCategory.id]) {
            categoryTotalsMap[suiteCategory.id].availableTime =
              availableTimeInSeconds;
          }
        }

        // Calcular a taxa de ocupação por categoria
        for (const suiteCategory of suiteCategories) {
          if (categoryTotalsMap[suiteCategory.id]) {
            const categoryData = categoryTotalsMap[suiteCategory.id];
            if (categoryData.availableTime > 0) {
              const occupancyRateDecimal =
                categoryData.totalOccupiedTime / categoryData.availableTime;

              if (!results[currentDate.toISOString().split('T')[0]]) {
                results[currentDate.toISOString().split('T')[0]] = {};
              }

              results[currentDate.toISOString().split('T')[0]][
                suiteCategory.description
              ] = {
                occupancyRate: this.formatPercentage(occupancyRateDecimal),
              };

              // Inserir dados no banco de dados apenas se houver dados válidos
              if (
                categoryData.totalOccupiedTime > 0||
                categoryData.availableTime > 0
              ) {
                let createdDateWithTime;
                if (period === 'LAST_6_M') {
                  // Cria uma nova instância de Date, subtraindo 1 dia de currentDate
                  createdDateWithTime = new Date(currentDate);
                  createdDateWithTime.setDate(
                    createdDateWithTime.getDate() - 1,
                  );
                  createdDateWithTime.setUTCHours(5, 59, 59, 999);
                } else {
                  createdDateWithTime = new Date(currentDate);
                  createdDateWithTime.setUTCHours(5, 59, 59, 999);
                }

                await this.insertKpiOccupancyRateBySuiteCategory({
                  companyId: 1,
                  suiteCategoryId: suiteCategory.id,
                  suiteCategoryName: suiteCategory.description,
                  createdDate: createdDateWithTime,
                  period,
                  occupancyRate: new Prisma.Decimal(
                    Number(
                      (
                        (categoryData.totalOccupiedTime /
                          categoryData.availableTime) *
                        100
                      ).toFixed(2),
                    ),
                  ),
                });
              }
            }
          }
        }

        // Atualizar a data atual para o próximo período
        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalOccupancyRateForThePeriod = Object.keys(results).map(
        (date: any) => ({
          [date]: results[date],
        }),
      );

      return {
        TotalOccupancyRateForThePeriod: totalOccupancyRateForThePeriod,
      };
    } catch (error) {
      console.error(
        'Erro ao calcular o total de Occupancy Rate por período:',
        error,
      );
      throw new BadRequestException(
        `Falha ao calcular total de Occupancy Rate por período: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async insertKpiOccupancyRateBySuiteCategory(
    data: KpiOccupancyRateBySuiteCategory,
  ): Promise<KpiOccupancyRateBySuiteCategory> {
    return this.prisma.prismaOnline.kpiOccupancyRateBySuiteCategory.upsert({
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

  private async calculateOccupancyRateByWeek(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<void> {
    console.log('Início da função calculateOccupancyRateByWeek');
    try {
      const occupancyByCategoryAndDay: { [key: string]: any } = {};
      const timezone = 'America/Sao_Paulo';

      const dayCountMap: { [key: string]: number } = {};
      let currentDate = moment.tz(startDate, timezone);
      const endDateAdjusted = moment.tz(endDate, timezone);

      // Configuração do cálculo dos dias da semana por período
      if (period === PeriodEnum.LAST_6_M) {
        const sixMonthsAgo = moment(currentDate)
          .subtract(5, 'months')
          .startOf('month');

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

      const [
        suiteCategories,
        occupiedSuites,
        cleanings,
        blockedMaintenanceDefects,
      ] = await this.fetchKpiData(startDate, endDate);

      if (!Array.isArray(suiteCategories) || suiteCategories.length === 0) {
        throw new Error('Nenhuma categoria de suíte encontrada');
      }

      // Inicializar estrutura de ocupação por categoria e dia
      suiteCategories.forEach((suiteCategory: any) => {
        if (suiteCategory&& suiteCategory.description) {
          occupancyByCategoryAndDay[suiteCategory.description] = {};
          for (const dayOfWeek in dayCountMap) {
            occupancyByCategoryAndDay[suiteCategory.description][dayOfWeek] = {
              totalOccupiedTime: 0,
              unavailableTime: 0,
              availableTime: 0,
              occupancyRate: '0.00%',
              createdDate: null,
            };
          }
        }
      });

      // Calcular totalOccupiedTime por categoria e dia da semana
      occupiedSuites.forEach((occupiedSuite: any) => {
        const suiteCategoryDescription =
          occupiedSuite.suiteStates?.suite?.suiteCategories?.description;
        const dayOfOccupation = moment.tz(occupiedSuite.checkIn, timezone);
        const dayOfWeek = dayOfOccupation.format('dddd');

        if (
          occupancyByCategoryAndDay[suiteCategoryDescription]&&
          occupancyByCategoryAndDay[suiteCategoryDescription][dayOfWeek]
        ) {
          const occupiedTime =
            occupiedSuite.checkOut.getTime() - occupiedSuite.checkIn.getTime();
          occupancyByCategoryAndDay[suiteCategoryDescription][
            dayOfWeek
          ].totalOccupiedTime += occupiedTime;
        }
      });

      // Calcular availableTime e occupancyRate
      for (const suiteCategory of suiteCategories) {
        const suitesInCategory = suiteCategory.suites;
        const suitesInCategoryCount = suitesInCategory.length;

        for (const dayOfWeek in occupancyByCategoryAndDay[
          suiteCategory.description
        ]) {
          let unavailableTimeCleaning = 0;

          const suiteCleanings = cleanings.filter((cleaning: any) => {
            const cleaningDayOfWeek = moment
              .tz(cleaning.startDate, timezone)
              .format('dddd');
            return (
              cleaning.suiteState.suiteId === suitesInCategory[0].id &&
              cleaningDayOfWeek === dayOfWeek
            );
          });

          suiteCleanings.forEach((cleaning: any) => {
            const cleaningTimeInSeconds =
              (new Date(cleaning.endDate).getTime() -
                new Date(cleaning.startDate).getTime()) /
              1000;
            unavailableTimeCleaning += cleaningTimeInSeconds;
          });

          const suiteDefectsAndMaintenances = blockedMaintenanceDefects.filter(
            (blockedMaintenanceDefect: any) => {
              const defectDayOfWeek = moment
                .tz(blockedMaintenanceDefect.defect.startDate, timezone)
                .format('dddd');
              return (
                blockedMaintenanceDefect.defect.suite.id ===
                  suitesInCategory[0].id && defectDayOfWeek === dayOfWeek
              );
            },
          );

          suiteDefectsAndMaintenances.forEach((blockedMaintenanceDefect: any) => {
            const startDefect = new Date(
              blockedMaintenanceDefect.defect.startDate,
            );
            const endDefect = new Date(blockedMaintenanceDefect.defect.endDate);
            const defectTimeInSeconds =
              (endDefect.getTime() - startDefect.getTime()) / 1000;
            unavailableTimeCleaning += defectTimeInSeconds;
          });

          const daysTimeInSeconds = dayCountMap[dayOfWeek] * 24 * 60 * 60;
          let availableTimeInSeconds =
            daysTimeInSeconds * suitesInCategoryCount - unavailableTimeCleaning;

          if (availableTimeInSeconds < 0) {
            availableTimeInSeconds = 0;
          }

          occupancyByCategoryAndDay[suiteCategory.description][
            dayOfWeek
          ].unavailableTime += unavailableTimeCleaning;
          occupancyByCategoryAndDay[suiteCategory.description][
            dayOfWeek
          ].availableTime += availableTimeInSeconds * 1000;

          const createdDate = moment
            .tz(startDate, timezone)
            .add(Object.keys(dayCountMap).indexOf(dayOfWeek), 'days')
            .set({ hour: 6, minute: 0, second: 0, millisecond: 0 });
          occupancyByCategoryAndDay[suiteCategory.description][
            dayOfWeek
          ].createdDate = createdDate.toDate();
        }
      }

      // Calcular occupancyRate e totalOccupancyRate
      for (const suiteCategory in occupancyByCategoryAndDay) {
        for (const dayOfWeek in occupancyByCategoryAndDay[suiteCategory]) {
          const totalOccupiedTime =
            occupancyByCategoryAndDay[suiteCategory][dayOfWeek]
              .totalOccupiedTime;
          const availableTime =
            occupancyByCategoryAndDay[suiteCategory][dayOfWeek].availableTime;

          if (availableTime > 0) {
            const occupancyRate = (totalOccupiedTime / availableTime) * 100;
            occupancyByCategoryAndDay[suiteCategory][dayOfWeek].occupancyRate =
              `${occupancyRate.toFixed(2)}%`;
          }
        }
      }

      const batchData: any[] = [];
      const batchSize = 100;
      let count = 0;

      for (const dayOfWeek in dayCountMap) {
        let totalOccupiedTimeAllCategories = 0;
        let totalAvailableTimeAllCategories = 0;

        for (const suiteCategory in occupancyByCategoryAndDay) {
          if (!occupancyByCategoryAndDay[suiteCategory][dayOfWeek]) continue;

          totalOccupiedTimeAllCategories +=
            occupancyByCategoryAndDay[suiteCategory][dayOfWeek]
              .totalOccupiedTime;
          totalAvailableTimeAllCategories +=
            occupancyByCategoryAndDay[suiteCategory][dayOfWeek].availableTime;
        }

        const totalOccupancyRateDecimal =
          totalAvailableTimeAllCategories > 0
            ? totalOccupiedTimeAllCategories / totalAvailableTimeAllCategories
            : 0;

        for (const suiteCategory of suiteCategories) {
          const categoryData =
            occupancyByCategoryAndDay[suiteCategory.description][dayOfWeek];
          if (!categoryData) continue;

          const occupancyRate =
            categoryData.availableTime > 0
              ? (categoryData.totalOccupiedTime / categoryData.availableTime) *
                100
              : 0;

          const totalOccupancyRateValue = Number(
            (totalOccupancyRateDecimal * 100).toFixed(2),
          );
          batchData.push({
            suiteCategoryId: suiteCategory.id,
            suiteCategoryName: suiteCategory.description,
            occupancyRate: new Prisma.Decimal(Number(occupancyRate.toFixed(2))),
            createdDate: categoryData.createdDate,
            period,
            companyId: 1,
            totalOccupancyRate: new Prisma.Decimal(
              isFinite(totalOccupancyRateValue) ? totalOccupancyRateValue : 0,
            ),
          });

          count++;

          if (count >= batchSize) {
            await this.insertKpiOccupancyRateByWeek(batchData);
            batchData.length = 0;
            count = 0;
          }
        }
      }

      if (batchData.length > 0) {
        await this.insertKpiOccupancyRateByWeek(batchData);
      }
    } catch (error) {
      console.error('Erro no cálculo da ocupação:', error);
    }
  }

  async insertKpiOccupancyRateByWeek(
    data: KpiOccupancyRateByWeek[],
  ): Promise<void> {
    try {
      for (const item of data) {
        await this.prisma.prismaOnline.kpiOccupancyRateByWeek.upsert({
          where: {
            suiteCategoryId_period_createdDate: {
              suiteCategoryId: item.suiteCategoryId,
              period: item.period,
              createdDate: item.createdDate,
            },
          },
          create: {
            ...item,
          },
          update: {
            ...item,
          },
        });
      }
    } catch (error) {
      console.error('Erro ao inserir dados em lote:', error);
    }
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
      `Início CronJob KpiOccupancyRate - últimos 7 dias: ${startTimeLast7Days}`,
    );
    await this.findAllKpiOccupancyRate(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.findAllKpiOccupancyRate(
      previousStartDateLast7Days,
      previousParsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateTotalOccupancyRateByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateOccupancyRateBySuiteCategory(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateOccupancyRateByWeek(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiOccupancyRate - últimos 7 dias: ${endTimeLast7Days}`,
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
      `Início CronJob KpiOccupancyRate - últimos 30 dias: ${startTimeLast30Days}`,
    );
    await this.findAllKpiOccupancyRate(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.findAllKpiOccupancyRate(
      previousStartDateLast30Days,
      previousParsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalOccupancyRateByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateOccupancyRateBySuiteCategory(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateOccupancyRateByWeek(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiOccupancyRate - últimos 30 dias: ${endTimeLast30Days}`,
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
      `Início CronJob KpiOccupancyRate - últimos 6 meses: ${startTimeLast6Months}`,
    );
    await this.findAllKpiOccupancyRate(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.findAllKpiOccupancyRate(
      previousStartDateLast6Months,
      previousParsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalOccupancyRateByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateOccupancyRateBySuiteCategory(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateOccupancyRateByWeek(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiOccupancyRate - últimos 6 meses: ${endTimeLast6Months}`,
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

  private formatPercentage(value: number): string {
    const percentageValue = value * 100;
    return `${percentageValue.toFixed(2)}%`;
  }
}

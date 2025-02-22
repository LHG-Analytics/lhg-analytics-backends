import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PeriodEnum, Prisma } from '../../dist/generated/client-online';
import { PrismaService } from '../prisma/prisma.service';
import {
  cleanings,
  cleaningsByPeriod,
  cleaningsByPeriodShift,
  cleaningsByWeek,
} from './entities/cleanings.entity';
import * as moment from 'moment-timezone';
import 'moment/locale/pt-br';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class CleaningsService {
  constructor(private prisma: PrismaService) {}

  async findAllCleanings(
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
        adjustedEndDate.setMonth(adjustedEndDate.getMonth() - 1); // Para LAST_6_M, subtrair um mês
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      }

      let currentDate = new Date(startDate);
      currentDate.setUTCHours(4, 0, 0, 0); // Início do dia contábil às 04:00:00

      // Obtendo os dados de limpeza dentro do período fornecido
      const cleanings =
        await this.prisma.prismaLocal.apartmentCleaning.findMany({
          where: {
            startDate: {
              gte: startDate,
              lte: endDate,
            },
            endDate: {
              not: null, // Excluir registros onde endDate é null
            },
            reasonEnd: {
              equals: 'COMPLETA',
            },
          },
          include: {
            employee: {
              include: {
                personPaper: {
                  include: {
                    person: true,
                  },
                },
              },
            },
          },
        });

      if (!cleanings || cleanings.length === 0) {
        throw new NotFoundException('No cleaning data found.');
      }

      // Turnos de trabalho com intervalos exatos
      const shifts = {
        Manhã: { start: 6 * 3600, end: 10 * 3600 + 59 * 60 + 59 }, // 06:00:00 - 10:59:59
        Tarde: { start: 11 * 3600, end: 18 * 3600 + 59 * 60 + 59 }, // 11:00:00 - 18:59:59
        Noite: { start: 19 * 3600, end: 23 * 3600 + 59 * 60 + 59 }, // 19:00:00 - 23:59:59
      };

      // Função auxiliar para determinar o turno com base no businessStartTime
      const getShiftByBusinessStartTime = (
        businessStartTime: string | null,
      ): string => {
        if (!businessStartTime) {
          return 'Terceirizado';
        }

        const [hour, minute] = businessStartTime.split(':').map(Number);
        const totalSeconds = hour * 3600 + minute * 60;

        for (const [shift, { start, end }] of Object.entries(shifts)) {
          if (totalSeconds >= start && totalSeconds <= end) {
            return shift;
          }
        }
        return 'Terceirizado'; // Padrão caso não encontre
      };

      // Função auxiliar para verificar se a data está dentro do intervalo
      const isWithinDateRange = (
        date: Date,
        startDate: Date,
        endDate: Date,
      ): boolean => {
        return date >= startDate && date <= endDate;
      };

      // Estrutura para armazenar os dados agrupados por turno
      const groupedByShifts: Record<string, Record<string, any>> = {
        Manhã: {},
        Tarde: {},
        Noite: {},
        Terceirizado: {},
      };

      // Variável para acumular o total de suítes limpas
      let totalAllSuitesCleanings = 0;

      // Variável para acumular o total de médias diárias de limpeza
      let totalAllAverageDailyCleaning = 0;

      // Agrupar dados
      for (const cleaning of cleanings) {
        const workDay = cleaning.startDate.toISOString().split('T')[0];
        const employeeName =
          cleaning.employee?.personPaper?.person.name || 'Desconhecido';
        const businessStartTime = cleaning.employee?.businessStartTime; // Supondo que essa propriedade exista

        // Verifica se a data de limpeza está dentro do intervalo fornecido
        if (!isWithinDateRange(cleaning.startDate, startDate, endDate)) {
          continue; // Se não estiver no intervalo, ignora esse registro
        }

        // Determina o turno com base no businessStartTime do funcionário
        const shift = getShiftByBusinessStartTime(businessStartTime);
        // Inicializa os dados para o funcionário no turno, se ainda não existirem
        if (!groupedByShifts[shift][employeeName]) {
          groupedByShifts[shift][employeeName] = {
            'Total de suítes': 0,
            'Dias trabalhados': new Set(), // Dias únicos
            'Média por dia': 0,
          };
        }

        // Atualiza os dados do funcionário
        const employeeData = groupedByShifts[shift][employeeName];
        employeeData['Total de suítes']++;
        employeeData['Dias trabalhados'].add(workDay);

        // Acumula o total de suítes limpas
        totalAllSuitesCleanings++;
      }

      // Calcular a média diária de limpeza para cada funcionário
      for (const shift of Object.keys(groupedByShifts)) {
        for (const employeeName of Object.keys(groupedByShifts[shift])) {
          const data = groupedByShifts[shift][employeeName];
          const totalDaysWorked = data['Dias trabalhados'].size;
          data['Dias trabalhados'] = totalDaysWorked;
          data['Média por dia'] =
            totalDaysWorked > 0
              ? Number((data['Total de suítes'] / totalDaysWorked).toFixed(1))
              : 0;

          // Acumula a média diária de limpeza
          totalAllAverageDailyCleaning += data['Média por dia'];
        }
      }

      // Função para formatar os dados finais e inserir no banco de dados
      const formatAndInsertShiftData = async (
        shiftData: Record<string, any>,
        shift: string,
        period: PeriodEnum,
      ) => {
        for (const employeeName of Object.keys(shiftData)) {
          const data = shiftData[employeeName];
          const totalDaysWorked = data['Dias trabalhados'];

          // Insere o KPI de limpezas por período
          await this.insertCleanings({
            employeeName: employeeName,
            shift: shift, // Adicionando o turno correspondente
            averageDailyCleaning: new Prisma.Decimal(data['Média por dia']),
            totalDaysWorked: totalDaysWorked,
            totalSuitesCleanings: data['Total de suítes'],
            totalAllSuitesCleanings: totalAllSuitesCleanings, // Usando o total acumulado
            totalAllAverageDailyCleaning: totalAllAverageDailyCleaning, // Usando o total acumulado
            period: period,
            createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)),
            companyId,
          });
        }
      };

      // Formatar e inserir os dados para cada turno
      await Promise.all(
        Object.keys(groupedByShifts).map((shift) =>
          formatAndInsertShiftData(groupedByShifts[shift], shift, period),
        ),
      );

      return groupedByShifts;
    } catch (error) {
      console.error('Error in findAllCleanings:', error);
      throw new BadRequestException(
        `Failed to fetch Cleanings: ${error.message}`,
      );
    }
  }

  private async insertCleanings(data: cleanings): Promise<cleanings> {
    return this.prisma.prismaOnline.cleanings.upsert({
      where: {
        employeeName_createdDate_period: {
          period: data.period,
          createdDate: data.createdDate,
          employeeName: data.employeeName,
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

  private async calculateCleaningsByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados

      let currentDate = new Date(startDate);
      currentDate.setUTCHours(4, 0, 0, 0); // Início do dia contábil às 06:00:00

      while (currentDate < endDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          // Para LAST_7_D e LAST_30_D, iteração diária
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(3, 59, 59, 999); // Fim do dia contábil às 05:59:59 do próximo dia
        } else if (period === PeriodEnum.LAST_6_M) {
          // Para LAST_6_M, iteração mensal
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(3, 59, 59, 999); // Fim do mês contábil
        }

        // Obtendo os dados de limpeza dentro do período fornecido
        const cleanings =
          await this.prisma.prismaLocal.apartmentCleaning.findMany({
            where: {
              startDate: {
                gte: currentDate,
                lte: nextDate,
              },
              endDate: {
                not: null, // Excluir registros onde endDate é null
              },
              reasonEnd: {
                equals: 'COMPLETA',
              },
            },
          });

        if (!cleanings || cleanings.length === 0) {
          throw new NotFoundException('No cleaning data found.');
        }

        // Contar o total de limpezas para o período atual
        const totalCleaningsForCurrentPeriod = cleanings.length;

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0];
        results[dateKey] = {
          totalCleanings: totalCleaningsForCurrentPeriod,
        };

        // Criar data para armazenar no banco de dados
        let createdDateWithTime;
        if (period === PeriodEnum.LAST_6_M) {
          // Cria uma nova instância de Date, subtraindo 1 dia de currentDate
          createdDateWithTime = new Date(currentDate);
          createdDateWithTime.setDate(createdDateWithTime.getDate() - 1); // Remove 1 dia
          createdDateWithTime.setUTCHours(5, 59, 59, 999); // Define a hora
        } else {
          createdDateWithTime = new Date(currentDate);
          createdDateWithTime.setUTCHours(5, 59, 59, 999);
        }

        // Insere o KPI de limpezas por período
        await this.insertCleaningsByPeriod({
          period: period,
          createdDate: createdDateWithTime,
          totalSuitesCleanings: totalCleaningsForCurrentPeriod,
          companyId: 1,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalCleaningsForThePeriod = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        TotalCleaningsForThePeriod: totalCleaningsForThePeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular as limpezas totais por período:', error);
      throw new BadRequestException(
        `Failed to calculate total cleaning inspections by period: ${error.message}`,
      );
    }
  }

  private async insertCleaningsByPeriod(
    data: cleaningsByPeriod,
  ): Promise<cleaningsByPeriod> {
    return this.prisma.prismaOnline.cleaningsByPeriod.upsert({
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

  private async calculateCleaningsByWeek(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const cleaningsByShiftAndDay: { [key: string]: any } = {
        Manhã: {},
        Tarde: {},
        Noite: {},
      };

      const timezone = 'America/Sao_Paulo';
      const endDateAdjusted = moment.tz(endDate, timezone);

      // Obter limpezas
      const cleanings =
        await this.prisma.prismaLocal.apartmentCleaning.findMany({
          where: {
            startDate: { gte: startDate, lte: endDate },
            endDate: { not: null }, // Excluir registros onde endDate é null
          },
          include: {
            employee: {
              include: {
                personPaper: {
                  include: {
                    person: true,
                  },
                },
              },
            },
          },
        });

      if (!cleanings || cleanings.length === 0) {
        throw new NotFoundException('No cleaning data found.');
      }

      // Turnos de trabalho com intervalos exatos
      const shifts = {
        Manhã: { start: 6 * 3600, end: 10 * 3600 + 59 * 60 + 59 }, // 06:00:00 - 10:59:59
        Tarde: { start: 11 * 3600, end: 18 * 3600 + 59 * 60 + 59 }, // 11:00:00 - 18:59:59
        Noite: { start: 19 * 3600, end: 23 * 3600 + 59 * 60 + 59 }, // 19:00:00 - 23:59:59
      };

      // Função auxiliar para determinar o turno
      const getShiftByBusinessStartTime = (
        businessStartTime: string | null,
      ): string | null => {
        if (!businessStartTime) return null;
        const [hour, minute] = businessStartTime.split(':').map(Number);
        const totalSeconds = hour * 3600 + minute * 60;
        return (
          Object.entries(shifts).find(
            ([_, { start, end }]) =>
              totalSeconds >= start && totalSeconds <= end,
          )?.[0] || null
        );
      };

      // Contar ocorrências de cada dia da semana no período
      const dayCountMap: { [key: string]: number } = {};
      let currentDate = moment.tz(startDate, timezone);
      while (currentDate.isSameOrBefore(endDateAdjusted)) {
        const dayOfWeek = currentDate.format('dddd');
        dayCountMap[dayOfWeek] = (dayCountMap[dayOfWeek] || 0) + 1;
        currentDate.add(1, 'days');
      }

      // Agrupar dados
      const uniqueEmployeesByShift = {
        Manhã: new Set<number>(),
        Tarde: new Set<number>(),
        Noite: new Set<number>(),
      };

      const excludedShifts = new Set([
        'EXTRA MANHA',
        'EXTRA TARDE',
        'EXTRA NOITE',
      ]);

      for (const cleaning of cleanings) {
        const workDay = moment.tz(cleaning.startDate, timezone).format('dddd'); // Dia da semana em português
        const businessStartTime = cleaning.employee?.businessStartTime;
        if (!businessStartTime) continue; // Pula para a próxima iteração se businessStartTime não existir
        const shift = getShiftByBusinessStartTime(businessStartTime);

        if (shift && !excludedShifts.has(shift)) {
          // Verifica se o turno não está na lista de excluídos
          // Inicializa os dados para o turno e dia, se ainda não existirem
          if (!cleaningsByShiftAndDay[shift][workDay]) {
            cleaningsByShiftAndDay[shift][workDay] = { totalCleanings: 0 };
          }

          // Adiciona o ID do funcionário ao conjunto para contar apenas uma vez
          uniqueEmployeesByShift[shift].add(cleaning.employee.id);
          cleaningsByShiftAndDay[shift][workDay].totalCleanings++;
        }
      }

      // Calcular as métricas e preparar dados para inserção
      const totals = {
        totalAverageDailyWeekCleaning: {} as { [key: string]: number },
        totalIdealShiftMaid: 0,
        totalRealShiftMaid: 0,
        totalDifference: 0,
        totalAllAverageShiftCleaning: 0,
      };

      const insertData = []; // Array para armazenar os dados a serem inseridos

      // Mapeamento de dias da semana para números
      const dayOfWeekMap = {
        domingo: 7,
        'segunda-feira': 1,
        'terça-feira': 2,
        'quarta-feira': 3,
        'quinta-feira': 4,
        'sexta-feira': 5,
        sábado: 6,
      };

      // Calcular totais e preparar dados para inserção
      for (const shift in cleaningsByShiftAndDay) {
        let shiftTotalCount = 0;

        for (const day in cleaningsByShiftAndDay[shift]) {
          const dayData = cleaningsByShiftAndDay[shift][day];
          const averageDailyWeekCleaning = (
            dayData.totalCleanings / dayCountMap[day]
          ).toFixed(2);
          cleaningsByShiftAndDay[shift][day].averageDailyWeekCleaning =
            +averageDailyWeekCleaning;

          // Acumula a média diária para cada dia da semana
          totals.totalAverageDailyWeekCleaning[day] =
            (totals.totalAverageDailyWeekCleaning[day] || 0) +
            +averageDailyWeekCleaning;

          // Preparar dados para inserção
          const createdDate = moment
            .tz(startDate, timezone)
            .add(Object.keys(dayCountMap).indexOf(day), 'days')
            .set({ hour: 6, minute: 0, second: 0, millisecond: 0 });
          insertData.push({
            period,
            shift,
            createdDate: createdDate.toDate(),
            totalSuitesCleanings: dayData.totalCleanings,
            averageDailyWeekCleaning: +averageDailyWeekCleaning,
            totalAverageDailyWeekCleaning:
              +totals.totalAverageDailyWeekCleaning[day].toFixed(2), // Use o valor acumulado
            totalAverageShiftCleaning: 0,
            totalAllAverageShiftCleaning: 0,
            idealShiftMaid: 0,
            totalIdealShiftMaid: 0,
            realShiftMaid: uniqueEmployeesByShift[shift].size,
            totalRealShiftMaid: 0,
            difference: 0,
            totalDifference: 0,
            companyId: 1,
          });

          // Acumula total para o turno
          shiftTotalCount += +averageDailyWeekCleaning;
        }

        // Calcular e atualizar turnos
        cleaningsByShiftAndDay[shift].totalAverageShiftCleaning = +(
          shiftTotalCount / Object.keys(cleaningsByShiftAndDay[shift]).length
        ).toFixed(2);
        cleaningsByShiftAndDay[shift].idealShiftMaid = Math.ceil(
          cleaningsByShiftAndDay[shift].totalAverageShiftCleaning / 7,
        );

        totals.totalIdealShiftMaid +=
          cleaningsByShiftAndDay[shift].idealShiftMaid;
        cleaningsByShiftAndDay[shift].realShiftMaid =
          uniqueEmployeesByShift[shift].size;
        totals.totalRealShiftMaid +=
          cleaningsByShiftAndDay[shift].realShiftMaid;
        cleaningsByShiftAndDay[shift].difference =
          cleaningsByShiftAndDay[shift].realShiftMaid -
          cleaningsByShiftAndDay[shift].idealShiftMaid;
        totals.totalDifference += cleaningsByShiftAndDay[shift].difference;

        // Acumula para totalAllAverageShiftCleaning
        totals.totalAllAverageShiftCleaning +=
          cleaningsByShiftAndDay[shift].totalAverageShiftCleaning;

        // Atualizar idealShiftMaid nos dados de inserção para o turno
        for (const data of insertData.filter((d) => d.shift === shift)) {
          data.idealShiftMaid = cleaningsByShiftAndDay[shift].idealShiftMaid;
        }
      }

      // Atualiza dados de inserção com os totais calculados
      for (const data of insertData) {
        data.totalAverageShiftCleaning =
          +cleaningsByShiftAndDay[data.shift].totalAverageShiftCleaning.toFixed(
            2,
          );
        data.totalAllAverageShiftCleaning =
          +totals.totalAllAverageShiftCleaning.toFixed(2);
        data.totalIdealShiftMaid = totals.totalIdealShiftMaid;
        data.totalRealShiftMaid = totals.totalRealShiftMaid;
        data.difference = cleaningsByShiftAndDay[data.shift].difference;
        data.totalDifference = totals.totalDifference;

        // Atribuir o valor correto de totalAverageDailyWeekCleaning com base no dia da semana
        const createdDayOfWeek = moment
          .tz(data.createdDate, timezone)
          .format('dddd');
        data.totalAverageDailyWeekCleaning =
          totals.totalAverageDailyWeekCleaning[createdDayOfWeek] || 0; // Atribui o valor correto
      }

      // Adiciona totais ao retorno
      cleaningsByShiftAndDay.Totals = {
        ...totals,
        totalAverageDailyWeekCleaning: Object.fromEntries(
          Object.entries(totals.totalAverageDailyWeekCleaning).map(
            ([day, value]) => {
              const numericValue = typeof value === 'number' ? value : 0;
              return [day, +numericValue.toFixed(2)];
            },
          ),
        ),
      };

      // Inserir dados no banco de dados
      for (const data of insertData) {
        await this.insertCleaningsByWeek(data);
      }

      return cleaningsByShiftAndDay;
    } catch (error) {
      console.error('Erro ao calcular limpezas por semana:', error);
      throw new BadRequestException('Erro ao calcular limpezas por semana.');
    }
  }

  private async insertCleaningsByWeek(
    data: cleaningsByWeek,
  ): Promise<cleaningsByWeek> {
    return this.prisma.prismaOnline.cleaningsByWeek.upsert({
      where: {
        period_shift_createdDate: {
          period: data.period,
          shift: data.shift,
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

  private async calculateCleaningsByShift(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: {
        [shift: string]: {
          [groupKey: string]: { [employeeName: string]: number };
        };
      } = {};

      const determineShift = (businessStartTime: string | null): string => {
        if (!businessStartTime) return 'Terceirizado';

        const [hour, minute] = businessStartTime.split(':').map(Number);
        const totalSeconds = hour * 3600 + minute * 60;

        const shifts = {
          Manhã: { start: 6 * 3600, end: 10 * 3600 + 59 * 60 + 59 },
          Tarde: { start: 11 * 3600, end: 18 * 3600 + 59 * 60 + 59 },
          Noite: { start: 19 * 3600, end: 23 * 3600 + 59 * 60 + 59 },
        };

        for (const [shift, { start, end }] of Object.entries(shifts)) {
          if (totalSeconds >= start && totalSeconds <= end) return shift;
        }

        return 'Horário Indefinido';
      };

      let currentDate = moment.utc(startDate).startOf('day').add(6, 'hours');

      while (currentDate.isBefore(moment.utc(endDate))) {
        const nextDate = currentDate.clone().add(1, 'day').subtract(1, 'ms');

        const cleanings =
          await this.prisma.prismaLocal.apartmentCleaning.findMany({
            where: {
              startDate: { gte: currentDate.toDate(), lte: nextDate.toDate() },
              endDate: { not: null },
              reasonEnd: { equals: 'COMPLETA' },
            },
            include: {
              employee: {
                include: {
                  personPaper: {
                    include: {
                      person: true,
                    },
                  },
                },
              },
            },
          });

        cleanings.forEach((cleaning) => {
          const employeeName =
            cleaning.employee?.personPaper?.person?.name || 'Desconhecido';
          const businessStartTime =
            cleaning.employee?.businessStartTime || null;
          const shift = determineShift(businessStartTime);

          const dateKey =
            period === 'LAST_6_M'
              ? currentDate.format('YYYY-MM')
              : currentDate.format('YYYY-MM-DD');

          if (!results[shift]) results[shift] = {};
          if (!results[shift][dateKey]) results[shift][dateKey] = {};
          if (!results[shift][dateKey][employeeName])
            results[shift][dateKey][employeeName] = 0;

          results[shift][dateKey][employeeName]++;
        });

        currentDate = currentDate.add(1, 'day');
      }

      if (period === 'LAST_6_M') {
        const referenceDate = moment
          .tz('America/Sao_Paulo')
          .subtract(1, 'days');
        const monthsToProcess = Array.from(
          { length: 6 },
          (_, i) =>
            moment
              .tz('America/Sao_Paulo') // Usa o fuso horário de São Paulo
              .subtract(i + 1, 'months') // Subtrai i + 1 meses
              .set({ date: referenceDate.date() }), // Configura o dia corretamente no mês
        );

        for (const shift of Object.keys(results)) {
          for (const monthMoment of monthsToProcess) {
            const groupKey = monthMoment.format('YYYY-MM');

            if (results[shift][groupKey]) {
              for (const [employeeName, totalCleanings] of Object.entries(
                results[shift][groupKey],
              )) {
                const data = {
                  period,
                  createdDate: monthMoment.toDate(),
                  shift,
                  employeeName,
                  totalSuitesCleanings: totalCleanings,
                  companyId: 1,
                };

                try {
                  await this.insertCleaningsByPeriodShift(data);
                } catch (error) {
                  console.error(
                    `Erro ao inserir limpezas para ${employeeName} no turno ${shift} no grupo ${groupKey}:`,
                    error,
                  );
                }
              }
            }
          }
        }
      } else {
        for (const [shift, groups] of Object.entries(results)) {
          for (const [groupKey, employees] of Object.entries(groups)) {
            for (const [employeeName, totalCleanings] of Object.entries(
              employees,
            )) {
              const createdDateWithTime = moment
                .utc(groupKey, 'YYYY-MM-DD')
                .endOf('day');

              const data = {
                period,
                createdDate: createdDateWithTime.toDate(),
                shift,
                employeeName,
                totalSuitesCleanings: totalCleanings,
                companyId: 1,
              };

              try {
                await this.insertCleaningsByPeriodShift(data);
              } catch (error) {
                console.error(
                  `Erro ao inserir limpezas para ${employeeName} no turno ${shift} no grupo ${groupKey}:`,
                  error,
                );
              }
            }
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Erro ao calcular limpezas por turno:', error);
      throw new BadRequestException(
        `Failed to calculate cleanings by shift: ${error.message}`,
      );
    }
  }

  private async insertCleaningsByPeriodShift(
    data: cleaningsByPeriodShift,
  ): Promise<cleaningsByPeriodShift> {
    return this.prisma.prismaOnline.cleaningsByPeriodShift.upsert({
      where: {
        period_createdDate_employeeName: {
          period: data.period,
          createdDate: data.createdDate,
          employeeName: data.employeeName,
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
    endDateLast7Days.setHours(3, 59, 59, 999);

    const startDateLast7Days = new Date(currentDate);
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 7);
    startDateLast7Days.setHours(4, 0, 0, 0);

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
    previousStartDateLast7Days.setHours(4, 0, 0, 0);

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
      `Início CronJob Cleanings - últimos 7 dias: ${startTimeLast7Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllCleanings(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllCleanings(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateCleaningsByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateCleaningsByWeek(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    await this.calculateCleaningsByShift(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob Cleanings - últimos 7 dias: ${endTimeLast7Days}`,
    );

    // Últimos 30 dias
    const endDateLast30Days = currentDate;
    endDateLast30Days.setHours(3, 59, 59, 999);

    const startDateLast30Days = new Date(currentDate);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30);
    startDateLast30Days.setHours(4, 0, 0, 0);

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
    previousStartDateLast30Days.setHours(4, 0, 0, 0);

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
      `Início CronJob Cleanings - últimos 30 dias: ${startTimeLast30Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllCleanings(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllCleanings(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );

    await this.calculateCleaningsByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );

    await this.calculateCleaningsByWeek(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );

    await this.calculateCleaningsByShift(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );

    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob Cleanings - últimos 30 dias: ${endTimeLast30Days}`,
    );

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = currentDate;
    endDateLast6Months.setHours(3, 59, 59, 999);

    const startDateLast6Months = new Date(currentDate);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6);
    startDateLast6Months.setHours(4, 0, 0, 0);

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
    previousStartDateLast6Months.setHours(4, 0, 0, 0); // Configuração de horas

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
      `Início CronJob Cleanings - últimos 6 meses: ${startTimeLast6Months}`,
    );

    // Chamar a função para o período atual
    await this.findAllCleanings(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllCleanings(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );

    await this.calculateCleaningsByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );

    await this.calculateCleaningsByWeek(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );

    await this.calculateCleaningsByShift(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );

    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob Cleanings - últimos 6 meses: ${endTimeLast6Months}`,
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

    parsedStartDate.setUTCHours(4, 0, 0, 0); // Define início às 04:00
    parsedEndDate.setUTCHours(3, 59, 59, 999); // Define final às 03:59:59.999

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }
}

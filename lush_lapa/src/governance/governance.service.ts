import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as moment from 'moment-timezone';
import { Moment } from 'moment-timezone';
import { PeriodEnum } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GovernanceService {
  constructor(private prisma: PrismaService) {}

  async findAllGovernance(period: PeriodEnum) {
    // Define o fuso horário padrão como São Paulo
    moment.tz.setDefault('America/Sao_Paulo');

    let startDate, endDate, startDatePrevious, endDatePrevious;

    // Obtém o horário atual em "America/Sao_Paulo" no início do dia
    const today = moment.tz('America/Sao_Paulo').set({
      hour: 5,
      minute: 59,
      second: 59,
      millisecond: 999,
    });

    // Define o `endDate` como o dia anterior às 05:59:59 no fuso horário local
    endDate = today.clone().subtract(1, 'day').set({
      hour: 5,
      minute: 59,
      second: 59,
      millisecond: 999,
    });

    // Calcula o `startDate` e os períodos anteriores com base no `period`
    switch (period) {
      case PeriodEnum.LAST_7_D:
        // Período atual: últimos 7 dias (considerando 7 dias completos)
        startDate = endDate.clone().subtract(6, 'days').set({
          hour: 5,
          minute: 59,
          second: 59,
          millisecond: 999,
        });

        // Período anterior: 7 dias antes do início do período atual
        startDatePrevious = startDate.clone().subtract(7, 'days');
        endDatePrevious = startDate.clone();
        break;

      case PeriodEnum.LAST_30_D:
        // Período atual: últimos 30 dias
        startDate = endDate.clone().subtract(29, 'days').set({
          hour: 5,
          minute: 59,
          second: 59,
          millisecond: 999,
        });

        // Período anterior: 30 dias antes do início do período atual
        startDatePrevious = startDate.clone().subtract(30, 'days');
        endDatePrevious = startDate.clone();
        break;

      case PeriodEnum.LAST_6_M:
        // Período atual: últimos 6 meses
        startDate = endDate.clone().subtract(6, 'months').set({
          hour: 5,
          minute: 59,
          second: 59,
          millisecond: 999,
        });

        // Período anterior: 6 meses antes do início do período atual
        startDatePrevious = startDate.clone().subtract(6, 'months');
        endDatePrevious = startDate.clone();
        break;

      default:
        throw new Error('Invalid period specified');
    }

    // Converte as datas para UTC sem alterar o horário configurado
    startDate = moment.tz(startDate, 'America/Sao_Paulo').utc(true).toDate();
    endDate = moment.tz(endDate, 'America/Sao_Paulo').utc(true).toDate();
    startDatePrevious = moment
      .tz(startDatePrevious, 'America/Sao_Paulo')
      .utc(true)
      .toDate();
    endDatePrevious = moment
      .tz(endDatePrevious, 'America/Sao_Paulo')
      .utc(true)
      .toDate();

    // Exibe as datas geradas
    console.log('startDate:', startDate);
    console.log('endDate:', endDate);
    console.log('startDatePrevious:', startDatePrevious);
    console.log('endDatePrevious:', endDatePrevious);

    // Consultas para buscar os dados de KPIs com base nas datas selecionadas
    const [
      cleanings,
      cleaningsPreviousData,
      cleaningsByPeriod,
      cleaningsByPeriodShift,
      cleaningsByWeek,
      inspections,
      inspectionsPreviousData,
    ] = await this.prisma.prismaOnline.$transaction([
      this.prisma.prismaOnline.cleanings.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate, // Filtra pela data inicial
          },
        },
        select: {
          employeeName: true,
          createdDate: true,
          averageDailyCleaning: true,
          shift: true,
          totalDaysWorked: true,
          totalSuitesCleanings: true,
          totalAllSuitesCleanings: true,
          totalAllAverageDailyCleaning: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.cleanings.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          employeeName: true,
          createdDate: true,
          averageDailyCleaning: true,
          shift: true,
          totalDaysWorked: true,
          totalSuitesCleanings: true,
          totalAllSuitesCleanings: true,
          totalAllAverageDailyCleaning: true,
        },
        orderBy: {
          createdDate: 'asc',
        },
      }),
      this.prisma.prismaOnline.cleaningsByPeriod.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate, // Filtra pela data inicial
          },
        },
        select: {
          createdDate: true,
          totalSuitesCleanings: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.cleaningsByPeriodShift.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate, // Filtra pela data inicial
          },
        },
        select: {
          createdDate: true,
          totalSuitesCleanings: true,
          employeeName: true,
          shift: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.cleaningsByWeek.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
          },
        },
        select: {
          averageDailyWeekCleaning: true,
          createdDate: true,
          difference: true,
          idealShiftMaid: true,
          realShiftMaid: true,
          shift: true,
          totalAverageDailyWeekCleaning: true,
          totalAverageShiftCleaning: true,
          totalDifference: true,
          totalIdealShiftMaid: true,
          totalRealShiftMaid: true,
          totalSuitesCleanings: true,
          totalAllAverageShiftCleaning: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.inspections.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDate,
          },
        },
        select: {
          createdDate: true,
          employeeName: true,
          totalInspections: true,
          totalAllInspections: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
      this.prisma.prismaOnline.inspections.findMany({
        where: {
          period: period,
          createdDate: {
            gte: startDatePrevious,
            lte: endDatePrevious,
          },
        },
        select: {
          createdDate: true,
          employeeName: true,
          totalInspections: true,
          totalAllInspections: true,
        },
        orderBy: {
          createdDate: 'desc',
        },
      }),
    ]);

    const bigNumbers = {
      currentDate: {
        totalAllSuitesCleanings: cleanings[0]?.totalAllSuitesCleanings,
        totalAllAverageDailyCleaning:
          cleanings[0]?.totalAllAverageDailyCleaning,
        totalAllInspections: inspections[0]?.totalAllInspections,
      },

      previousDate: {
        totalAllSuitesCleaningsPreviousData:
          cleaningsPreviousData[0]?.totalAllSuitesCleanings,
        totalAllAverageDailyCleaningPreviousData:
          cleaningsPreviousData[0]?.totalAllAverageDailyCleaning,
        totalAllInspectionsPreviousData:
          inspectionsPreviousData[0]?.totalAllInspections,
      },
    };

    // Defina uma interface para o tipo de dados
    interface SupervisorPerformance {
      name: string;
      value: number;
      createdDate: Date;
    }

    // Lógica para calcular a performance dos supervisores
    const supervisorsPerformance: { [key: string]: SupervisorPerformance } = {};

    // Para calcular a porcentagem de cada supervisor
    for (const inspection of inspections) {
      const { employeeName, totalInspections, createdDate } = inspection;

      // Cria uma chave única para o supervisor
      const key = employeeName;

      // Verifica se já existe um registro para esse supervisor
      if (
        !supervisorsPerformance[key] ||
        new Date(supervisorsPerformance[key].createdDate) <
          new Date(createdDate)
      ) {
        // Atualiza o registro com os dados mais recentes
        supervisorsPerformance[key] = {
          name: employeeName,
          value: totalInspections,
          createdDate: createdDate,
        };
      }
    }

    // Converte o objeto de volta para um array
    const performanceArray: SupervisorPerformance[] = Object.values(
      supervisorsPerformance,
    );

    // Formata o retorno para o ApexCharts
    const supervisorsPerformanceFormatted = {
      categories: performanceArray.map((item) => item.name),
      series: performanceArray.map((item) => item.value),
    };

    // Lógica para calcular a performance das limpezas
    const shiftCleaningMap = {
      Manhã: 0,
      Tarde: 0,
      Noite: 0,
      Terceirizado: 0, // Inicializa a categoria Sem Turno
    };

    // Objeto para armazenar os dados mais recentes
    const latestCleanings = {};

    // Itera sobre os dados de limpeza
    for (const cleaning of cleanings) {
      const { shift, employeeName, createdDate } = cleaning;

      // Cria uma chave única para o empregado e o turno
      const key = `${employeeName}-${shift}`;

      // Verifica se já existe um registro para esse empregado e turno
      if (
        !latestCleanings[key] ||
        new Date(latestCleanings[key].createdDate) < new Date(createdDate)
      ) {
        // Atualiza o registro com os dados mais recentes
        latestCleanings[key] = cleaning;
      }
    }

    // Agora, agregue os dados mais recentes
    for (const key in latestCleanings) {
      const { shift, totalSuitesCleanings, employeeName } =
        latestCleanings[key];

      // Se o empregado é um dos extras, contabiliza apenas no turno Terceirizado
      if (
        employeeName === 'EXTRA MANHA' ||
        employeeName === 'EXTRA TARDE' ||
        employeeName === 'EXTRA NOITE'
      ) {
        shiftCleaningMap['Terceirizado'] += totalSuitesCleanings;
      } else {
        // Se o turno já existe no mapa, soma o totalSuitesCleanings
        if (shiftCleaningMap[shift] !== undefined) {
          shiftCleaningMap[shift] += totalSuitesCleanings;
        } else {
          // Se não existe, inicializa com o totalSuitesCleanings
          shiftCleaningMap[shift] = totalSuitesCleanings;
        }
      }
    }

    // Converte o mapa em arrays para o retorno
    const shiftCleaning = {
      categories: Object.keys(shiftCleaningMap), // Turnos
      series: Object.values(shiftCleaningMap), // Valores agregados
    };

    const cleaningByDate = cleaningsByPeriod.reduce((acc, curr) => {
      const timezone = 'America/Sao_Paulo';
      const createdDate = moment.utc(curr.createdDate); // Data do registro no formato UTC

      if (period === 'LAST_6_M') {
        // Data de referência: dia atual (ajustada para o dia anterior)
        const today = moment.tz(timezone).subtract(1, 'day');
        const currentDay = today.date(); // Dia do mês ajustado

        // Calcula as datas específicas dos últimos 6 meses no mesmo dia anterior
        const last6MonthsDates = Array.from({ length: 6 }, (_, i) =>
          today
            .clone()
            .subtract(i + 1, 'months')
            .date(currentDay)
            .startOf('day'),
        );

        // Ajusta a data para UTC no horário 05:59:59.999Z
        const last6MonthsUTC = last6MonthsDates.map((date) =>
          date
            .clone()
            .utc()
            .set({ hour: 5, minute: 59, second: 59, millisecond: 999 }),
        );

        // Verifica se a data está dentro das datas calculadas em UTC
        const isMatchingDate = last6MonthsUTC.some((date) =>
          createdDate.isSame(date, 'day'),
        );

        if (!isMatchingDate) {
          return acc; // Ignora se a data não pertence aos últimos 6 meses
        }
      }

      // Para períodos diferentes de LAST_6_M, não há filtro adicional
      const dateKey = createdDate.format('DD/MM/YYYY'); // Formato desejado

      const totalSuitesCleanings = Number(curr.totalSuitesCleanings);

      if (!acc[dateKey]) {
        acc[dateKey] = { totalSuitesCleanings: 0 };
      }

      acc[dateKey].totalSuitesCleanings += totalSuitesCleanings;

      return acc;
    }, {});

    // Agora, formatamos o resultado em dois arrays: categories e series
    const formattedCleaningByDate = {
      categories: [],
      series: [],
    };

    // Preenche os arrays com os dados acumulados
    Object.keys(cleaningByDate).forEach((date) => {
      formattedCleaningByDate.categories.push(date);
      formattedCleaningByDate.series.push(
        cleaningByDate[date].totalSuitesCleanings,
      );
    });

    const formattedForApexCharts = (cleaningsByPeriodShift) => {
      // Adicionamos 'period' como parâmetro
      const categories = []; // Para armazenar as datas únicas
      const shiftsData = {
        Manhã: [],
        Tarde: [],
        Noite: [],
        Terceirizado: [],
      };

      const timezone = 'America/Sao_Paulo';

      // Caso o período seja LAST_6_M, ajusta a data para pegar o dia de ontem dos últimos 6 meses
      if (period === 'LAST_6_M') {
        // Data de referência: dia de ontem ajustado
        const today = moment.tz(timezone).subtract(1, 'day');
        const currentDay = today.date(); // Dia do mês ajustado

        // Calcula as datas específicas dos últimos 6 meses no mesmo dia anterior
        const last6MonthsDates = Array.from({ length: 6 }, (_, i) =>
          today
            .clone()
            .subtract(i + 1, 'months')
            .date(currentDay)
            .startOf('day'),
        );

        // Ajusta as datas para UTC no horário 05:59:59.999Z
        const last6MonthsUTC = last6MonthsDates.map((date) =>
          date
            .clone()
            .utc()
            .set({ hour: 5, minute: 59, second: 59, millisecond: 999 }),
        );

        // Adiciona as datas formatadas para o array de categorias
        categories.push(
          ...last6MonthsUTC.map((date) => date.format('DD/MM/YYYY')),
        );

        // Filtra os dados de acordo com as datas calculadas
        cleaningsByPeriodShift = cleaningsByPeriodShift.filter((cleaning) => {
          const createdDate = moment
            .utc(cleaning.createdDate)
            .tz(timezone)
            .startOf('day'); // Ajusta para início do dia no timezone

          // Verifica se a data corresponde a uma das datas no array
          return last6MonthsUTC.some((date) => createdDate.isSame(date, 'day'));
        });
      } else {
        // Para outros períodos, define as categorias com base nos dados
        cleaningsByPeriodShift.forEach((cleaning) => {
          const createdDate = moment
            .utc(cleaning.createdDate)
            .tz(timezone)
            .format('DD/MM/YYYY'); // Formata a data no padrão esperado

          if (!categories.includes(createdDate)) {
            categories.push(createdDate);
          }
        });

        // Ordena as categorias em ordem crescente
        categories.sort((a, b) =>
          moment(a, 'DD/MM/YYYY').isBefore(moment(b, 'DD/MM/YYYY')) ? -1 : 1,
        );
      }

      // Processa os dados para gerar os valores no gráfico
      cleaningsByPeriodShift.forEach((cleaning) => {
        const createdDate = moment
          .utc(cleaning.createdDate)
          .tz(timezone)
          .format('DD/MM/YYYY'); // Formata a data no padrão esperado
        const shift = cleaning.shift; // Ex: 'Manhã', 'Tarde', 'Noite', 'Terceirizado'
        const employeeName = cleaning.employeeName;
        const totalSuitesCleanings = Number(cleaning.totalSuitesCleanings);

        if (!shiftsData[shift]) {
          shiftsData[shift] = [];
        }

        let employeeData = shiftsData[shift].find(
          (e) => e.name === employeeName,
        );
        if (!employeeData) {
          employeeData = {
            name: employeeName,
            data: new Array(categories.length).fill(0),
          };
          shiftsData[shift].push(employeeData);
        }

        const dateIndex = categories.indexOf(createdDate);

        if (dateIndex !== -1) {
          employeeData.data[dateIndex] += totalSuitesCleanings;
        }
      });

      // Preenche dados faltantes caso algum funcionário não tenha dado para uma data
      for (const shift in shiftsData) {
        shiftsData[shift].forEach((employeeData) => {
          if (employeeData.data.length < categories.length) {
            employeeData.data = [
              ...employeeData.data,
              ...new Array(categories.length - employeeData.data.length).fill(
                0,
              ),
            ];
          }
        });
      }

      // Cria a estrutura de série para o gráfico
      const series = Object.entries(shiftsData).map(([shift, employees]) => ({
        [shift]: employees,
      }));

      return {
        categories,
        series,
      };
    };

    const employeeReport = cleanings.reduce((acc, cleaning) => {
      const {
        shift,
        employeeName,
        totalSuitesCleanings,
        totalDaysWorked,
        averageDailyCleaning,
      } = cleaning;

      // Verifica se já existe o turno no acumulador, senão cria como um array
      if (!acc[shift]) {
        acc[shift] = [];
      }

      // Adiciona os dados do funcionário ao turno
      acc[shift].push({
        employeeName: employeeName,
        totalSuitesCleanings: totalSuitesCleanings,
        totalDaysWorked: totalDaysWorked,
        averageDailyCleaning: Number(averageDailyCleaning),
      });

      return acc;
    }, {});

    const teamSizing = cleaningsByWeek.reduce(
      (acc, cleaning) => {
        const {
          shift,
          createdDate,
          totalAverageShiftCleaning,
          averageDailyWeekCleaning,
          idealShiftMaid,
          realShiftMaid,
          totalSuitesCleanings,
          difference,
        } = cleaning;

        // Função para remover acentos
        const removeAccents = (str) => {
          return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        };

        // Configura o timezone e formata o dia da semana
        const timezone = 'America/Sao_Paulo';
        const dayOfWeek = removeAccents(
          moment.tz(createdDate, timezone).format('dddd').replace('-feira', ''),
        );

        // Inicializa o objeto do turno, se não existir
        if (!acc[shift]) {
          acc[shift] = {
            totalAverageShiftCleaning: Number(totalAverageShiftCleaning),
            idealShiftMaid,
            realShiftMaid,
            difference,
          };
        }

        // Adiciona os dados do dia da semana
        acc[shift][dayOfWeek] = {
          totalCleanings: Number(totalSuitesCleanings),
          averageDailyWeekCleaning: Number(averageDailyWeekCleaning),
        };

        return acc;
      },
      {} as Record<string, any>,
    );

    // Coleta os totais
    const totals = {
      totalAverageDailyWeekCleaning: {},
      totalIdealShiftMaid: 0,
      totalRealShiftMaid: 0,
      totalDifference: 0,
      totalAllAverageShiftCleaning: 0,
    };

    // Preenche os totais diretamente
    cleaningsByWeek.forEach((cleaning) => {
      const {
        totalAllAverageShiftCleaning,
        totalIdealShiftMaid,
        totalRealShiftMaid,
        totalDifference,
        createdDate,
        totalAverageDailyWeekCleaning,
      } = cleaning;

      // Atribui os totais diretamente
      totals.totalAllAverageShiftCleaning = Number(
        totalAllAverageShiftCleaning,
      );
      totals.totalIdealShiftMaid = totalIdealShiftMaid; // Atribui diretamente
      totals.totalRealShiftMaid = totalRealShiftMaid; // Atribui diretamente
      totals.totalDifference = totalDifference; // Atribui diretamente

      // Função para remover acentos
      const removeAccents = (str) => {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      };

      // Preenche os totais diários para cada dia da semana como um objeto
      const dayOfWeek = removeAccents(
        moment
          .tz(createdDate, 'America/Sao_Paulo')
          .format('dddd')
          .replace('-feira', ''),
      );

      // Atribui o valor diretamente ao totalAverageDailyWeekCleaning
      // Se o dia já existir, soma os valores, caso contrário, inicializa
      totals.totalAverageDailyWeekCleaning[dayOfWeek] = Number(
        totalAverageDailyWeekCleaning,
      );
    });

    // Adiciona os totais no objeto `teamSizing`
    teamSizing.Totals = totals;

    return {
      Company: 'Lush Lapa',
      BigNumbers: [bigNumbers],
      SupervisorsPerformance: supervisorsPerformanceFormatted,
      ShiftCleaning: {
        categories: shiftCleaning.categories,
        series: shiftCleaning.series,
      },
      CleaningByDate: formattedCleaningByDate,
      EmployeeCleaningByShift: formattedForApexCharts(cleaningsByPeriodShift),
      EmployeeReport: employeeReport,
      TeamSizing: teamSizing,
    };
  }

  private async fetchKpiData(startDate: Date, endDate: Date) {
    return await Promise.all([
      this.prisma.prismaLocal.apartmentCleaning.findMany({
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
      }),
      this.prisma.prismaLocal.apartmentInspection.findMany({
        where: {
          startDate: {
            gte: startDate,
            lte: endDate,
          },
          reasonEnd: 'APROVADA', // Filtrar apenas as inspeções aprovadas
          user: {
            employee: {
              role: {
                id: {
                  equals: 19,
                },
              },
            },
          },
        },
        include: {
          user: {
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
          },
        },
      }),
    ]);
  }

  async calculateKpisByDateRange(startDate: Date, endDate: Date): Promise<any> {
    try {
      console.log('startDate:', startDate);
      console.log('endDate:', endDate);

      const timezone = 'America/Sao_Paulo';

      const [cleanings, inspections] = await this.fetchKpiData(
        startDate,
        endDate,
      );

      if (!cleanings || cleanings.length === 0) {
        throw new NotFoundException('No cleaning data found.');
      }

      const shifts = {
        Manhã: { start: 6 * 3600, end: 10 * 3600 + 59 * 60 + 59 },
        Tarde: { start: 11 * 3600, end: 18 * 3600 + 59 * 60 + 59 },
        Noite: { start: 19 * 3600, end: 23 * 3600 + 59 * 60 + 59 },
      };

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
        return 'Terceirizado';
      };

      const isWithinDateRange = (
        date: Moment,
        startDate: Moment,
        endDate: Moment,
      ): boolean => {
        return date.isBetween(startDate, endDate, null, '[]'); // Inclui as extremidades
      };

      const groupedByShifts: Record<string, Record<string, any>> = {
        Manhã: {},
        Tarde: {},
        Noite: {},
        Terceirizado: {},
      };

      let totalAllSuitesCleanings = 0;
      let totalAllAverageDailyCleaning = 0;

      // Inicializa uniqueEmployeesByShift
      const uniqueEmployeesByShift: Record<string, Set<number>> = {
        Manhã: new Set(),
        Tarde: new Set(),
        Noite: new Set(),
      };

      for (const cleaning of cleanings) {
        const cleaningStartDate = moment.utc(cleaning.startDate).tz(timezone);

        const startOfDay = cleaningStartDate
          .clone()
          .startOf('day')
          .add(4, 'hours');
        const endOfDay = cleaningStartDate
          .clone()
          .startOf('day')
          .add(1, 'days')
          .subtract(1, 'seconds');

        if (
          !isWithinDateRange(
            cleaningStartDate,
            moment(startDate),
            moment(endDate),
          )
        ) {
          continue;
        }

        if (
          cleaningStartDate.isBefore(startOfDay) ||
          cleaningStartDate.isAfter(endOfDay)
        ) {
          continue;
        }

        const workDay = startOfDay.format('DD/MM/YYYY');
        const employeeName =
          cleaning.employee?.personPaper?.person.name || 'Desconhecido';
        const businessStartTime = cleaning.employee?.businessStartTime;

        const shift = getShiftByBusinessStartTime(businessStartTime);

        if (!groupedByShifts[shift][employeeName]) {
          groupedByShifts[shift][employeeName] = {
            'Total de suítes': 0,
            'Dias trabalhados': new Set(),
            'Daily Counts': new Array(
              moment(endDate).diff(moment(startDate), 'days') + 1,
            ).fill(0),
          };
        }

        const employeeData = groupedByShifts[shift][employeeName];
        employeeData['Total de suítes']++;
        employeeData['Dias trabalhados'].add(workDay);

        const dateIndex = moment(workDay, 'DD/MM/YYYY').diff(
          moment(startDate),
          'days',
        );
        if (dateIndex >= 0 && dateIndex < employeeData['Daily Counts'].length) {
          employeeData['Daily Counts'][dateIndex]++;
        }

        totalAllSuitesCleanings++;

        // Verifica se o shift é válido antes de adicionar o funcionário
        if (shift && uniqueEmployeesByShift[shift]) {
          uniqueEmployeesByShift[shift].add(cleaning.employee?.id);
        } else {
          continue;
        }
      }

      // Calcular médias e total de dias trabalhados
      for (const shift of Object.keys(groupedByShifts)) {
        for (const employeeName of Object.keys(groupedByShifts[shift])) {
          const data = groupedByShifts[shift][employeeName];
          const totalDaysWorked = data['Dias trabalhados'].size;
          data['Dias trabalhados'] = totalDaysWorked;
          data['Média por dia'] =
            totalDaysWorked > 0
              ? Number((data['Total de suítes'] / totalDaysWorked).toFixed(1))
              : 0;

          totalAllAverageDailyCleaning += data['Média por dia'];
        }
      }

      if (!inspections || inspections.length === 0) {
        throw new NotFoundException('No inspection data found.');
      }

      const supervisorsPerformance: {
        [key: string]: { name: string; value: number };
      } = {};

      for (const inspection of inspections) {
        const supervisorName =
          inspection.user?.employee?.personPaper?.person.name || 'Desconhecido';
        const totalInspections = 1;

        if (supervisorsPerformance[supervisorName]) {
          supervisorsPerformance[supervisorName].value += totalInspections;
        } else {
          supervisorsPerformance[supervisorName] = {
            name: supervisorName,
            value: totalInspections,
          };
        }
      }

      const performanceArray = Object.values(supervisorsPerformance);

      const supervisorsPerformanceFormatted = {
        categories: performanceArray.map((item) => item.name),
        series: performanceArray.map((item) => item.value),
      };

      const cleaningByDateResults: { date: string; totalCleanings: number }[] =
        [];

      const cleaningsByShiftAndDay: { [key: string]: any } = {
        Manhã: {},
        Tarde: {},
        Noite: {},
      };

      let currentDate = moment.utc(startDate).startOf('day').add(4, 'hours');
      const endMoment = moment.utc(endDate).startOf('day').add(4, 'hours');

      while (currentDate.isBefore(endMoment)) {
        const dateString = currentDate.format('DD/MM/YYYY');
        const dailyCleanings =
          await this.prisma.prismaLocal.apartmentCleaning.findMany({
            where: {
              startDate: {
                gte: currentDate.toDate(),
                lt: currentDate.clone().add(1, 'day').toDate(),
              },
              endDate: {
                not: null,
              },
              reasonEnd: {
                equals: 'COMPLETA',
              },
            },
          });

        cleaningByDateResults.push({
          date: dateString,
          totalCleanings: dailyCleanings.length,
        });

        currentDate = currentDate.add(1, 'day');
      }

      const cleaningByDateCategories = cleaningByDateResults.map(
        (item) => item.date,
      );
      const cleaningByDateSeries = cleaningByDateResults.map(
        (item) => item.totalCleanings,
      );

      const employeeCleaningByShift = {
        categories: cleaningByDateCategories,
        series: [],
      };

      for (const shift of Object.keys(groupedByShifts)) {
        const dailyShiftData = [];

        for (const employeeName of Object.keys(groupedByShifts[shift])) {
          const employeeData = groupedByShifts[shift][employeeName];
          dailyShiftData.push({
            name: employeeName,
            data: employeeData['Daily Counts'],
          });
        }

        employeeCleaningByShift.series.push({
          [shift]: dailyShiftData,
        });
      }

      const bigNumbers = {
        currentDate: {
          totalAllSuitesCleanings: totalAllSuitesCleanings,
          totalAllAverageDailyCleaning: parseFloat(
            totalAllAverageDailyCleaning.toFixed(2),
          ),
          totalAllInspections: inspections.length,
        },
      };

      const employeeReport = {};
      for (const shift of Object.keys(groupedByShifts)) {
        employeeReport[shift] = [];
        for (const employeeName of Object.keys(groupedByShifts[shift])) {
          const data = groupedByShifts[shift][employeeName];
          employeeReport[shift].push({
            employeeName: employeeName,
            totalSuitesCleanings: data['Total de suítes'],
            totalDaysWorked: data['Dias trabalhados'],
            averageDailyCleaning: data['Média por dia'],
          });
        }
      }

      const dayCountMap: { [key: string]: number } = {};

      // Função para remover acentos
      const removeAccents = (str: string) => {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      };

      // Contar ocorrências de cada dia da semana no período
      let currentDates = moment.tz(startDate, timezone);

      while (currentDates.isSameOrBefore(moment.tz(endDate, timezone))) {
        const dayOfWeek = removeAccents(
          currentDates.format('dddd').replace('-feira', ''),
        ); // Remove o sufixo e acentos
        dayCountMap[dayOfWeek] = (dayCountMap[dayOfWeek] || 0) + 1;
        currentDates.add(1, 'days');
      }

      // Agrupar dados
      const uniqueEmployeesByShifts = {
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
        const workDay = removeAccents(
          moment
            .tz(cleaning.startDate, timezone)
            .format('dddd')
            .replace('-feira', ''),
        ); // Remove o sufixo e acentos
        const businessStartTime = cleaning.employee?.businessStartTime;
        if (!businessStartTime) continue;
        const shift = getShiftByBusinessStartTime(businessStartTime);

        if (shift && !excludedShifts.has(shift)) {
          // Inicializa os dados para o turno e dia, se ainda não existirem
          if (!cleaningsByShiftAndDay[shift][workDay]) {
            cleaningsByShiftAndDay[shift][workDay] = { totalCleanings: 0 };
          }

          // Adiciona o ID do funcionário ao conjunto para contar apenas uma vez
          uniqueEmployeesByShifts[shift].add(cleaning.employee.id);
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

      for (const shift in cleaningsByShiftAndDay) {
        let shiftTotalCount = 0;

        for (const day in cleaningsByShiftAndDay[shift]) {
          const dayData = cleaningsByShiftAndDay[shift][day];
          const averageDailyWeekCleaning = (
            dayData.totalCleanings / (dayCountMap[day] || 1)
          ).toFixed(2);
          cleaningsByShiftAndDay[shift][day].averageDailyWeekCleaning =
            +averageDailyWeekCleaning;

          // Acumula a média diária para cada dia da semana
          totals.totalAverageDailyWeekCleaning[day] =
            (totals.totalAverageDailyWeekCleaning[day] || 0) +
            +averageDailyWeekCleaning;

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
          uniqueEmployeesByShifts[shift].size;
        totals.totalRealShiftMaid +=
          cleaningsByShiftAndDay[shift].realShiftMaid;
        cleaningsByShiftAndDay[shift].difference =
          cleaningsByShiftAndDay[shift].realShiftMaid -
          cleaningsByShiftAndDay[shift].idealShiftMaid;
        totals.totalDifference += cleaningsByShiftAndDay[shift].difference;

        // Acumula para totalAllAverageShiftCleaning
        totals.totalAllAverageShiftCleaning +=
          cleaningsByShiftAndDay[shift].totalAverageShiftCleaning;
      }

      // Adiciona totais ao retorno
      cleaningsByShiftAndDay.Totals = {
        totalAverageDailyWeekCleaning: totals.totalAverageDailyWeekCleaning,
        totalIdealShiftMaid: totals.totalIdealShiftMaid,
        totalRealShiftMaid: totals.totalRealShiftMaid,
        totalDifference: totals.totalDifference,
        totalAllAverageShiftCleaning:
          +totals.totalAllAverageShiftCleaning.toFixed(2),
      };

      return {
        Company: 'Lush Lapa',
        BigNumbers: [bigNumbers],
        SupervisorsPerformance: supervisorsPerformanceFormatted,
        ShiftCleaning: {
          categories: Object.keys(groupedByShifts),
          series: Object.values(groupedByShifts).map((shiftData) =>
            Object.values(shiftData).reduce(
              (total, employee) => total + employee['Total de suítes'],
              0,
            ),
          ),
        },
        CleaningByDate: {
          categories: cleaningByDateCategories,
          series: cleaningByDateSeries,
        },
        EmployeeCleaningByShift: employeeCleaningByShift,
        EmployeeReport: employeeReport,
        TeamSizing: cleaningsByShiftAndDay,
      };
    } catch (error) {
      console.error('Erro ao calcular os KPIs:', error);
      throw new BadRequestException();
    }
  }
}

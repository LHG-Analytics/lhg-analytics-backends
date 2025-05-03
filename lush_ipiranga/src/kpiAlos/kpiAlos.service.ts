import { PeriodEnum } from '@client-online';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PrismaService } from '../prisma/prisma.service';
import { KpiAlos } from './entities/kpiAlos.entity';

@Injectable()
export class KpiAlosService {
  constructor(private prisma: PrismaService) {}

  async findAllKpiAlos(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any[]> {
    try {
      const companyId = 1; // Defina o ID da empresa conforme necessário

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        // Para LAST_6_M, subtrair um dia para não incluir a data atual
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      }

      const [allRentalApartments, suiteCategories] = await Promise.all([
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
                'LUSH POP',
                'LUSH HIDRO',
                'LUSH LOUNGE',
                'LUSH SPA',
                'LUSH CINE',
                'LUSH SPLASH',
                'LUSH SPA SPLASH',
                'CASA LUSH',
              ],
            },
          },
        }),
      ]);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      const kpiAlosData = [];
      let totalOccupationTimeSeconds = 0; // Soma de todos os tempos de ocupação
      let totalRentals = 0; // Número total de ocupações

      const categoryTotalsMap = {};

      // Calcula ocupação por categoria
      for (const suiteCategory of suiteCategories) {
        categoryTotalsMap[suiteCategory.id] = {
          totalOccupationTimeSeconds: 0,
          totalRentals: 0,
        };

        for (const rentalApartment of allRentalApartments) {
          if (
            rentalApartment.suiteStates.suite.suiteCategoryId ===
            suiteCategory.id
          ) {
            const suiteCategoryData = categoryTotalsMap[suiteCategory.id];
            const occupationTimeSeconds = this.calculateOccupationTime(
              rentalApartment.checkIn,
              rentalApartment.checkOut,
            );

            suiteCategoryData.totalOccupationTimeSeconds +=
              occupationTimeSeconds;
            suiteCategoryData.totalRentals++;

            // Acumular os valores para cálculo total
            totalOccupationTimeSeconds += occupationTimeSeconds;
            totalRentals++;
          }
        }
      }

      // Inserindo dados e calculando occupationTime
      for (const suiteCategory of suiteCategories) {
        const suiteCategoryData = categoryTotalsMap[suiteCategory.id];
        if (suiteCategoryData.totalRentals === 0) continue;

        const averageOccupationTimeSeconds =
          suiteCategoryData.totalOccupationTimeSeconds /
          suiteCategoryData.totalRentals;
        const averageOccupationTime = this.formatTime(
          averageOccupationTimeSeconds,
        );

        // Calculando occupationTime em segundos
        const occupationTime = suiteCategoryData.totalOccupationTimeSeconds;

        // Inserir no banco de dados
        await this.insertKpiAlos({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          averageOccupationTime,
          occupationTime: this.formatTime(occupationTime), // Convertendo para o formato legível
          period: period || null,
          totalAverageOccupationTime: this.formatTime(
            totalOccupationTimeSeconds / totalRentals,
          ), // Atualizado
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)),
          companyId,
        });

        kpiAlosData.push({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          averageOccupationTime,
          occupationTime: this.formatTime(occupationTime), // Convertendo para o formato legível
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)),
        });
      }

      // Calcular o tempo médio total: totalOccupationTimeSeconds / totalRentals
      const totalAverageOccupationTime = this.formatTime(
        totalOccupationTimeSeconds / totalRentals,
      );

      return [
        {
          kpiAlos: kpiAlosData,
          totalAverageOccupationTime,
        },
      ];
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async insertKpiAlos(data: KpiAlos): Promise<KpiAlos> {
    return this.prisma.prismaOnline.kpiAlos.upsert({
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
      `Início CronJob KpiAlos - últimos 7 dias: ${startTimeLast7Days}`,
    );
    await this.findAllKpiAlos(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.findAllKpiAlos(
      previousStartDateLast7Days,
      previousParsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiAlos - últimos 7 dias: ${endTimeLast7Days}`);

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
      `Início CronJob KpiAlos - últimos 30 dias: ${startTimeLast30Days}`,
    );
    await this.findAllKpiAlos(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.findAllKpiAlos(
      previousStartDateLast30Days,
      previousParsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiAlos - últimos 30 dias: ${endTimeLast30Days}`,
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
      `Início CronJob KpiAlos - últimos 6 meses: ${startTimeLast6Months}`,
    );
    await this.findAllKpiAlos(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.findAllKpiAlos(
      previousStartDateLast6Months,
      previousParsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiAlos - últimos 6 meses: ${endTimeLast6Months}`,
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

  private calculateOccupationTime(checkIn: Date, checkOut: Date): number {
    const checkInTime = new Date(checkIn).getTime();
    const checkOutTime = new Date(checkOut).getTime();
    return (checkOutTime - checkInTime) / 1000; // Tempo em segundos
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

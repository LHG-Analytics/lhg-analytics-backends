import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PeriodEnum } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import {
  KpiTotalRentals,
  KpiTotalRentalsByPeriod,
} from './entities/kpiTotalRental.entity';

type CategoryTotals = {
  totalRentalsApartments: number;
  totalBookings: number;
};

type CategoryResult = {
  suiteCategoryId: number | null;
  suiteCategoryName: string;
  totalRentalsApartments: number;
  totalBookings: number;
  createdDate: Date;
};

@Injectable()
export class KpiTotalRentalsService {
  constructor(private prisma: PrismaService) {}

  async findAllKpiTotalRentals(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<CategoryResult[]> {
    try {
      const companyId = 1;

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (
        period === PeriodEnum.LAST_7_D ||
        period === PeriodEnum.LAST_30_D ||
        period === PeriodEnum.LAST_6_M
      ) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      }

      const [allRentalApartments, suiteCategories, allBookings] =
        await Promise.all([
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

      const kpiTotalRentalsData: CategoryResult[] = [];
      let totalAllRentalsApartments = 0;
      let totalAllBookings = 0;
      const categoryTotalsMap: Record<number, CategoryTotals> = {};

      // Inicializa o mapa de totais por categoria
      for (const suiteCategory of suiteCategories) {
        categoryTotalsMap[suiteCategory.id] = {
          totalRentalsApartments: 0,
          totalBookings: 0,
        };
      }

      // Contabiliza as locações e reservas por categoria
      for (const rentalApartment of allRentalApartments) {
        const suiteCategoryId =
          rentalApartment.suiteStates?.suite?.suiteCategoryId;

        if (!suiteCategoryId || !categoryTotalsMap[suiteCategoryId]) {
          continue;
        }

        categoryTotalsMap[suiteCategoryId].totalRentalsApartments++;
        totalAllRentalsApartments++;

        const bookingsForApartment = allBookings.filter(
          (booking) => booking.rentalApartmentId === rentalApartment.suiteStateId,
        );
        categoryTotalsMap[suiteCategoryId].totalBookings +=
          bookingsForApartment.length;
        totalAllBookings += bookingsForApartment.length;
      }

      // Monta a estrutura de dados para cada categoria
      for (const suiteCategory of suiteCategories) {
        const categoryData = categoryTotalsMap[suiteCategory.id];

        const categoryResult: CategoryResult = {
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          totalRentalsApartments: categoryData.totalRentalsApartments,
          totalBookings: categoryData.totalBookings,
          createdDate: adjustedEndDate,
        };

        kpiTotalRentalsData.push(categoryResult);

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

      // Adiciona o resultado total agregado
      kpiTotalRentalsData.push({
        suiteCategoryId: null,
        suiteCategoryName: 'Total Result',
        totalRentalsApartments: totalAllRentalsApartments,
        totalBookings: totalAllBookings,
        createdDate: adjustedEndDate,
      });

      return kpiTotalRentalsData;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new BadRequestException(
          `Falha ao buscar KpiTotalRentals: ${error.message}`,
        );
      } else {
        throw new BadRequestException(
          'Falha ao buscar KpiTotalRentals: erro desconhecido',
        );
      }
    }
  }

  async insertKpiTotalRentals(data: KpiTotalRentals): Promise<KpiTotalRentals> {
    return this.prisma.prismaOnline.kpiTotalRentals.upsert({
      where: {
        suiteCategoryId_period_createdDate: {
          suiteCategoryId: data.suiteCategoryId,
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

  private async calculateTotalRentalsByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<{ TotalRentalsForThePeriod: Record<string, any>[] }> {
    try {
      const results: Record<string, any> = {};

      let currentDate = new Date(startDate);
      currentDate.setUTCHours(6, 0, 0, 0);

      while (currentDate < endDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(5, 59, 59, 999);
        } else if (period === PeriodEnum.LAST_6_M) {
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(5, 59, 59, 999);
        }

        const rentals = await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: currentDate,
              lte: nextDate,
            },
            endOccupationType: 'FINALIZADA',
          },
        });

        const totalRentalsForCurrentPeriod = rentals.length;

        const dateKey = currentDate.toISOString().split('T')[0];
        results[dateKey] = {
          totalRentalsApartments: totalRentalsForCurrentPeriod,
        };

        let createdDateWithTime: Date;
        if (period === PeriodEnum.LAST_6_M) {
          createdDateWithTime = new Date(currentDate);
          createdDateWithTime.setDate(createdDateWithTime.getDate() - 1);
          createdDateWithTime.setUTCHours(5, 59, 59, 999);
        } else {
          createdDateWithTime = new Date(currentDate);
          createdDateWithTime.setUTCHours(5, 59, 59, 999);
        }

        await this.insertKpiTotalRentalsByPeriod({
          totalAllRentalsApartments: totalRentalsForCurrentPeriod,
          period: period,
          createdDate: createdDateWithTime,
          companyId: 1,
        });

        currentDate = new Date(nextDate);
      }

      const totalRentalsForThePeriod = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        TotalRentalsForThePeriod: totalRentalsForThePeriod,
      };
    } catch (error) {
      console.error(
        'Erro ao calcular o total de apartamentos alugados por período:',
        error,
      );
      let errorMessage =
        'Falha ao calcular o total de apartamentos alugados por período.';
      if (error instanceof Error) {
        errorMessage += ` ${error.message}`;
      }
      throw new BadRequestException(errorMessage);
    }
  }

  async insertKpiTotalRentalsByPeriod(
    data: KpiTotalRentalsByPeriod,
  ): Promise<KpiTotalRentalsByPeriod> {
    return this.prisma.prismaOnline.kpiTotalRentalsByPeriod.upsert({
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
    const timezone = 'America/Sao_Paulo';
    const currentDate = moment().tz(timezone).toDate();

    // ---- Últimos 7 dias ----
    const endDateLast7Days = new Date(currentDate);
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

    const previousParsedEndDateLast7Days = parsedStartDateLast7Days;
    const previousStartDateLast7Days = new Date(previousParsedEndDateLast7Days);
    previousStartDateLast7Days.setDate(previousStartDateLast7Days.getDate() - 7);
    previousStartDateLast7Days.setHours(6, 0, 0, 0);

    const {
      startDate: previousParsedStartDateLast7Days,
      endDate: previousParsedEndDateLast7DaysParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast7Days),
      this.formatDateString(previousParsedEndDateLast7Days),
    );

    const startTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiTotalRentals - últimos 7 dias: ${startTimeLast7Days}`,
    );

    await this.findAllKpiTotalRentals(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
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

    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiTotalRentals - últimos 7 dias: ${endTimeLast7Days}`,
    );

    // ---- Últimos 30 dias ----
    const endDateLast30Days = new Date(currentDate);
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

    const previousParsedEndDateLast30Days = parsedStartDateLast30Days;
    const previousStartDateLast30Days = new Date(previousParsedEndDateLast30Days);
    previousStartDateLast30Days.setDate(previousStartDateLast30Days.getDate() - 30);
    previousStartDateLast30Days.setHours(6, 0, 0, 0);

    const {
      startDate: previousParsedStartDateLast30Days,
      endDate: previousParsedEndDateLast30DaysParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast30Days),
      this.formatDateString(previousParsedEndDateLast30Days),
    );

    const startTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiTotalRentals - últimos 30 dias: ${startTimeLast30Days}`,
    );

    await this.findAllKpiTotalRentals(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
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

    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiTotalRentals - últimos 30 dias: ${endTimeLast30Days}`,
    );

    // ---- Últimos 6 meses ----
    const endDateLast6Months = new Date(currentDate);
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

    const previousParsedEndDateLast6Months = parsedStartDateLast6Months;
    const previousStartDateLast6Months = new Date(previousParsedEndDateLast6Months);
    previousStartDateLast6Months.setMonth(previousStartDateLast6Months.getMonth() - 6);
    previousStartDateLast6Months.setHours(6, 0, 0, 0);

    const {
      startDate: previousParsedStartDateLast6Months,
      endDate: previousParsedEndDateLast6MonthsParsed,
    } = this.parseDateString(
      this.formatDateString(previousStartDateLast6Months),
      this.formatDateString(previousParsedEndDateLast6Months),
    );

    const startTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiTotalRentals - últimos 6 meses: ${startTimeLast6Months}`,
    );

    await this.findAllKpiTotalRentals(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
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

    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiTotalRentals - últimos 6 meses: ${endTimeLast6Months}`,
    );
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

  private formatDateString(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
  }
}
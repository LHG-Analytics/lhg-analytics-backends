import { PeriodEnum, Prisma } from '@client-online';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PrismaService } from '../prisma/prisma.service';
import { KpiTrevpar, KpiTrevparByPeriod } from './entities/kpiTrevpar.entity';

type CategoryTotals = {
  totalRental: Prisma.Decimal;
  totalSale: Prisma.Decimal;
  totalRevenue: Prisma.Decimal;
  categoryTotalRentals: number;
  giro: number;
};

type KpiTrevparCreateInput = {
  suiteCategoryId: number;
  suiteCategoryName: string;
  trevpar: Prisma.Decimal;
  totalTrevpar: Prisma.Decimal;
  companyId: number;
  createdDate: Date;
  period: PeriodEnum | null; // corrigido
};

type KpiTrevparByPeriodCreateInput = {
  totalTrevpar: Prisma.Decimal;
  createdDate: Date;
  period: PeriodEnum | null; // corrigido
  companyId: number;
};

@Injectable()
export class KpiTrevparService {
  constructor(private prisma: PrismaService) {}

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private toDecimal(n: number | Prisma.Decimal | null | undefined): Prisma.Decimal {
    if (n instanceof Prisma.Decimal) return n;
    return new Prisma.Decimal(n ?? 0);
  }

  async findAllKpiTrevpar(startDate: Date, endDate: Date, period?: PeriodEnum) {
    try {
      const companyId = 1;

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      } else if (period === PeriodEnum.LAST_6_M) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      } else if (period === PeriodEnum.ESTE_MES) {
        // Para ESTE_MES, não ajustar - já vem correto do handleCron
        // A data final já é D+1 às 05:59:59
      }

      // Obter dados de locações e categorias de suíte
      const [rentalApartments, suiteCategories] = await Promise.all([
        this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: { gte: startDate, lte: endDate },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            suiteStates: {
              include: {
                suite: { include: { suiteCategories: true } },
              },
            },
            saleLease: true,
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
          include: { suites: true },
        }),
      ]);

      const stockOutIds = rentalApartments
        .map((r) => r.saleLease?.stockOutId)
        .filter((id): id is number => typeof id === 'number');

      const stockOutSales = await this.prisma.prismaLocal.stockOut.findMany({
        where: { id: { in: stockOutIds } },
        include: {
          stockOutItem: {
            where: { canceled: null },
            select: { priceSale: true, quantity: true },
          },
          sale: { select: { discount: true } },
        },
      });

      const stockOutSalesMap: Record<number, (typeof stockOutSales)[number]> = Object.fromEntries(
        stockOutSales.map((s) => [s.id, s]),
      );

      // Mapa para armazenar os totais por categoria
      const categoryTotalsMap: Record<number, CategoryTotals> = {};
      let totalRevenue = new Prisma.Decimal(0);
      let totalSuites = 0;

      for (const suiteCategory of suiteCategories) {
        categoryTotalsMap[suiteCategory.id] = {
          totalRental: new Prisma.Decimal(0),
          totalSale: new Prisma.Decimal(0),
          totalRevenue: new Prisma.Decimal(0),
          categoryTotalRentals: 0,
          giro: 0,
        };

        const rentalsInCategory = rentalApartments.filter(
          (r) => r.suiteStates.suite.suiteCategoryId === suiteCategory.id,
        );

        const rentalsCount = rentalsInCategory.length;
        const suitesInCategoryCount = suiteCategory.suites.length;

        let giro = 0;
        if (suitesInCategoryCount > 0) {
          const days = (endDate.getTime() - startDate.getTime()) / 86400000;
          giro = rentalsCount / suitesInCategoryCount / days;
        }

        for (const rental of rentalsInCategory) {
          const permanenceValueLiquid = this.toDecimal(rental.permanenceValueLiquid);

          const stockOutSaleLease = stockOutSalesMap[rental.saleLease?.stockOutId ?? -1];
          let priceSale = new Prisma.Decimal(0);

          if (stockOutSaleLease) {
            let acc = new Prisma.Decimal(0);
            for (const it of stockOutSaleLease.stockOutItem) {
              const unit = this.toDecimal(it.priceSale);
              const qty = this.toDecimal(it.quantity);
              acc = acc.plus(unit.times(qty));
            }
            const discount = this.toDecimal(stockOutSaleLease.sale?.discount);
            priceSale = acc.minus(discount);
          }

          const entry = categoryTotalsMap[suiteCategory.id];
          entry.categoryTotalRentals += 1;
          entry.totalRental = entry.totalRental.plus(permanenceValueLiquid);
          entry.totalSale = entry.totalSale.plus(priceSale);
          entry.totalRevenue = entry.totalRevenue.plus(permanenceValueLiquid).plus(priceSale);

          totalRevenue = totalRevenue.plus(permanenceValueLiquid).plus(priceSale);
        }

        categoryTotalsMap[suiteCategory.id].giro = giro;
        totalSuites += suitesInCategoryCount;
      }

      // Inserir e montar retorno
      const kpiTrevparResults: Array<{
        suiteCategoryId: number;
        suiteCategoryName: string;
        trevpar: string;
        createdDate: Date;
      }> = [];

      const daysAll = (endDate.getTime() - startDate.getTime()) / 86400000;
      const totalTrevparGlobal =
        totalSuites > 0 && daysAll > 0
          ? totalRevenue.dividedBy(totalSuites).dividedBy(new Prisma.Decimal(daysAll))
          : new Prisma.Decimal(0);

      for (const suiteCategory of suiteCategories) {
        const data = categoryTotalsMap[suiteCategory.id];
        const ticketAverageRental =
          data.categoryTotalRentals > 0
            ? data.totalRental.dividedBy(data.categoryTotalRentals).toNumber()
            : 0;
        const ticketAverageSale =
          data.categoryTotalRentals > 0
            ? data.totalSale.dividedBy(data.categoryTotalRentals).toNumber()
            : 0;

        const totalTicketAverage = ticketAverageRental + ticketAverageSale;
        const trevpar = data.giro * totalTicketAverage;

        await this.insertKpiTrevpar({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          trevpar: new Prisma.Decimal(trevpar),
          totalTrevpar: new Prisma.Decimal(totalTrevparGlobal),
          companyId: companyId,
          createdDate: adjustedEndDate,
          period: period ?? null, // corrigido
        });

        kpiTrevparResults.push({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          trevpar: this.formatCurrency(trevpar),
          createdDate: adjustedEndDate,
        });
      }

      return {
        kpiTrevpar: kpiTrevparResults,
        totalResult: {
          totalTrevpar: this.formatCurrency(totalTrevparGlobal.toNumber()),
          createdDate: adjustedEndDate,
        },
      };
    } catch (error: any) {
      console.error('Erro ao calcular o KPI Trevpar:', error);
      throw new BadRequestException(
        `Falha ao calcular KPI Trevpar: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async insertKpiTrevpar(data: KpiTrevparCreateInput): Promise<KpiTrevpar> {
    return this.prisma.prismaOnline.kpiTrevpar.upsert({
      where: {
        suiteCategoryId_period_createdDate: {
          suiteCategoryId: data.suiteCategoryId,
          period: data.period as PeriodEnum,
          createdDate: data.createdDate,
        },
      },
      create: { ...data },
      update: { ...data },
    });
  }

  private async calculateTotalTrevparByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: Record<string, { totalTrevpar: string }> = {};
      let currentDate = new Date(startDate);
      currentDate.setHours(6, 0, 0, 0);

      while (currentDate < endDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setHours(5, 59, 59, 999);
        } else if (period === PeriodEnum.LAST_6_M) {
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setHours(5, 59, 59, 999);
        }

        const [rentalApartments, suiteCategories] = await Promise.all([
          this.prisma.prismaLocal.rentalApartment.findMany({
            where: {
              checkIn: { gte: currentDate, lte: nextDate },
              endOccupationType: 'FINALIZADA',
            },
            include: {
              suiteStates: {
                include: { suite: { include: { suiteCategories: true } } },
              },
              saleLease: true,
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
            include: { suites: true },
          }),
        ]);

        const stockOutIds = rentalApartments
          .map((r) => r.saleLease?.stockOutId)
          .filter((id): id is number => typeof id === 'number');

        const stockOutSales = await this.prisma.prismaLocal.stockOut.findMany({
          where: { id: { in: stockOutIds } },
          include: {
            stockOutItem: {
              where: { canceled: null },
              select: { priceSale: true, quantity: true },
            },
            sale: { select: { discount: true } },
          },
        });

        const stockOutSalesMap: Record<number, (typeof stockOutSales)[number]> = Object.fromEntries(
          stockOutSales.map((s) => [s.id, s]),
        );

        let totalRevenue = new Prisma.Decimal(0);
        let totalSuites = 0;
        const totalRentalsCount = rentalApartments.length;

        for (const suiteCategory of suiteCategories) {
          const suitesInCategoryCount = suiteCategory.suites.length;
          totalSuites += suitesInCategoryCount;

          const rentalsInCategory = rentalApartments.filter(
            (r) => r.suiteStates.suite.suiteCategoryId === suiteCategory.id,
          );

          for (const rental of rentalsInCategory) {
            const stockOutSaleLease = stockOutSalesMap[rental.saleLease?.stockOutId ?? -1];
            let priceSale = new Prisma.Decimal(0);

            if (stockOutSaleLease) {
              let acc = new Prisma.Decimal(0);
              for (const it of stockOutSaleLease.stockOutItem) {
                const unit = this.toDecimal(it.priceSale);
                const qty = this.toDecimal(it.quantity);
                acc = acc.plus(unit.times(qty));
              }
              const discount = this.toDecimal(stockOutSaleLease.sale?.discount);
              priceSale = acc.minus(discount);
            }

            const permanenceValueLiquid = this.toDecimal(rental.permanenceValueLiquid);
            totalRevenue = totalRevenue.plus(permanenceValueLiquid).plus(priceSale);
          }
        }

        const periodDays = (nextDate.getTime() - currentDate.getTime()) / 86400000;
        const giro =
          totalSuites > 0 && periodDays > 0 ? totalRentalsCount / (totalSuites * periodDays) : 0;
        const ticketAverage =
          totalRentalsCount > 0 ? totalRevenue.dividedBy(totalRentalsCount).toNumber() : 0;

        const totalTrevpar = giro * ticketAverage;
        const dateKey = currentDate.toISOString().split('T')[0];
        results[dateKey] = { totalTrevpar: this.formatCurrency(totalTrevpar) };

        let createdDateWithTime: Date;
        if (period === PeriodEnum.LAST_6_M) {
          createdDateWithTime = new Date(currentDate);
          createdDateWithTime.setDate(createdDateWithTime.getDate() - 1);
          createdDateWithTime.setHours(5, 59, 59, 999);
        } else {
          createdDateWithTime = new Date(currentDate);
          createdDateWithTime.setHours(5, 59, 59, 999);
        }

        await this.insertKpiTrevparByPeriod({
          totalTrevpar: new Prisma.Decimal(totalTrevpar),
          createdDate: createdDateWithTime,
          period,
          companyId: 1,
        });

        currentDate = new Date(nextDate);
      }

      const totalTrevparForThePeriod = Object.entries(results).map(([date, val]) => ({
        [date]: val,
      }));

      return { TotalTrevparForThePeriod: totalTrevparForThePeriod };
    } catch (error: any) {
      console.error('Erro ao calcular o total de TrevPAR por período:', error);
      throw new BadRequestException(
        `Failed to calculate total TrevPAR by period: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async insertKpiTrevparByPeriod(data: KpiTrevparByPeriodCreateInput): Promise<KpiTrevparByPeriod> {
    return this.prisma.prismaOnline.kpiTrevparByPeriod.upsert({
      where: {
        period_createdDate: {
          period: data.period as PeriodEnum,
          createdDate: data.createdDate,
        },
      },
      create: { ...data },
      update: { ...data },
    });
  }

  @Cron('0 0 * * *', { disabled: true })
  async handleCron() {
    const timezone = 'America/Sao_Paulo';
    const currentDate = moment().tz(timezone).toDate();

    // Últimos 7 dias
    const endDateLast7Days = new Date(currentDate);
    endDateLast7Days.setHours(5, 59, 59, 999);
    const startDateLast7Days = new Date(currentDate);
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 7);
    startDateLast7Days.setHours(6, 0, 0, 0);

    const { startDate: parsedStartDateLast7Days, endDate: parsedEndDateLast7Days } =
      this.parseDateString(
        this.formatDateString(startDateLast7Days),
        this.formatDateString(endDateLast7Days),
      );

    await this.findAllKpiTrevpar(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateTotalTrevparByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    // Últimos 30 dias
    const endDateLast30Days = new Date(currentDate);
    endDateLast30Days.setHours(5, 59, 59, 999);
    const startDateLast30Days = new Date(currentDate);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30);
    startDateLast30Days.setHours(6, 0, 0, 0);

    const { startDate: parsedStartDateLast30Days, endDate: parsedEndDateLast30Days } =
      this.parseDateString(
        this.formatDateString(startDateLast30Days),
        this.formatDateString(endDateLast30Days),
      );

    await this.findAllKpiTrevpar(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalTrevparByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );

    // Últimos 6 meses
    const endDateLast6Months = new Date(currentDate);
    endDateLast6Months.setHours(5, 59, 59, 999);
    const startDateLast6Months = new Date(currentDate);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6);
    startDateLast6Months.setHours(6, 0, 0, 0);

    const { startDate: parsedStartDateLast6Months, endDate: parsedEndDateLast6Months } =
      this.parseDateString(
        this.formatDateString(startDateLast6Months),
        this.formatDateString(endDateLast6Months),
      );

    await this.findAllKpiTrevpar(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalTrevparByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );

    // ESTE_MES - Do dia 1º do mês atual (às 06:00) até hoje (às 05:59 do D+1)
    const endDateEsteMes = new Date(currentDate);
    endDateEsteMes.setDate(endDateEsteMes.getDate() + 1); // D+1
    endDateEsteMes.setHours(5, 59, 59, 999); // 05:59:59 do D+1

    const startDateEsteMes = moment().tz(timezone).startOf('month').toDate();
    startDateEsteMes.setHours(6, 0, 0, 0); // 06:00 do dia 1º

    // Parse as datas para o formato desejado
    const { startDate: parsedStartDateEsteMes, endDate: parsedEndDateEsteMes } =
      this.parseDateString(
        this.formatDateString(startDateEsteMes),
        this.formatDateString(endDateEsteMes),
      );

    // Log para verificar as datas
    const startTimeEsteMes = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Início CronJob KpiTrevpar - este mês: ${startTimeEsteMes}`);

    // Chamar apenas a função findAllKpiTrevpar para o período ESTE_MES
    await this.findAllKpiTrevpar(
      parsedStartDateEsteMes,
      parsedEndDateEsteMes,
      PeriodEnum.ESTE_MES,
    );
    const endTimeEsteMes = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiTrevpar - este mês: ${endTimeEsteMes}`);
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

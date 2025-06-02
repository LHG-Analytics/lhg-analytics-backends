import { PeriodEnum, Prisma } from '@client-online';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PrismaService } from '../prisma/prisma.service';
import { KpiTrevpar, KpiTrevparByPeriod } from './entities/kpiTrevpar.entity';

@Injectable()
export class KpiTrevparService {
  constructor(private prisma: PrismaService) {}

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  async findAllKpiTrevpar(startDate: Date, endDate: Date, period?: PeriodEnum) {
    try {
      const companyId = 1;

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        // Para LAST_6_M, subtrair um dia para não incluir a data atual
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      }

      // Obter dados de locações e categorias de suíte
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
            saleLease: true,
          },
        }),
        this.prisma.prismaLocal.suiteCategory.findMany({
          where: {
            description: {
              in: ['CLUB', 'SUBLIME', 'RELAX', 'GLAM', 'HIDRO', 'A'],
            },
          },
          include: {
            suites: true,
          },
        }),
      ]);

      const stockOutIds = rentalApartments
        .map((rental) => rental.saleLease?.stockOutId)
        .filter((id): id is number => typeof id === 'number');

      const stockOutSales = await this.prisma.prismaLocal.stockOut.findMany({
        where: { id: { in: stockOutIds } },
        include: {
          stockOutItem: {
            where: { canceled: null },
            select: { priceSale: true, quantity: true },
          },
          sale: {
            select: { discount: true },
          },
        },
      });

      const stockOutSalesMap = Object.fromEntries(
        stockOutSales.map((stockOut) => [stockOut.id, stockOut]),
      );

      // Inicializar um mapa para armazenar os totais por categoria
      const categoryTotalsMap = {};
      let totalRevenue = new Prisma.Decimal(0);
      let totalSuites = 0;

      // Primeiro loop: acumular os valores por categoria
      for (const suiteCategory of suiteCategories) {
        categoryTotalsMap[suiteCategory.id] = {
          totalRental: new Prisma.Decimal(0),
          totalSale: new Prisma.Decimal(0),
          totalRevenue: new Prisma.Decimal(0),
          categoryTotalRentals: 0,
          giro: 0,
        };

        const rentalApartmentsInCategory = rentalApartments.filter(
          (rentalApartment) =>
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

        // Acumular receita de locações e vendas
        for (const rentalApartment of rentalApartmentsInCategory) {
          const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
            ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
            : new Prisma.Decimal(0);

          const stockOutSaleLease =
            stockOutSalesMap[rentalApartment.saleLease?.stockOutId];
          let priceSale = new Prisma.Decimal(0);
          let discountSale = new Prisma.Decimal(0);

          if (stockOutSaleLease) {
            priceSale = stockOutSaleLease.stockOutItem.reduce(
              (acc, item) =>
                acc.plus(
                  new Prisma.Decimal(item.priceSale).times(
                    new Prisma.Decimal(item.quantity),
                  ),
                ),
              new Prisma.Decimal(0),
            );
            discountSale = stockOutSaleLease.sale?.discount
              ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
              : new Prisma.Decimal(0);
            priceSale = priceSale.minus(discountSale);
          }

          // Acumular valores
          categoryTotalsMap[suiteCategory.id].categoryTotalRentals++;
          categoryTotalsMap[suiteCategory.id].totalRental = categoryTotalsMap[
            suiteCategory.id
          ].totalRental.plus(permanenceValueLiquid);
          categoryTotalsMap[suiteCategory.id].totalSale =
            categoryTotalsMap[suiteCategory.id].totalSale.plus(priceSale);
          categoryTotalsMap[suiteCategory.id].totalRevenue = categoryTotalsMap[
            suiteCategory.id
          ].totalRevenue
            .plus(permanenceValueLiquid)
            .plus(priceSale);

          totalRevenue = totalRevenue
            .plus(permanenceValueLiquid)
            .plus(priceSale);
        }

        categoryTotalsMap[suiteCategory.id].giro = giro;
        totalSuites += suitesInCategoryCount;
      }

      // Inserir todos os dados acumulados no banco
      const kpiTrevparResults = [];
      for (const suiteCategory of suiteCategories) {
        const categoryData = categoryTotalsMap[suiteCategory.id];
        const ticketAverageRental =
          categoryData.categoryTotalRentals > 0
            ? categoryData.totalRental
                .dividedBy(categoryData.categoryTotalRentals)
                .toNumber()
            : 0;

        const ticketAverageSale =
          categoryData.categoryTotalRentals > 0
            ? categoryData.totalSale
                .dividedBy(categoryData.categoryTotalRentals)
                .toNumber()
            : 0;

        const totalTicketAverage = ticketAverageRental + ticketAverageSale;
        const trevpar = categoryData.giro * totalTicketAverage;

        const daysTimeInSeconds =
          (endDate.getTime() - startDate.getTime()) / 1000;
        const days = daysTimeInSeconds / 86400;
        const totalTrevparGlobal = totalRevenue
          .dividedBy(totalSuites)
          .dividedBy(new Prisma.Decimal(days));

        // Inserir os dados no banco
        await this.insertKpiTrevpar({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          trevpar: new Prisma.Decimal(trevpar),
          totalTrevpar: new Prisma.Decimal(totalTrevparGlobal),
          companyId,
          createdDate: adjustedEndDate,
          period,
        });

        kpiTrevparResults.push({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          trevpar: this.formatCurrency(trevpar),
          createdDate: adjustedEndDate,
        });
      }

      // Calcular o totalTrevpar global após o loop
      const daysTimeInSeconds =
        (endDate.getTime() - startDate.getTime()) / 1000;
      const days = daysTimeInSeconds / 86400;
      const totalTrevparGlobal = totalRevenue
        .dividedBy(totalSuites)
        .dividedBy(new Prisma.Decimal(days));

      return {
        kpiTrevpar: kpiTrevparResults,
        totalResult: {
          totalTrevpar: this.formatCurrency(totalTrevparGlobal.toNumber()),
          createdDate: adjustedEndDate,
        },
      };
    } catch (error) {
      console.error('Erro ao calcular o KPI Trevpar:', error);
      throw new BadRequestException(
        `Falha ao calcular KPI Trevpar: ${error.message}`,
      );
    }
  }

  // Método para inserir ou atualizar o kpiTrevpar sem duplicação
  async insertKpiTrevpar(data: KpiTrevpar): Promise<KpiTrevpar> {
    return this.prisma.prismaOnline.kpiTrevpar.upsert({
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

  private async calculateTotalTrevparByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazena resultados
      let currentDate = new Date(startDate);
      currentDate.setHours(6, 0, 0, 0); // Início do dia contábil às 06:00:00

      while (currentDate < endDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          // Iteração diária para períodos de 7 e 30 dias
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setHours(5, 59, 59, 999);
        } else if (period === PeriodEnum.LAST_6_M) {
          // Iteração mensal para LAST_6_M
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setHours(5, 59, 59, 999);
        }

        // Obter dados de rentalApartment e suiteCategory
        const [rentalApartments, suiteCategories] = await Promise.all([
          this.prisma.prismaLocal.rentalApartment.findMany({
            where: {
              checkIn: { gte: currentDate, lte: nextDate },
              endOccupationType: 'FINALIZADA',
            },
            include: {
              suiteStates: {
                include: {
                  suite: {
                    include: { suiteCategories: true },
                  },
                },
              },
              saleLease: true,
            },
          }),
          this.prisma.prismaLocal.suiteCategory.findMany({
            where: {
              description: {
                in: ['CLUB', 'SUBLIME', 'RELAX', 'GLAM', 'HIDRO', 'A'],
              },
            },
            include: { suites: true },
          }),
        ]);

        const stockOutIds = rentalApartments
          .map((rental) => rental.saleLease?.stockOutId)
          .filter((id): id is number => typeof id === 'number');

        const stockOutSales = await this.prisma.prismaLocal.stockOut.findMany({
          where: { id: { in: stockOutIds } },
          include: {
            stockOutItem: {
              where: { canceled: null },
              select: { priceSale: true, quantity: true },
            },
            sale: {
              select: { discount: true },
            },
          },
        });

        const stockOutSalesMap = Object.fromEntries(
          stockOutSales.map((stockOut) => [stockOut.id, stockOut]),
        );

        // Inicializar variáveis para TrevPAR
        let totalRevenue = new Prisma.Decimal(0);
        let totalSuites = 0;
        let totalRentalsCount = rentalApartments.length;

        // Calcular receita e unidades disponíveis
        for (const suiteCategory of suiteCategories) {
          const suitesInCategoryCount = suiteCategory.suites.length;
          totalSuites += suitesInCategoryCount;

          const rentalsInCategory = rentalApartments.filter(
            (rental) =>
              rental.suiteStates.suite.suiteCategoryId === suiteCategory.id,
          );

          for (const rental of rentalsInCategory) {
            const stockOutSaleLease =
              stockOutSalesMap[rental.saleLease?.stockOutId];
            let priceSale = new Prisma.Decimal(0);
            let discountSale = new Prisma.Decimal(0);

            if (stockOutSaleLease) {
              priceSale = stockOutSaleLease.stockOutItem.reduce(
                (acc, item) =>
                  acc.plus(
                    new Prisma.Decimal(item.priceSale).times(
                      new Prisma.Decimal(item.quantity),
                    ),
                  ),
                new Prisma.Decimal(0),
              );
              discountSale = stockOutSaleLease.sale?.discount
                ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
                : new Prisma.Decimal(0);
              priceSale = priceSale.minus(discountSale);
            }

            totalRevenue = totalRevenue
              .plus(
                rental.permanenceValueLiquid
                  ? new Prisma.Decimal(rental.permanenceValueLiquid)
                  : new Prisma.Decimal(0),
              )
              .plus(priceSale);
          }
        }

        // Calcular giro e ticket médio
        const periodDays =
          (nextDate.getTime() - currentDate.getTime()) / 86400000;
        const giro = totalRentalsCount / (totalSuites * periodDays);
        const ticketAverage =
          totalRentalsCount > 0
            ? totalRevenue.dividedBy(totalRentalsCount).toNumber()
            : 0;

        // Calcular TrevPAR e adicionar ao resultado
        const totalTrevpar = giro * ticketAverage;
        const dateKey = currentDate.toISOString().split('T')[0];
        results[dateKey] = { totalTrevpar: this.formatCurrency(totalTrevpar) };

        let createdDateWithTime;
        if (period === 'LAST_6_M') {
          // Cria uma nova instância de Date, subtraindo 1 dia de currentDate
          createdDateWithTime = new Date(currentDate); // Cria uma nova instância de Date
          createdDateWithTime.setDate(createdDateWithTime.getDate() - 1); // Remove 1 dia
          createdDateWithTime.setHours(5, 59, 59, 999); // Define a hora
        } else {
          createdDateWithTime = new Date(currentDate); // Cria uma nova instância de Date
          createdDateWithTime.setHours(5, 59, 59, 999);
        }

        await this.insertKpiTrevparByPeriod({
          totalTrevpar: new Prisma.Decimal(totalTrevpar),
          createdDate: createdDateWithTime, // Usa a nova data com a hora correta
          period,
          companyId: 1,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar resultado final
      const totalTrevparForThePeriod = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        TotalTrevparForThePeriod: totalTrevparForThePeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular o total de TrevPAR por período:', error);
      throw new BadRequestException(
        `Failed to calculate total TrevPAR by period: ${error.message}`,
      );
    }
  }

  async insertKpiTrevparByPeriod(
    data: KpiTrevparByPeriod,
  ): Promise<KpiTrevparByPeriod> {
    return this.prisma.prismaOnline.kpiTrevparByPeriod.upsert({
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
    const now = moment().tz(timezone);
    const formattedTime = now.format('HH:mm:ss');
    const formattedDate = now.format('DD-MM-YYYY');

    // Últimos 7 dias
    const endDateLast7Days = currentDate;
    endDateLast7Days.setHours(23, 59, 59, 999);

    const startDateLast7Days = new Date(currentDate);
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 7);
    startDateLast7Days.setHours(0, 0, 0, 0);

    const {
      startDate: parsedStartDateLast7Days,
      endDate: parsedEndDateLast7Days,
    } = this.parseDateString(
      this.formatDateString(startDateLast7Days),
      this.formatDateString(endDateLast7Days),
    );

    const startTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiTrevpar - últimos 7 dias: ${startTimeLast7Days}`,
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
    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiTrevpar - últimos 7 dias: ${endTimeLast7Days}`,
    );

    // Últimos 30 dias
    const endDateLast30Days = currentDate;
    endDateLast30Days.setHours(23, 59, 59, 999);

    const startDateLast30Days = new Date(currentDate);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30);
    startDateLast30Days.setHours(0, 0, 0, 0);

    const {
      startDate: parsedStartDateLast30Days,
      endDate: parsedEndDateLast30Days,
    } = this.parseDateString(
      this.formatDateString(startDateLast30Days),
      this.formatDateString(endDateLast30Days),
    );

    const startTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiTrevpar - últimos 30 dias: ${startTimeLast30Days}`,
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
    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiTrevpar - últimos 30 dias: ${endTimeLast30Days}`,
    );

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = currentDate;
    endDateLast6Months.setHours(23, 59, 59, 999);

    const startDateLast6Months = new Date(currentDate);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6);
    startDateLast6Months.setHours(0, 0, 0, 0);

    const {
      startDate: parsedStartDateLast6Months,
      endDate: parsedEndDateLast6Months,
    } = this.parseDateString(
      this.formatDateString(startDateLast6Months),
      this.formatDateString(endDateLast6Months),
    );

    const startTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiTrevpar - últimos 6 meses: ${startTimeLast6Months}`,
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
    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiTrevpar - últimos 6 meses: ${endTimeLast6Months}`,
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

    parsedStartDate.setUTCHours(0, 0, 0, 0);
    parsedEndDate.setUTCHours(23, 59, 59, 999);

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }
}

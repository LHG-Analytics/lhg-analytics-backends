import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PeriodEnum, Prisma } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import { KpiTicketAverage, KpiTicketAverageByPeriod } from './entities/kpiTicketAverage.entity';

@Injectable()
export class KpiTicketAverageService {
  constructor(private prisma: PrismaService) {}

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private async calculateTotalSaleDirect(startDate: Date, endDate: Date): Promise<Prisma.Decimal> {
    const stockOutItems = await this.prisma.prismaLocal.stockOutItem.findMany({
      where: {
        stockOuts: {
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        canceled: null,
        typePriceSale: {
          not: null,
        },
      },
      include: {
        stockOuts: {
          include: {
            saleDirect: true,
            sale: {
              select: {
                discount: true,
              },
            },
          },
        },
      },
    });

    return stockOutItems.reduce((total, item) => {
      const stockOut = item.stockOuts;
      const discountSale = stockOut.sale?.discount
        ? new Prisma.Decimal(stockOut.sale.discount)
        : new Prisma.Decimal(0);
      const itemTotal = new Prisma.Decimal(item.priceSale).times(new Prisma.Decimal(item.quantity));

      if (stockOut && stockOut.saleDirect && item.stockOutId === stockOut.saleDirect.stockOutId) {
        return total.plus(itemTotal.minus(discountSale));
      }
      return total;
    }, new Prisma.Decimal(0));
  }

  // Lógica para ajustar as datas com os horários
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

  async findAllKpiTicketAverage(startDate: Date, endDate: Date, period?: PeriodEnum): Promise<any> {
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
        // Para ESTE_MES, não ajustar - já vem correto do handleCron
        // A data final já é D+1 às 05:59:59
      }

      const [allRentalApartments, suiteCategories, totalSaleDirect] = await Promise.all([
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
            saleLease: {
              include: {
                stockOut: {
                  include: {
                    stockOutItem: {
                      where: { canceled: null },
                      select: { priceSale: true, quantity: true },
                    },
                    sale: { select: { discount: true } },
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
        this.calculateTotalSaleDirect(startDate, endDate),
      ]);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      const kpiTicketAverageData = [];
      let totalSale = new Prisma.Decimal(0);
      let totalRental = new Prisma.Decimal(0);
      let totalRentals = 0;

      // Tipos auxiliares
      type CategoryTotals = {
        categoryTotalSale: Prisma.Decimal;
        categoryTotalRental: Prisma.Decimal;
        categoryTotalRentals: number;
      };

      const categoryTotalsMap: Record<number, CategoryTotals> = {};

      for (const suiteCategory of suiteCategories) {
        categoryTotalsMap[suiteCategory.id] = {
          categoryTotalSale: new Prisma.Decimal(0),
          categoryTotalRental: new Prisma.Decimal(0),
          categoryTotalRentals: 0,
        };

        for (const rentalApartment of allRentalApartments) {
          if (rentalApartment.suiteStates.suite.suiteCategoryId === suiteCategory.id) {
            const suiteCategoryData = categoryTotalsMap[suiteCategory.id];

            const saleLease = rentalApartment.saleLease;
            let priceSale = new Prisma.Decimal(0);
            let discountSale = new Prisma.Decimal(0);

            if (saleLease && saleLease.stockOut) {
              const stockOutItems = saleLease.stockOut.stockOutItem;

              priceSale = stockOutItems.reduce((acc, item) => {
                return acc.plus(
                  new Prisma.Decimal(item.priceSale).times(new Prisma.Decimal(item.quantity)),
                );
              }, new Prisma.Decimal(0));

              discountSale = saleLease.stockOut.sale?.discount
                ? new Prisma.Decimal(saleLease.stockOut.sale.discount)
                : new Prisma.Decimal(0);
              priceSale = priceSale.minus(discountSale);
            }

            const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
              ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
              : new Prisma.Decimal(0);

            const totalValue = priceSale.plus(permanenceValueLiquid);

            if (totalValue.gt(0)) {
              suiteCategoryData.categoryTotalRentals++;
              totalRentals++;

              totalRental = totalRental.plus(permanenceValueLiquid);
              totalSale = totalSale.plus(priceSale);

              suiteCategoryData.categoryTotalSale =
                suiteCategoryData.categoryTotalSale.plus(priceSale);
              suiteCategoryData.categoryTotalRental =
                suiteCategoryData.categoryTotalRental.plus(permanenceValueLiquid);
            }
          }
        }
      }

      for (const suiteCategory of suiteCategories) {
        const suiteCategoryData = categoryTotalsMap[suiteCategory.id];

        const ticketAverageSale =
          suiteCategoryData.categoryTotalRentals > 0
            ? suiteCategoryData.categoryTotalSale
                .dividedBy(suiteCategoryData.categoryTotalRentals)
                .toNumber()
            : 0;

        const ticketAverageRental =
          suiteCategoryData.categoryTotalRentals > 0
            ? suiteCategoryData.categoryTotalRental
                .dividedBy(suiteCategoryData.categoryTotalRentals)
                .toNumber()
            : 0;

        const totalTicketAverage = ticketAverageSale + ticketAverageRental;

        await this.insertKpiTicketAverage({
          totalTicketAverage: new Prisma.Decimal(totalTicketAverage),
          ticketAverageSale: new Prisma.Decimal(ticketAverageSale),
          ticketAverageRental: new Prisma.Decimal(ticketAverageRental),
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          totalAllTicketAverage: totalSale
            .plus(totalRental)
            .plus(totalSaleDirect)
            .dividedBy(totalRentals),
          ticketAverageAllSale: totalSale.dividedBy(totalRentals),
          ticketAverageAllRental: totalRental.dividedBy(totalRentals),
          period: period || null,
          createdDate: adjustedEndDate, // Ajusta a data para o final do período
          companyId,
        });

        kpiTicketAverageData.push({
          suiteCategoryId: suiteCategory.id,
          suiteCategoryName: suiteCategory.description,
          ticketAverageSale,
          ticketAverageRental,
          totalTicketAverage,
          createdDate: adjustedEndDate, // Use o fim do período como data
        });
      }

      const totalResult = {
        totalAllTicketAverage: this.formatCurrency(
          totalRentals > 0
            ? totalRental.plus(totalSale).plus(totalSaleDirect).dividedBy(totalRentals).toNumber()
            : 0,
        ),
        ticketAverageAllSale: this.formatCurrency(
          totalRentals > 0 ? totalSale.dividedBy(totalRentals).toNumber() : 0,
        ),
        ticketAverageAllRental: this.formatCurrency(
          totalRentals > 0 ? totalRental.dividedBy(totalRentals).toNumber() : 0,
        ),
        createdDate: adjustedEndDate,
      };

      const totalTicketAverageObject = {
        TotalResult: {
          ...totalResult,
        },
      };

      const formattedKpiTicketAverageData = kpiTicketAverageData.map((category) => ({
        ...category,
        ticketAverageSale: this.formatCurrency(category.ticketAverageSale),
        ticketAverageRental: this.formatCurrency(category.ticketAverageRental),
        totalTicketAverage: this.formatCurrency(category.totalTicketAverage),
      }));

      return {
        kpiTicketAverage: formattedKpiTicketAverageData,
        ...totalTicketAverageObject,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      } else {
        throw new BadRequestException('Ocorreu um erro desconhecido ao calcular o ticket médio.');
      }
    }
  }

  async insertKpiTicketAverage(data: KpiTicketAverage): Promise<KpiTicketAverage> {
    return this.prisma.prismaOnline.kpiTicketAverage.upsert({
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

  private async calculateTotalTicketAverageByPeriod(
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

        // Obter os dados de rentalApartment
        const rentalApartments = await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: currentDate,
              lte: nextDate,
            },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            saleLease: {
              include: {
                stockOut: {
                  include: {
                    stockOutItem: {
                      where: { canceled: null },
                      select: { priceSale: true, quantity: true },
                    },
                    sale: { select: { discount: true } },
                  },
                },
              },
            },
          },
        });

        // Inicializar variáveis para calcular o ticket médio
        let totalSale = new Prisma.Decimal(0);
        let totalRental = new Prisma.Decimal(0);
        let totalRentals = 0;

        for (const rentalApartment of rentalApartments) {
          const saleLease = rentalApartment.saleLease;
          let priceSale = new Prisma.Decimal(0);
          let discountSale = new Prisma.Decimal(0);

          if (saleLease && saleLease.stockOut) {
            const stockOutItems = saleLease.stockOut.stockOutItem;

            priceSale = stockOutItems.reduce((acc, item) => {
              return acc.plus(
                new Prisma.Decimal(item.priceSale).times(new Prisma.Decimal(item.quantity)),
              );
            }, new Prisma.Decimal(0));

            discountSale = saleLease.stockOut.sale?.discount
              ? new Prisma.Decimal(saleLease.stockOut.sale.discount)
              : new Prisma.Decimal(0);
            priceSale = priceSale.minus(discountSale);
          }

          const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
            ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
            : new Prisma.Decimal(0);

          const totalValue = priceSale.plus(permanenceValueLiquid);

          if (totalValue.gt(0)) {
            totalRentals++;
            totalRental = totalRental.plus(permanenceValueLiquid);
            totalSale = totalSale.plus(priceSale);
          }
        }

        // Calcular o ticket médio total
        const ticketAverageSale =
          totalRentals > 0 ? totalSale.dividedBy(totalRentals).toNumber() : 0;

        const ticketAverageRental =
          totalRentals > 0 ? totalRental.dividedBy(totalRentals).toNumber() : 0;

        const totalAllTicketAverage = ticketAverageSale + ticketAverageRental;

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0]; // Formatar a data para YYYY-MM-DD
        results[dateKey] = {
          totalAllTicketAverage: this.formatCurrency(totalAllTicketAverage),
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
        await this.insertKpiTicketAverageByPeriod({
          totalAllTicketAverage: new Prisma.Decimal(totalAllTicketAverage),
          createdDate: createdDateWithTime,
          period,
          companyId: 1,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalTicketAverageForThePeriod = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        TotalTicketAverageForThePeriod: totalTicketAverageForThePeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular o total de Ticket Average por período:', error);
      if (error instanceof Error) {
        throw new BadRequestException(
          `Falha ao calcular o total de Ticket Average por período: ${error.message}`,
        );
      } else {
        throw new BadRequestException(
          'Falha ao calcular o total de Ticket Average por período: erro desconhecido',
        );
      }
    }
  }

  async insertKpiTicketAverageByPeriod(
    data: KpiTicketAverageByPeriod,
  ): Promise<KpiTicketAverageByPeriod> {
    return this.prisma.prismaOnline.kpiTicketAverageByPeriod.upsert({
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
    console.log(`Início CronJob KpiTicketAverage - últimos 7 dias: ${startTimeLast7Days}`);

    // Chamar a função para o período atual
    await this.findAllKpiTicketAverage(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    // Chamar a função para o período anterior
    await this.findAllKpiTicketAverage(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateTotalTicketAverageByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    const endTimeLast7Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiTicketAverage - últimos 7 dias: ${endTimeLast7Days}`);

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
    console.log(`Início CronJob KpiTicketAverage - últimos 30 dias: ${startTimeLast30Days}`);

    // Chamar a função para o período atual
    await this.findAllKpiTicketAverage(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllKpiTicketAverage(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalTicketAverageByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    const endTimeLast30Days = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiTicketAverage - últimos 30 dias: ${endTimeLast30Days}`);

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
    console.log(`Início CronJob KpiTicketAverage - últimos 6 meses: ${startTimeLast6Months}`);

    // Chamar a função para o período atual
    await this.findAllKpiTicketAverage(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllKpiTicketAverage(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalTicketAverageByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    const endTimeLast6Months = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiTicketAverage - últimos 6 meses: ${endTimeLast6Months}`);

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
    console.log(`Início CronJob KpiTicketAverage - este mês: ${startTimeEsteMes}`);

    // Chamar apenas a função findAllKpiTicketAverage para o período ESTE_MES
    await this.findAllKpiTicketAverage(
      parsedStartDateEsteMes,
      parsedEndDateEsteMes,
      PeriodEnum.ESTE_MES,
    );
    const endTimeEsteMes = moment().tz(timezone).format('DD-MM-YYYY HH:mm:ss');
    console.log(`Final CronJob KpiTicketAverage - este mês: ${endTimeEsteMes}`);
  }

  private formatDateString(date: Date): string {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Mês é baseado em 0
    const year = date.getUTCFullYear();

    return `${day}/${month}/${year}`;
  }
}

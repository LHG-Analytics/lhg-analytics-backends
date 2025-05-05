import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { PeriodEnum, Prisma, RentalTypeEnum } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import {
  KpiRevenue,
  KpiRevenueByPeriod,
  KpiRevenueByRentalType,
} from './entities/kpiRevenue.entity';

@Injectable()
export class KpiRevenueService {
  constructor(private prisma: PrismaService) {}

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  private async calculateTotalSaleDirect(
    startDate: Date,
    endDate: Date,
  ): Promise<Prisma.Decimal> {
    const stockOutItems = await this.prisma.prismaLocal.stockOutItem.findMany({
      where: {
        stockOuts: {
          createdDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        canceled: null,
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

    // Agrupa os itens por stockOutId
    const groupedByStockOut = new Map<
      string,
      {
        items: typeof stockOutItems;
        discount: Prisma.Decimal;
      }
    >();

    for (const item of stockOutItems) {
      const stockOut = item.stockOuts;
      const stockOutId = item.stockOutId.toString();

      if (!stockOut || !stockOut.saleDirect) continue;

      if (!groupedByStockOut.has(stockOutId)) {
        const discount = stockOut.sale?.discount
          ? new Prisma.Decimal(stockOut.sale.discount)
          : new Prisma.Decimal(0);

        groupedByStockOut.set(stockOutId, {
          items: [],
          discount,
        });
      }

      groupedByStockOut.get(stockOutId)!.items.push(item);
    }

    // Soma o total de cada venda direta (com desconto aplicado 1x)
    let total = new Prisma.Decimal(0);

    for (const { items, discount } of groupedByStockOut.values()) {
      const subtotal = items.reduce((sum, item) => {
        const itemTotal = new Prisma.Decimal(item.priceSale).times(
          new Prisma.Decimal(item.quantity),
        );
        return sum.plus(itemTotal);
      }, new Prisma.Decimal(0));

      const totalWithDiscount = subtotal.minus(discount);
      total = total.plus(totalWithDiscount);
    }

    return total;
  }

  private async fetchKpiData(startDate: Date, endDate: Date) {
    return await Promise.all([
      this.calculateTotalSaleDirect(startDate, endDate),
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
  }

  async findAllKpiRevenue(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      // Ajustar a data final para não incluir a data atual
      const adjustedEndDate = new Date(endDate);
      if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      } else if (period === PeriodEnum.LAST_6_M) {
        adjustedEndDate.setMonth(adjustedEndDate.getMonth() - 1); // Para LAST_6_M, subtrair um mês
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      }

      const [totalSaleDirect, allRentalApartments, suiteCategories] =
        await this.fetchKpiData(startDate, endDate);

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

      const kpiRevenueData: Array<{
        suiteCategoryId: number;
        suiteCategoryName: string;
        permanenceValueTotal: Prisma.Decimal;
        permanenceValueLiquid: Prisma.Decimal;
        priceSale: Prisma.Decimal;
        discountSale: Prisma.Decimal;
        discountRental: Prisma.Decimal;
        totalDiscount: Prisma.Decimal;
        totalValue: Prisma.Decimal;
        totalSaleDirect: Prisma.Decimal;
        createdDate: Date;
      }> = [];

      const categoryTotalsMap = new Map<
        number,
        {
          permanenceValueTotal: Prisma.Decimal;
          permanenceValueLiquid: Prisma.Decimal;
          priceSale: Prisma.Decimal;
          discountSale: Prisma.Decimal;
          discountRental: Prisma.Decimal;
          totalDiscount: Prisma.Decimal;
          totalValue: Prisma.Decimal;
          totalSaleDirect: Prisma.Decimal;
        }
      >();

      suiteCategories.forEach((suiteCategory) => {
        categoryTotalsMap.set(suiteCategory.id, {
          permanenceValueTotal: new Prisma.Decimal(0),
          permanenceValueLiquid: new Prisma.Decimal(0),
          priceSale: new Prisma.Decimal(0),
          discountSale: new Prisma.Decimal(0),
          discountRental: new Prisma.Decimal(0),
          totalDiscount: new Prisma.Decimal(0),
          totalValue: new Prisma.Decimal(0),
          totalSaleDirect,
        });
      });

      // Coletar todos os stockOutSaleLease de uma vez
      const stockOutIds = allRentalApartments
        .map((rentalApartment) => rentalApartment.saleLease?.stockOutId)
        .filter((id) => id !== undefined);

      const stockOutSaleLeases =
        await this.prisma.prismaLocal.stockOut.findMany({
          where: { id: { in: stockOutIds } },
          include: {
            stockOutItem: {
              where: { canceled: null },
              select: {
                id: true,
                priceSale: true,
                quantity: true,
                stockOutId: true,
              },
            },
            sale: {
              select: {
                discount: true,
              },
            },
          },
        });

      const stockOutMap = new Map<number, any>();
      stockOutSaleLeases.forEach((stockOut) => {
        stockOutMap.set(stockOut.id, stockOut);
      });

      for (const rentalApartment of allRentalApartments) {
        const suiteCategoryId =
          rentalApartment.suiteStates.suite.suiteCategoryId;
        const suiteCategory = categoryTotalsMap.get(suiteCategoryId);

        if (!suiteCategory) {
          continue;
        }

        const saleLease = rentalApartment.saleLease;
        let priceSale = new Prisma.Decimal(0);
        let discountSale = new Prisma.Decimal(0);

        if (saleLease && saleLease.stockOutId) {
          const stockOutSaleLease = stockOutMap.get(saleLease.stockOutId);

          if (
            stockOutSaleLease &&
            Array.isArray(stockOutSaleLease.stockOutItem)
          ) {
            priceSale = stockOutSaleLease.stockOutItem.reduce(
              (acc, current) =>
                acc.plus(
                  new Prisma.Decimal(current.priceSale).times(
                    new Prisma.Decimal(current.quantity),
                  ),
                ),
              new Prisma.Decimal(0),
            );

            discountSale = stockOutSaleLease.sale?.discount
              ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
              : new Prisma.Decimal(0);
            priceSale = priceSale.minus(discountSale);
          }
        }

        const permanenceValueTotal = rentalApartment.permanenceValueTotal
          ? new Prisma.Decimal(rentalApartment.permanenceValueTotal).plus(
              rentalApartment.occupantAddValueTotal
                ? new Prisma.Decimal(rentalApartment.occupantAddValueTotal)
                : new Prisma.Decimal(0),
            )
          : new Prisma.Decimal(0);

        const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
          ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
          : new Prisma.Decimal(0);

        const totalValue = permanenceValueLiquid.plus(priceSale);

        const discountRental = rentalApartment.valueDiscountRealRental
          ? new Prisma.Decimal(rentalApartment.valueDiscountRealRental)
          : new Prisma.Decimal(0);

        const totalDiscount = rentalApartment.discount
          ? new Prisma.Decimal(rentalApartment.discount)
          : new Prisma.Decimal(0);

        suiteCategory.permanenceValueTotal =
          suiteCategory.permanenceValueTotal.plus(permanenceValueTotal);
        suiteCategory.permanenceValueLiquid =
          suiteCategory.permanenceValueLiquid.plus(permanenceValueLiquid);
        suiteCategory.priceSale = suiteCategory.priceSale.plus(priceSale);
        suiteCategory.discountSale =
          suiteCategory.discountSale.plus(discountSale);
        suiteCategory.discountRental =
          suiteCategory.discountRental.plus(discountRental);
        suiteCategory.totalDiscount =
          suiteCategory.totalDiscount.plus(totalDiscount);
        suiteCategory.totalValue = suiteCategory.totalValue.plus(totalValue);
      }

      const totalAllValue: Prisma.Decimal = Array.from(
        categoryTotalsMap.values(),
      ).reduce(
        (acc, current) => acc.plus(current.totalValue),
        new Prisma.Decimal(0),
      );

      for (const [suiteCategoryId, suiteCategory] of categoryTotalsMap) {
        const suiteCategoryData = suiteCategories.find(
          (category) => category.id === suiteCategoryId,
        );

        if (!suiteCategoryData) {
          console.warn(`Suite category not found for ID: ${suiteCategoryId}`);
          continue;
        }

        await this.insertKpiRevenue({
          suiteCategoryId: suiteCategoryData.id,
          suiteCategoryName: suiteCategoryData.description,
          permanenceValueTotal: suiteCategory.permanenceValueTotal,
          permanenceValueLiquid: suiteCategory.permanenceValueLiquid,
          priceSale: suiteCategory.priceSale,
          discountSale: suiteCategory.discountSale,
          discountRental: suiteCategory.discountRental,
          totalDiscount: suiteCategory.totalDiscount,
          totalValue: suiteCategory.totalValue,
          totalAllValue: totalAllValue.plus(totalSaleDirect),
          totalSaleDirect,
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          period: period || null,
          companyId,
        });

        kpiRevenueData.push({
          suiteCategoryId: suiteCategoryData.id,
          suiteCategoryName: suiteCategoryData.description,
          permanenceValueTotal: suiteCategory.permanenceValueTotal,
          permanenceValueLiquid: suiteCategory.permanenceValueLiquid,
          priceSale: suiteCategory.priceSale,
          discountSale: suiteCategory.discountSale,
          discountRental: suiteCategory.discountRental,
          totalDiscount: suiteCategory.totalDiscount,
          totalValue: suiteCategory.totalValue,
          totalSaleDirect,
          createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
        });
      }

      const totalResult = {
        permanenceValueTotal: kpiRevenueData.reduce(
          (acc, current) => acc.plus(current.permanenceValueTotal),
          new Prisma.Decimal(0),
        ),
        permanenceValueLiquid: kpiRevenueData.reduce(
          (acc, current) => acc.plus(current.permanenceValueLiquid),
          new Prisma.Decimal(0),
        ),
        priceSale: kpiRevenueData.reduce(
          (acc, current) => acc.plus(current.priceSale),
          new Prisma.Decimal(0),
        ),
        discountSale: kpiRevenueData.reduce(
          (acc, current) => acc.plus(current.discountSale),
          new Prisma.Decimal(0),
        ),
        discountRental: kpiRevenueData.reduce(
          (acc, current) => acc.plus(current.discountRental),
          new Prisma.Decimal(0),
        ),
        totalDiscount: kpiRevenueData.reduce(
          (acc, current) => acc.plus(current.totalDiscount),
          new Prisma.Decimal(0),
        ),
        totalValue: kpiRevenueData.reduce(
          (acc, current) => acc.plus(current.totalValue),
          new Prisma.Decimal(0),
        ),
        totalSaleDirect,
        totalAllValue: totalAllValue.plus(totalSaleDirect),
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
      };

      const formattedKpiRevenueData = kpiRevenueData.map((category) => ({
        ...category,
        permanenceValueTotal: this.formatCurrency(
          category.permanenceValueTotal.toNumber(),
        ),
        permanenceValueLiquid: this.formatCurrency(
          category.permanenceValueLiquid.toNumber(),
        ),
        priceSale: this.formatCurrency(category.priceSale.toNumber()),
        discountSale: this.formatCurrency(category.discountSale.toNumber()),
        discountRental: this.formatCurrency(category.discountRental.toNumber()),
        totalDiscount: this.formatCurrency(category.totalDiscount.toNumber()),
        totalValue: this.formatCurrency(category.totalValue.toNumber()),
        totalAllValue: this.formatCurrency(totalAllValue.toNumber()),
      }));

      return {
        kpiRevenueData: formattedKpiRevenueData,
        totalResult: {
          ...totalResult,
          permanenceValueTotal: this.formatCurrency(
            totalResult.permanenceValueTotal.toNumber(),
          ),
          permanenceValueLiquid: this.formatCurrency(
            totalResult.permanenceValueLiquid.toNumber(),
          ),
          priceSale: this.formatCurrency(totalResult.priceSale.toNumber()),
          discountSale: this.formatCurrency(
            totalResult.discountSale.toNumber(),
          ),
          discountRental: this.formatCurrency(
            totalResult.discountRental.toNumber(),
          ),
          totalDiscount: this.formatCurrency(
            totalResult.totalDiscount.toNumber(),
          ),
          totalSaleDirect: this.formatCurrency(
            totalResult.totalSaleDirect.toNumber(),
          ),
          totalValue: this.formatCurrency(totalResult.totalValue.toNumber()),
          totalAllValue: this.formatCurrency(
            Number(totalAllValue.plus(totalSaleDirect)),
          ),
        },
      };
    } catch (error) {
      console.error('Erro ao buscar KPI Revenue data:', error);
      throw new BadRequestException(
        `Failed to fetch KPI Revenue data: ${error.message}`,
      );
    }
  }

  private async insertKpiRevenue(data: KpiRevenue): Promise<KpiRevenue> {
    return this.prisma.prismaOnline.kpiRevenue.upsert({
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

  private async accumulateByRentalType(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const rentalTypeMap = {
        THREE_HOURS: RentalTypeEnum.THREE_HOURS,
        SIX_HOURS: RentalTypeEnum.SIX_HOURS,
        TWELVE_HOURS: RentalTypeEnum.TWELVE_HOURS,
        DAY_USE: RentalTypeEnum.DAY_USE,
        OVERNIGHT: RentalTypeEnum.OVERNIGHT,
        DAILY: RentalTypeEnum.DAILY,
      };

      const results: { [key: string]: any } = {};
      let currentDate = new Date(startDate);
      currentDate.setUTCHours(6, 0, 0, 0);

      // Recuperação de dados para os `stockOutId` em batch
      const allRentalApartments =
        await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: { gte: currentDate, lte: endDate },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            suiteStates: {
              include: { suite: { include: { suiteCategories: true } } },
            },
            saleLease: true,
            Booking: true,
          },
        });

      const stockOutIds = allRentalApartments
        .map((a) => a.saleLease?.stockOutId)
        .filter((id): id is number => Boolean(id));

      const stockOutData = await this.prisma.prismaLocal.stockOut.findMany({
        where: { id: { in: stockOutIds } },
        include: {
          stockOutItem: {
            where: { canceled: null },
            select: {
              id: true,
              priceSale: true,
              quantity: true,
              stockOutId: true,
            },
          },
          sale: {
            select: {
              discount: true,
            },
          },
        },
      });

      const stockOutMap: { [key: string]: Prisma.Decimal } =
        stockOutData.reduce((map, stockOut) => {
          const priceSale = stockOut.stockOutItem
            .reduce(
              (acc, item) =>
                acc.plus(
                  new Prisma.Decimal(item.priceSale).times(item.quantity),
                ),
              new Prisma.Decimal(0),
            )
            .minus(stockOut.sale?.discount || new Prisma.Decimal(0));
          map[stockOut.id] = priceSale;
          return map;
        }, {});

      while (currentDate < endDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          nextDate.setDate(nextDate.getDate() + 1); // Inclui o próximo dia
          nextDate.setUTCHours(5, 59, 59, 999);
        } else if (period === PeriodEnum.LAST_6_M) {
          nextDate.setMonth(nextDate.getMonth() + 1); // Para LAST_6_M, avança um mês
          nextDate.setUTCHours(5, 59, 59, 999); // Define a hora para o final do dia
        }

        const currentRentalApartments = allRentalApartments.filter(
          (ra) => ra.checkIn >= currentDate && ra.checkIn <= nextDate,
        );

        const totalsMap: {
          [rentalType: string]: {
            totalValue: Prisma.Decimal;
            createdDate: Date;
          };
        } = {};

        for (const rentalApartment of currentRentalApartments) {
          const rentalTypeString = this.determineRentalPeriod(
            rentalApartment.checkIn,
            rentalApartment.checkOut,
            rentalApartment.Booking?.length ? rentalApartment.Booking : null,
          );
          const rentalType = rentalTypeMap[rentalTypeString];

          if (!totalsMap[rentalType]) {
            totalsMap[rentalType] = {
              totalValue: new Prisma.Decimal(0),
              createdDate: currentDate,
            };
          }

          const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
            ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
            : new Prisma.Decimal(0);

          const priceSale = rentalApartment.saleLease?.stockOutId
            ? stockOutMap[rentalApartment.saleLease.stockOutId] ||
              new Prisma.Decimal(0)
            : new Prisma.Decimal(0);

          totalsMap[rentalType].totalValue = totalsMap[
            rentalType
          ].totalValue.plus(permanenceValueLiquid.plus(priceSale));

          if (rentalApartment.checkIn < totalsMap[rentalType].createdDate) {
            totalsMap[rentalType].createdDate = currentDate;
          }
        }

        const dateKey = currentDate.toISOString().split('T')[0];
        results[dateKey] = Object.keys(totalsMap).map((rentalType) => ({
          rentalType,
          ...totalsMap[rentalType],
        }));

        for (const dateResult of results[dateKey]) {
          let createdDateWithTime;
          if (period === 'LAST_6_M') {
            createdDateWithTime = new Date(currentDate);
            createdDateWithTime.setDate(createdDateWithTime.getDate() - 1); // Remove 1 dia
            createdDateWithTime.setUTCHours(5, 59, 59, 999); // Define a hora
          } else {
            createdDateWithTime = new Date(currentDate);
            createdDateWithTime.setUTCHours(5, 59, 59, 999);
          }
          await this.insertKpiRevenueByRentalType({
            period,
            createdDate: createdDateWithTime,
            rentalType: dateResult.rentalType,
            totalValue: dateResult.totalValue,
            companyId: 1,
          });
        }

        currentDate = nextDate; // Avança para a próxima data
      }

      const formattedResults = Object.keys(results).reduce((acc, date) => {
        acc[date] = results[date].map((data) => ({
          ...data,
          totalValue: this.formatCurrency(data.totalValue.toNumber()),
        }));
        return acc;
      }, {});

      const totalResult = {
        totalValue: Object.values(results).reduce(
          (acc, dailyData) =>
            acc +
            dailyData.reduce(
              (sum, data) => sum + data.totalValue.toNumber(),
              0,
            ),
          0,
        ),
      };

      return {
        kpiRevenueData: formattedResults,
        totalResult: {
          ...totalResult,
          totalValue: this.formatCurrency(totalResult.totalValue),
        },
      };
    } catch (error) {
      console.error('Erro ao acumular dados por tipo de locação:', error);
      throw new BadRequestException(
        `Failed to accumulate data by rental type: ${error.message}`,
      );
    }
  }

  private async insertKpiRevenueByRentalType(
    data: KpiRevenueByRentalType,
  ): Promise<KpiRevenueByRentalType> {
    return this.prisma.prismaOnline.kpiRevenueByRentalType.upsert({
      where: {
        period_createdDate_rentalType: {
          period: data.period,
          createdDate: data.createdDate,
          rentalType: data.rentalType,
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

  private async calculateTotalRevenueByPeriod(
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

        const allRentalApartments =
          await this.prisma.prismaLocal.rentalApartment.findMany({
            where: {
              checkIn: {
                gte: currentDate,
                lte: nextDate,
              },
              endOccupationType: 'FINALIZADA',
            },
            include: {
              saleLease: true,
            },
          });

        let totalValueForCurrentPeriod = new Prisma.Decimal(0);
        const stockOutIds: number[] = [];

        // Coleta todos os stockOutIds antes de fazer as consultas
        for (const rentalApartment of allRentalApartments) {
          const saleLease = rentalApartment.saleLease;

          if (saleLease && saleLease.stockOutId) {
            stockOutIds.push(saleLease.stockOutId);
          }
        }

        // Busca todos os stockOuts de uma vez, se houver algum
        const stockOuts =
          stockOutIds.length > 0
            ? await this.prisma.prismaLocal.stockOut.findMany({
                where: { id: { in: stockOutIds } },
                include: {
                  stockOutItem: {
                    where: {
                      canceled: null,
                    },
                    select: {
                      id: true,
                      priceSale: true,
                      quantity: true,
                      stockOutId: true,
                    },
                  },
                  sale: {
                    select: {
                      discount: true,
                    },
                  },
                },
              })
            : [];

        const stockOutMap = new Map(
          stockOuts.map((stockOut) => [stockOut.id, stockOut]),
        );

        for (const rentalApartment of allRentalApartments) {
          // Lógica para calcular os valores
          const saleLease = rentalApartment.saleLease;
          let priceSale = new Prisma.Decimal(0);
          let discountSale = new Prisma.Decimal(0);

          if (saleLease && saleLease.stockOutId) {
            const stockOutSaleLease = stockOutMap.get(saleLease.stockOutId);
            if (stockOutSaleLease) {
              if (Array.isArray(stockOutSaleLease.stockOutItem)) {
                priceSale = stockOutSaleLease.stockOutItem.reduce(
                  (acc, current) =>
                    acc.plus(
                      new Prisma.Decimal(current.priceSale).times(
                        new Prisma.Decimal(current.quantity),
                      ),
                    ),
                  new Prisma.Decimal(0),
                );
                discountSale = stockOutSaleLease.sale?.discount
                  ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
                  : new Prisma.Decimal(0);
                priceSale = priceSale.minus(discountSale);
              }
            }
          }

          const permanenceValueLiquid = rentalApartment.permanenceValueLiquid
            ? new Prisma.Decimal(rentalApartment.permanenceValueLiquid)
            : new Prisma.Decimal(0);

          totalValueForCurrentPeriod = totalValueForCurrentPeriod
            .plus(permanenceValueLiquid)
            .plus(priceSale);
        }

        // Formatar o totalValue
        const formattedTotalValue = this.formatCurrency(
          totalValueForCurrentPeriod.toNumber(),
        );

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0];
        results[dateKey] = {
          totalValue: formattedTotalValue,
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

        await this.insertKpiRevenueByPeriod({
          period: period,
          createdDate: createdDateWithTime, // Usa a nova data com a hora correta
          totalValue: totalValueForCurrentPeriod,
          companyId: 1,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalRevenueForThePeriod = Object.keys(results).map((date) => ({
        [date]: results[date],
      }));

      return {
        TotalRevenueForThePeriod: totalRevenueForThePeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular o faturamento total por período:', error);
      throw new BadRequestException(
        `Failed to calculate total revenue by period: ${error.message}`,
      );
    }
  }

  private async insertKpiRevenueByPeriod(
    data: KpiRevenueByPeriod,
  ): Promise<KpiRevenueByPeriod> {
    return this.prisma.prismaOnline.kpiRevenueByPeriod.upsert({
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

    // Últimos 7 dias
    const endDateLast7Days = currentDate;
    endDateLast7Days.setHours(5, 59, 59, 999);

    const startDateLast7Days = new Date(currentDate);
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 7);
    startDateLast7Days.setHours(6, 0, 0, 0);

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
    previousStartDateLast7Days.setHours(6, 0, 0, 0);

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
      `Início CronJob KpiRevenue - últimos 7 dias: ${startTimeLast7Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllKpiRevenue(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllKpiRevenue(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    await this.accumulateByRentalType(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateTotalRevenueByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiRevenue - últimos 7 dias: ${endTimeLast7Days}`,
    );

    // Últimos 30 dias
    const endDateLast30Days = currentDate;
    endDateLast30Days.setHours(5, 59, 59, 999);

    const startDateLast30Days = new Date(currentDate);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30);
    startDateLast30Days.setHours(6, 0, 0, 0);

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
    previousStartDateLast30Days.setHours(6, 0, 0, 0);

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
      `Início CronJob KpiRevenue - últimos 30 dias: ${startTimeLast30Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllKpiRevenue(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllKpiRevenue(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.accumulateByRentalType(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateTotalRevenueByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiRevenue - últimos 30 dias: ${endTimeLast30Days}`,
    );

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = currentDate;
    endDateLast6Months.setHours(5, 59, 59, 999);

    const startDateLast6Months = new Date(currentDate);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6);
    startDateLast6Months.setHours(6, 0, 0, 0);

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
    const startTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Início CronJob KpiRevenue - últimos 6 meses: ${startTimeLast6Months}`,
    );

    // Chamar a função para o período atual
    await this.findAllKpiRevenue(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllKpiRevenue(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.accumulateByRentalType(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateTotalRevenueByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob KpiRevenue - últimos 6 meses: ${endTimeLast6Months}`,
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

    parsedStartDate.setUTCHours(6, 0, 0, 0); // Define início às 06:00
    parsedEndDate.setUTCHours(5, 59, 59, 999); // Define final às 05:59:59.999

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }

  private determineRentalPeriod(
    checkIn: Date,
    checkOut: Date,
    Booking: any,
  ): string {
    const occupationTimeSeconds = this.calculateOccupationTime(
      checkIn,
      checkOut,
    );

    // Convertendo check-in e check-out para objetos Date
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    const checkInHour = checkInDate.getHours();
    const checkOutHour = checkOutDate.getHours();
    const checkOutMinutes = checkOutDate.getMinutes();

    // Verificação por horas de ocupação (3, 6 e 12 horas)
    if (occupationTimeSeconds <= 3 * 3600 + 15 * 60) {
      return 'THREE_HOURS';
    } else if (occupationTimeSeconds <= 6 * 3600 + 15 * 60) {
      return 'SIX_HOURS';
    } else if (occupationTimeSeconds <= 12 * 3600 + 15 * 60) {
      return 'TWELVE_HOURS';
    }

    // Se houver reservas, calcular os tipos adicionais
    if (Booking && Array.isArray(Booking) && Booking.length > 0) {
      // Regra para Day Use
      if (checkInHour >= 13 && checkOutHour <= 19 && checkOutMinutes <= 15) {
        return 'DAY_USE';
      }

      // Regra para Overnight
      const overnightMinimumStaySeconds = 12 * 3600 + 15 * 60;
      if (
        checkInHour >= 20 &&
        checkInHour <= 23 &&
        checkOutHour >= 8 &&
        (checkOutHour < 12 || (checkOutHour === 12 && checkOutMinutes <= 15)) &&
        occupationTimeSeconds >= overnightMinimumStaySeconds
      ) {
        return 'OVERNIGHT';
      }

      // Verificação para Diária
      if (
        occupationTimeSeconds > 16 * 3600 + 15 * 60 ||
        (checkInHour <= 15 &&
          (checkOutHour > 12 || (checkOutHour === 12 && checkOutMinutes <= 15)))
      ) {
        return 'DAILY';
      }
    }

    // Caso nenhuma condição acima seja satisfeita, retorna 12 horas como padrão
    return 'TWELVE_HOURS';
  }

  private calculateOccupationTime(checkIn: Date, checkOut: Date): number {
    const checkInTime = new Date(checkIn).getTime();
    const checkOutTime = new Date(checkOut).getTime();
    return (checkOutTime - checkInTime) / 1000; // Tempo em segundos
  }
}

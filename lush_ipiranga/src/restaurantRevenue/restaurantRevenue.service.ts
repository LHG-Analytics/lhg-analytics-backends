import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as moment from 'moment-timezone';
import { ConsumptionGroup, PeriodEnum, Prisma } from '@client-online';
import { PrismaService } from '../prisma/prisma.service';
import {
  RestaurantRevenue,
  RestaurantRevenueByDrinkCategory,
  RestaurantRevenueByFoodCategory,
  RestaurantRevenueByGroupByPeriod,
  RestaurantRevenueByOthersCategory,
  RestaurantRevenueByPeriod,
  RestaurantRevenueByPeriodPercent,
} from './entities/restaurantRevenue.entity';
@Injectable()
export class RestaurantRevenueService {
  constructor(private prisma: PrismaService) {}

  private async fetchKpiData(startDate: Date, endDate: Date) {
    return await Promise.all([
      this.prisma.prismaLocal.rentalApartment.findMany({
        where: {
          checkIn: {
            gte: startDate,
            lte: endDate,
          },
          endOccupationType: 'FINALIZADA',
        },
        include: {
          saleLease: true,
        },
      }),
    ]);
  }

  async findAllRestaurantRevenue(
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
        adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Não incluir hoje
      }

      // Buscar todas as locações no intervalo de datas
      const [allRentalApartments] = await this.fetchKpiData(
        startDate,
        adjustedEndDate,
      );

      if (!allRentalApartments || allRentalApartments.length === 0) {
        throw new NotFoundException('No rental apartments found.');
      }

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

      let totalGrossRevenue = new Prisma.Decimal(0); // Inicializa a receita bruta
      let totalDiscount = new Prisma.Decimal(0); // Inicializa o total de descontos

      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;

        if (saleLease && saleLease.stockOutId) {
          const stockOutSaleLease = stockOutMap.get(saleLease.stockOutId);

          if (
            stockOutSaleLease &&
            Array.isArray(stockOutSaleLease.stockOutItem)
          ) {
            let itemTotalValue = new Prisma.Decimal(0);
            let discountSale = new Prisma.Decimal(0);

            // Calcular o valor total da venda para este item
            stockOutSaleLease.stockOutItem.forEach((stockOutItem: { priceSale?: string | number; quantity?: string | number }) => {
              const priceSale = new Prisma.Decimal(stockOutItem.priceSale || 0);
              const quantity = new Prisma.Decimal(stockOutItem.quantity || 0);
              itemTotalValue = itemTotalValue.plus(priceSale.times(quantity));
            });

            // Aplica o desconto se existir
            discountSale = stockOutSaleLease.sale?.discount
              ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
              : new Prisma.Decimal(0);

            // Acumula a receita bruta e o desconto total
            totalGrossRevenue = totalGrossRevenue.plus(itemTotalValue);
            totalDiscount = totalDiscount.plus(discountSale);
          }
        }
      }

      // Calcular a receita líquida
      const totalNetRevenue = totalGrossRevenue.minus(totalDiscount);

      // Verifica se o totalNetRevenue é zero ou não
      if (totalNetRevenue.isZero()) {
        console.warn(
          'Total restaurant net revenue is zero. No data will be inserted.',
        );
      }

      // Inserir a receita de restaurante no banco de dados
      await this.insertRestaurantRevenue({
        totalAllValue: totalNetRevenue.isZero()
          ? new Prisma.Decimal(0)
          : totalNetRevenue,
        createdDate: new Date(adjustedEndDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
        period: period,
        companyId,
      });

      // Retornar o total formatado como moeda e o contador de locações
      const formattedRestaurantRevenueData = {
        totalRestaurantRevenue: totalNetRevenue.toNumber(), // Converte para número
      };

      return formattedRestaurantRevenueData;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Erro ao buscar Restaurant Revenue data:', error);
        throw new BadRequestException(
          `Failed to fetch Restaurant Revenue data: ${error.message}`,
        );
      } else {
        console.error('Erro ao buscar Restaurant Revenue data:', error);
        throw new BadRequestException(
          'Failed to fetch Restaurant Revenue data: erro desconhecido',
        );
      }
    }
  }

  private async insertRestaurantRevenue(
    data: RestaurantRevenue,
  ): Promise<RestaurantRevenue> {
    return this.prisma.prismaOnline.restaurantRevenue.upsert({
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

  private async calculateRestaurantRevenueByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados
      const companyId = 1;

      // Ajustar a endDate para o final do dia anterior
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Subtrai um dia
      adjustedEndDate.setUTCHours(23, 59, 59, 999); // Define o final do dia

      // Iniciar currentDate no início do dia da startDate
      let currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0); // Início do dia contábil às 00:00:00

      while (currentDate <= adjustedEndDate) {
        // Use <= para incluir o último dia
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          // Para LAST_7_D e LAST_30_D, iteração diária
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo dia
        } else if (period === PeriodEnum.LAST_6_M) {
          // Para LAST_6_M, iteração mensal
          currentDate.setDate(currentDate.getDate() - 1); // Subtrai um dia
          currentDate.setUTCHours(23, 59, 59, 999);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo mês
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

          totalValueForCurrentPeriod =
            totalValueForCurrentPeriod.plus(priceSale);
        }

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0];
        results[dateKey] = {
          totalValue: totalValueForCurrentPeriod,
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

        await this.insertRestaurantRevenueByPeriod({
          period: period,
          createdDate: createdDateWithTime, // Usa a nova data com a hora correta
          totalValue: totalValueForCurrentPeriod,
          companyId,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalRestaurantRevenueByPeriod = Object.keys(results).map(
        (date) => ({
          [date]: results[date],
        }),
      );

      return {
        RestaurantRevenueByPeriod: totalRestaurantRevenueByPeriod,
      };
    } catch (error) {
      console.error('Erro ao calcular a receita total por período:', error);
      if (error instanceof Error) {
        throw new BadRequestException(
          `Failed to calculate restaurant revenue by period: ${error.message}`,
        );
      } else {
        throw new BadRequestException(
          'Failed to calculate restaurant revenue by period: erro desconhecido',
        );
      }
    }
  }

  private async insertRestaurantRevenueByPeriod(
    data: RestaurantRevenueByPeriod,
  ): Promise<RestaurantRevenueByPeriod> {
    return this.prisma.prismaOnline.restaurantRevenueByPeriod.upsert({
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

  private async calculateRestaurantRevenueByPeriodPercent(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const results: { [key: string]: any } = {}; // Armazenar resultados
      const companyId = 1;

      // Ajustar a endDate para o final do dia anterior
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1); // Subtrai um dia
      adjustedEndDate.setUTCHours(23, 59, 59, 999); // Define o final do dia

      // Iniciar currentDate no início do dia da startDate
      let currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0); // Início do dia contábil às 00:00:00

      while (currentDate <= adjustedEndDate) {
        // Use <= para incluir o último dia
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          // Para LAST_7_D e LAST_30_D, iteração diária
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo dia
        } else if (period === PeriodEnum.LAST_6_M) {
          // Para LAST_6_M, iteração mensal
          currentDate.setDate(currentDate.getDate() - 1); // Subtrai um dia
          currentDate.setUTCHours(23, 59, 59, 999);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0); // Início do próximo mês
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

        let totalAllValueRevenueForCurrentPeriod = new Prisma.Decimal(0);
        let totalValueRestaurantRevenueForCurrentPeriod = new Prisma.Decimal(0);
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

          totalValueRestaurantRevenueForCurrentPeriod =
            totalValueRestaurantRevenueForCurrentPeriod.plus(priceSale);

          totalAllValueRevenueForCurrentPeriod =
            totalAllValueRevenueForCurrentPeriod
              .plus(permanenceValueLiquid)
              .plus(priceSale);
        }

        const totalValuePercent = new Prisma.Decimal(
          totalValueRestaurantRevenueForCurrentPeriod
            .dividedBy(totalAllValueRevenueForCurrentPeriod)
            .toFixed(2) || 0,
        );

        // Adicionar o resultado ao objeto de resultados
        const dateKey = currentDate.toISOString().split('T')[0];
        results[dateKey] = {
          totalValue: totalValuePercent,
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

        await this.insertRestaurantRevenueByPeriodPercent({
          period: period,
          createdDate: createdDateWithTime, // Usa a nova data com a hora correta
          totalValuePercent: new Prisma.Decimal(totalValuePercent),
          companyId,
        });

        currentDate = new Date(nextDate);
      }

      // Formatar o resultado final
      const totalRestaurantRevenueByPeriodPercent = Object.keys(results).map(
        (date) => ({
          [date]: results[date],
        }),
      );

      return {
        RestaurantRevenueByPeriod: totalRestaurantRevenueByPeriodPercent,
      };
    } catch (error) {
      console.error('Erro ao calcular a receita total por período:', error);
      if (error instanceof Error) {
        throw new BadRequestException(
          `Falha ao calcular a receita do restaurante por período: ${error.message}`,
        );
      } else {
        throw new BadRequestException(
          'Falha ao calcular a receita do restaurante por período: erro desconhecido',
        );
      }
    }
  }

  private async insertRestaurantRevenueByPeriodPercent(
    data: RestaurantRevenueByPeriodPercent,
  ): Promise<RestaurantRevenueByPeriodPercent> {
    return this.prisma.prismaOnline.restaurantRevenueByPeriodPercent.upsert({
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

  private async calculateRestaurantRevenueByGroupByPeriod(
    startDate: Date,
    endDate: Date,
    period: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      // Ajustar a endDate para o final do dia anterior
      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      adjustedEndDate.setUTCHours(23, 59, 59, 999);

      let currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0);

      // Estruturas para armazenar categorias e séries
      const categories: string[] = [];
      const seriesData: { [key: string]: number[] } = {
        ALIMENTOS: [],
        BEBIDAS: [],
        OUTROS: [],
      };

      while (currentDate <= adjustedEndDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
        } else if (period === PeriodEnum.LAST_6_M) {
          currentDate.setDate(currentDate.getDate() - 1);
          currentDate.setUTCHours(23, 59, 59, 999);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
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

        const stockOutIds: number[] = [];
        for (const rentalApartment of allRentalApartments) {
          const saleLease = rentalApartment.saleLease;
          if (saleLease && saleLease.stockOutId) {
            stockOutIds.push(saleLease.stockOutId);
          }
        }

        const stockOuts =
          stockOutIds.length > 0
            ? await this.prisma.prismaLocal.stockOut.findMany({
                where: { id: { in: stockOutIds } },
                include: {
                  stockOutItem: {
                    where: {
                      canceled: null,
                    },
                    include: {
                      productStock: {
                        include: {
                          product: {
                            include: {
                              typeProduct: {
                                select: {
                                  description: true,
                                },
                              },
                            },
                          },
                        },
                      },
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

        // Resetar os totais para o período atual
        const totalByGroup = {
          ALIMENTOS: new Prisma.Decimal(0),
          BEBIDAS: new Prisma.Decimal(0),
          OUTROS: new Prisma.Decimal(0),
        };

        for (const rentalApartment of allRentalApartments) {
          const saleLease = rentalApartment.saleLease;

          if (saleLease && saleLease.stockOutId) {
            const stockOutSaleLease = stockOutMap.get(saleLease.stockOutId);
            if (stockOutSaleLease) {
              for (const stockOutItem of stockOutSaleLease.stockOutItem) {
                const priceSale = new Prisma.Decimal(stockOutItem.priceSale);
                const quantity = new Prisma.Decimal(stockOutItem.quantity);
                const discount = stockOutSaleLease.sale?.discount
                  ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
                  : new Prisma.Decimal(0);

                const itemTotal = priceSale.times(quantity).minus(discount);

                // Verifica a categoria do produto e acumula no grupo correspondente
                const productTypeDescription =
                  stockOutItem.productStock?.product?.typeProduct?.description;
                if (productTypeDescription) {
                  if (
                    [
                      '07 - CAFE DA MANHA E CHA',
                      '08 - ADICIONAIS',
                      '09 - PETISCOS',
                      '10 - ENTRADAS',
                      '11 - LANCHES',
                      '12 - PRATOS PRINCIPAIS',
                      '13 - ACOMPANHAMENTOS',
                      '14 - SOBREMESAS',
                      '15- BOMBONIERE',
                    ].includes(productTypeDescription)
                  ) {
                    totalByGroup.ALIMENTOS =
                      totalByGroup.ALIMENTOS.plus(itemTotal);
                  } else if (
                    [
                      '01 - SOFT DRINKS',
                      '02 - CERVEJAS',
                      '03 - COQUETEIS',
                      '04 - DOSES',
                      '05 - GARRAFAS',
                      '06 - VINHOS E ESPUMANTES',
                    ].includes(productTypeDescription)
                  ) {
                    totalByGroup.BEBIDAS = totalByGroup.BEBIDAS.plus(itemTotal);
                  } else {
                    totalByGroup.OUTROS = totalByGroup.OUTROS.plus(itemTotal);
                  }
                }
              }
            }
          }
        }

        // Adiciona a data atual e os totais nas séries
        categories.push(currentDate.toLocaleDateString('pt-BR'));
        seriesData.ALIMENTOS.push(Number(totalByGroup.ALIMENTOS));
        seriesData.BEBIDAS.push(Number(totalByGroup.BEBIDAS));
        seriesData.OUTROS.push(Number(totalByGroup.OUTROS));

        // Realizar upsert para cada grupo
        await this.insertRestaurantRevenueByGroupByPeriod({
          consumptionGroup: ConsumptionGroup.ALIMENTOS,
          totalValue: totalByGroup.ALIMENTOS,
          companyId,
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          period,
        });

        await this.insertRestaurantRevenueByGroupByPeriod({
          consumptionGroup: ConsumptionGroup.BEBIDAS,
          totalValue: totalByGroup.BEBIDAS,
          companyId,
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          period,
        });

        await this.insertRestaurantRevenueByGroupByPeriod({
          consumptionGroup: ConsumptionGroup.OUTROS,
          totalValue: totalByGroup.OUTROS,
          companyId,
          createdDate: new Date(currentDate.setUTCHours(5, 59, 59, 999)), // Definindo a data de criação
          period,
        });

        // Atualiza a data atual para o próximo período
        currentDate = new Date(nextDate);
      }

      const formattedResult = {
        ALIMENTOS: {
          CATEGORIES: categories,
          SERIES: seriesData.ALIMENTOS,
        },
        BEBIDAS: {
          CATEGORIES: categories,
          SERIES: seriesData.BEBIDAS,
        },
        OUTROS: {
          CATEGORIES: categories,
          SERIES: seriesData.OUTROS,
        },
      };

      return formattedResult;
    } catch (error) {
      console.error(
        'Erro ao calcular a receita do restaurante por grupo e período:',
        error,
      );
      if (error instanceof Error) {
        throw new BadRequestException(
          `Failed to calculate restaurant revenue by group and period: ${error.message}`,
        );
      } else {
        throw new BadRequestException(
          'Failed to calculate restaurant revenue by group and period: erro desconhecido',
        );
      }
    }
  }

  private async insertRestaurantRevenueByGroupByPeriod(
    data: RestaurantRevenueByGroupByPeriod,
  ): Promise<RestaurantRevenueByGroupByPeriod> {
    return this.prisma.prismaOnline.restaurantRevenueByGroupByPeriod.upsert({
      where: {
        period_createdDate_consumptionGroup: {
          period: data.period as PeriodEnum,
          createdDate: data.createdDate,
          consumptionGroup: data.consumptionGroup,
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

  private async calculateRestaurantRevenueByFoodCategory(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      const categories: string[] = [
        '07 - CAFE DA MANHA E CHA',
        '09 - PETISCOS',
        '10 - ENTRADAS',
        '11 - LANCHES',
        '12 - PRATOS PRINCIPAIS',
        '13 - ACOMPANHAMENTOS',
        '14 - SOBREMESAS',
        '15- BOMBONIERE',
      ];

      const revenueByCategory: {
        [key: string]: {
          categories: string[];
          series: number[];
          total: number;
        };
      } = {};
      categories.forEach((category) => {
        revenueByCategory[category] = { categories: [], series: [], total: 0 };
      });

      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      adjustedEndDate.setUTCHours(23, 59, 59, 999);

      const finalTotalByCategory: { [key: string]: Prisma.Decimal } = {};
      categories.forEach((category) => {
        finalTotalByCategory[category] = new Prisma.Decimal(0);
      });

      // 🔁 1ª PASSAGEM: calcular total final do período inteiro
      const allRentalApartments =
        await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: startDate.toISOString(),
              lt: adjustedEndDate.toISOString(),
            },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            saleLease: true,
          },
        });

      const stockOutIds: number[] = [];
      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;
        if (saleLease?.stockOutId) {
          stockOutIds.push(saleLease.stockOutId);
        }
      }

      const stockOuts =
        stockOutIds.length > 0
          ? await this.prisma.prismaLocal.stockOut.findMany({
              where: { id: { in: stockOutIds } },
              include: {
                stockOutItem: {
                  where: { canceled: null },
                  include: {
                    productStock: {
                      include: {
                        product: {
                          include: {
                            typeProduct: {
                              select: { description: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                sale: { select: { discount: true } },
              },
            })
          : [];

      const stockOutMap = new Map(stockOuts.map((s) => [s.id, s]));

      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;
        if (saleLease?.stockOutId) {
          const stockOutSaleLease = stockOutMap.get(saleLease.stockOutId);
          if (stockOutSaleLease) {
            for (const item of stockOutSaleLease.stockOutItem) {
              const priceSale = new Prisma.Decimal(item.priceSale);
              const quantity = new Prisma.Decimal(item.quantity);
              const discount = stockOutSaleLease.sale?.discount
                ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
                : new Prisma.Decimal(0);
              const itemTotal = priceSale.times(quantity).minus(discount);

              const description =
                item.productStock?.product?.typeProduct?.description;
              if (description && categories.includes(description)) {
                finalTotalByCategory[description] =
                  finalTotalByCategory[description].plus(itemTotal);
              }
            }
          }
        }
      }

      //calcular total geral para calcular % depois
      const finalTotalGeneral = Object.values(finalTotalByCategory).reduce(
        (acc, val) => acc.plus(val),
        new Prisma.Decimal(0),
      );

      // 🔁 2ª PASSAGEM: iterar por dia/mês normalmente
      let currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0);

      while (currentDate <= adjustedEndDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
        } else if (period === PeriodEnum.LAST_6_M) {
          currentDate.setDate(currentDate.getDate() - 1);
          currentDate.setUTCHours(23, 59, 59, 999);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
        }

        const rentals = await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: currentDate.toISOString(),
              lt: nextDate.toISOString(),
            },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            saleLease: true,
          },
        });

        const ids: number[] = [];
        for (const r of rentals) {
          if (r.saleLease?.stockOutId) ids.push(r.saleLease.stockOutId);
        }

        const outs =
          ids.length > 0
            ? await this.prisma.prismaLocal.stockOut.findMany({
                where: { id: { in: ids } },
                include: {
                  stockOutItem: {
                    where: { canceled: null },
                    include: {
                      productStock: {
                        include: {
                          product: {
                            include: {
                              typeProduct: {
                                select: { description: true },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  sale: { select: { discount: true } },
                },
              })
            : [];

        const outMap = new Map(outs.map((o) => [o.id, o]));

        const totalByCategory: { [key: string]: Prisma.Decimal } = {};
        categories.forEach((category) => {
          totalByCategory[category] = new Prisma.Decimal(0);
        });

        for (const r of rentals) {
          if (r.saleLease?.stockOutId) {
            const out = outMap.get(r.saleLease.stockOutId);
            if (out) {
              for (const item of out.stockOutItem) {
                const price = new Prisma.Decimal(item.priceSale);
                const qty = new Prisma.Decimal(item.quantity);
                const discount = out.sale?.discount
                  ? new Prisma.Decimal(out.sale.discount)
                  : new Prisma.Decimal(0);
                const total = price.times(qty).minus(discount);

                const desc =
                  item.productStock?.product?.typeProduct?.description;
                if (desc && categories.includes(desc)) {
                  totalByCategory[desc] = totalByCategory[desc].plus(total);
                }
              }
            }
          }
        }

        const displayDate = new Date(currentDate);

        for (const category of categories) {
          revenueByCategory[category].categories.push(
            displayDate.toISOString().split('T')[0],
          );
          revenueByCategory[category].series.push(
            Number(totalByCategory[category]),
          );
          revenueByCategory[category].total += Number(
            totalByCategory[category],
          );
        }

        for (const category of categories) {
          const createdDate = new Date(displayDate);
          createdDate.setUTCHours(5, 59, 59, 999);

          const totalValuePercent = finalTotalGeneral.gt(0)
            ? finalTotalByCategory[category].dividedBy(finalTotalGeneral)
            : new Prisma.Decimal(0);

          await this.insertRestaurantRevenueByFoodCategory({
            period,
            createdDate,
            foodCategory: category,
            totalValue: new Prisma.Decimal(totalByCategory[category]),
            totalAllValue: new Prisma.Decimal(finalTotalByCategory[category]),
            totalValuePercent: new Prisma.Decimal(
              totalValuePercent.times(100).toFixed(2),
            ),
            companyId,
          });
        }

        currentDate = nextDate;
      }

      return revenueByCategory;
    } catch (error) {
      console.error(
        'Error fetching restaurant revenue by food category:',
        error,
      );
      throw new Error('Could not fetch revenue data');
    }
  }

  private async insertRestaurantRevenueByFoodCategory(
    data: RestaurantRevenueByFoodCategory,
  ): Promise<RestaurantRevenueByFoodCategory> {
    return this.prisma.prismaOnline.restaurantRevenueByFoodCategory.upsert({
      where: {
        period_createdDate_foodCategory: {
          period: data.period as PeriodEnum,
          createdDate: data.createdDate,
          foodCategory: data.foodCategory,
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

  private async calculateRestaurantRevenueByDrinkCategory(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      const categories: string[] = [
        '01 - SOFT DRINKS',
        '02 - CERVEJAS',
        '03 - COQUETEIS',
        '04 - DOSES',
        '05 - GARRAFAS',
        '06 - VINHOS E ESPUMANTES',
      ];

      const revenueByCategory: {
        [key: string]: {
          categories: string[];
          series: number[];
          total: number;
        };
      } = {};
      categories.forEach((category) => {
        revenueByCategory[category] = { categories: [], series: [], total: 0 };
      });

      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      adjustedEndDate.setUTCHours(23, 59, 59, 999);

      const finalTotalByCategory: { [key: string]: Prisma.Decimal } = {};
      categories.forEach((category) => {
        finalTotalByCategory[category] = new Prisma.Decimal(0);
      });

      // 🔁 1ª PASSAGEM: calcular total final do período inteiro
      const allRentalApartments =
        await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: startDate.toISOString(),
              lt: adjustedEndDate.toISOString(),
            },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            saleLease: true,
          },
        });

      const stockOutIds: number[] = [];
      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;
        if (saleLease?.stockOutId) {
          stockOutIds.push(saleLease.stockOutId);
        }
      }

      const stockOuts =
        stockOutIds.length > 0
          ? await this.prisma.prismaLocal.stockOut.findMany({
              where: { id: { in: stockOutIds } },
              include: {
                stockOutItem: {
                  where: { canceled: null },
                  include: {
                    productStock: {
                      include: {
                        product: {
                          include: {
                            typeProduct: {
                              select: { description: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                sale: { select: { discount: true } },
              },
            })
          : [];

      const stockOutMap = new Map(stockOuts.map((s) => [s.id, s]));

      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;
        if (saleLease?.stockOutId) {
          const stockOutSaleLease = stockOutMap.get(saleLease.stockOutId);
          if (stockOutSaleLease) {
            for (const item of stockOutSaleLease.stockOutItem) {
              const priceSale = new Prisma.Decimal(item.priceSale);
              const quantity = new Prisma.Decimal(item.quantity);
              const discount = stockOutSaleLease.sale?.discount
                ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
                : new Prisma.Decimal(0);
              const itemTotal = priceSale.times(quantity).minus(discount);

              const description =
                item.productStock?.product?.typeProduct?.description;
              if (description && categories.includes(description)) {
                finalTotalByCategory[description] =
                  finalTotalByCategory[description].plus(itemTotal);
              }
            }
          }
        }
      }

      //calcular total geral para calcular % depois
      const finalTotalGeneral = Object.values(finalTotalByCategory).reduce(
        (acc, val) => acc.plus(val),
        new Prisma.Decimal(0),
      );

      // 🔁 2ª PASSAGEM: iterar por dia/mês normalmente
      let currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0);

      while (currentDate <= adjustedEndDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
        } else if (period === PeriodEnum.LAST_6_M) {
          currentDate.setDate(currentDate.getDate() - 1);
          currentDate.setUTCHours(23, 59, 59, 999);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
        }

        const rentals = await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: currentDate.toISOString(),
              lt: nextDate.toISOString(),
            },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            saleLease: true,
          },
        });

        const ids: number[] = [];
        for (const r of rentals) {
          if (r.saleLease?.stockOutId) ids.push(r.saleLease.stockOutId);
        }

        const outs =
          ids.length > 0
            ? await this.prisma.prismaLocal.stockOut.findMany({
                where: { id: { in: ids } },
                include: {
                  stockOutItem: {
                    where: { canceled: null },
                    include: {
                      productStock: {
                        include: {
                          product: {
                            include: {
                              typeProduct: {
                                select: { description: true },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  sale: { select: { discount: true } },
                },
              })
            : [];

        const outMap = new Map(outs.map((o) => [o.id, o]));

        const totalByCategory: { [key: string]: Prisma.Decimal } = {};
        categories.forEach((category) => {
          totalByCategory[category] = new Prisma.Decimal(0);
        });

        for (const r of rentals) {
          if (r.saleLease?.stockOutId) {
            const out = outMap.get(r.saleLease.stockOutId);
            if (out) {
              for (const item of out.stockOutItem) {
                const price = new Prisma.Decimal(item.priceSale);
                const qty = new Prisma.Decimal(item.quantity);
                const discount = out.sale?.discount
                  ? new Prisma.Decimal(out.sale.discount)
                  : new Prisma.Decimal(0);
                const total = price.times(qty).minus(discount);

                const desc =
                  item.productStock?.product?.typeProduct?.description;
                if (desc && categories.includes(desc)) {
                  totalByCategory[desc] = totalByCategory[desc].plus(total);
                }
              }
            }
          }
        }

        const displayDate = new Date(currentDate);

        for (const category of categories) {
          revenueByCategory[category].categories.push(
            displayDate.toISOString().split('T')[0],
          );
          revenueByCategory[category].series.push(
            Number(totalByCategory[category]),
          );
          revenueByCategory[category].total += Number(
            totalByCategory[category],
          );
        }

        for (const category of categories) {
          const createdDate = new Date(displayDate);
          createdDate.setUTCHours(5, 59, 59, 999);

          const totalValuePercent = finalTotalGeneral.gt(0)
            ? finalTotalByCategory[category].dividedBy(finalTotalGeneral)
            : new Prisma.Decimal(0);

          await this.insertRestaurantRevenueByDrinkCategory({
            period,
            createdDate,
            drinkCategory: category,
            totalValue: new Prisma.Decimal(totalByCategory[category]), // dia ou mês
            totalAllValue: new Prisma.Decimal(finalTotalByCategory[category]), // sempre fixo
            totalValuePercent: new Prisma.Decimal(
              totalValuePercent.times(100).toFixed(2),
            ),
            companyId,
          });
        }

        currentDate = nextDate;
      }

      return revenueByCategory;
    } catch (error) {
      console.error(
        'Error fetching restaurant revenue by food category:',
        error,
      );
      throw new Error('Could not fetch revenue data');
    }
  }

  private async insertRestaurantRevenueByDrinkCategory(
    data: RestaurantRevenueByDrinkCategory,
  ): Promise<RestaurantRevenueByDrinkCategory> {
    return this.prisma.prismaOnline.restaurantRevenueByDrinkCategory.upsert({
      where: {
        period_createdDate_drinkCategory: {
          period: data.period as PeriodEnum,
          createdDate: data.createdDate,
          drinkCategory: data.drinkCategory,
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

  private async calculateRestaurantRevenueByOthersCategory(
    startDate: Date,
    endDate: Date,
    period?: PeriodEnum,
  ): Promise<any> {
    try {
      const companyId = 1;

      const categories: string[] = [
        '16 - PRODUTOS EROTICOS',
        '17 - CONVENIENCIA E HIGIENE',
        'ITENS EXTRAS',
        'RESERVAS',
        'SOUVENIR',
      ];

      const revenueByCategory: {
        [key: string]: {
          categories: string[];
          series: number[];
          total: number;
        };
      } = {};
      categories.forEach((category) => {
        revenueByCategory[category] = { categories: [], series: [], total: 0 };
      });

      const adjustedEndDate = new Date(endDate);
      adjustedEndDate.setDate(adjustedEndDate.getDate() - 1);
      adjustedEndDate.setUTCHours(23, 59, 59, 999);

      const finalTotalByCategory: { [key: string]: Prisma.Decimal } = {};
      categories.forEach((category) => {
        finalTotalByCategory[category] = new Prisma.Decimal(0);
      });

      // 🔁 1ª PASSAGEM: calcular total final do período inteiro
      const allRentalApartments =
        await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: startDate.toISOString(),
              lt: adjustedEndDate.toISOString(),
            },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            saleLease: true,
          },
        });

      const stockOutIds: number[] = [];
      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;
        if (saleLease?.stockOutId) {
          stockOutIds.push(saleLease.stockOutId);
        }
      }

      const stockOuts =
        stockOutIds.length > 0
          ? await this.prisma.prismaLocal.stockOut.findMany({
              where: { id: { in: stockOutIds } },
              include: {
                stockOutItem: {
                  where: { canceled: null },
                  include: {
                    productStock: {
                      include: {
                        product: {
                          include: {
                            typeProduct: {
                              select: { description: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                sale: { select: { discount: true } },
              },
            })
          : [];

      const stockOutMap = new Map(stockOuts.map((s) => [s.id, s]));

      for (const rentalApartment of allRentalApartments) {
        const saleLease = rentalApartment.saleLease;
        if (saleLease?.stockOutId) {
          const stockOutSaleLease = stockOutMap.get(saleLease.stockOutId);
          if (stockOutSaleLease) {
            for (const item of stockOutSaleLease.stockOutItem) {
              const priceSale = new Prisma.Decimal(item.priceSale);
              const quantity = new Prisma.Decimal(item.quantity);
              const discount = stockOutSaleLease.sale?.discount
                ? new Prisma.Decimal(stockOutSaleLease.sale.discount)
                : new Prisma.Decimal(0);
              const itemTotal = priceSale.times(quantity).minus(discount);

              const description =
                item.productStock?.product?.typeProduct?.description;
              if (description && categories.includes(description)) {
                finalTotalByCategory[description] =
                  finalTotalByCategory[description].plus(itemTotal);
              }
            }
          }
        }
      }

      //calcular total geral para calcular % depois
      const finalTotalGeneral = Object.values(finalTotalByCategory).reduce(
        (acc, val) => acc.plus(val),
        new Prisma.Decimal(0),
      );

      // 🔁 2ª PASSAGEM: iterar por dia/mês normalmente
      let currentDate = new Date(startDate);
      currentDate.setUTCHours(0, 0, 0, 0);

      while (currentDate <= adjustedEndDate) {
        let nextDate = new Date(currentDate);

        if (period === PeriodEnum.LAST_7_D || period === PeriodEnum.LAST_30_D) {
          nextDate.setDate(nextDate.getDate() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
        } else if (period === PeriodEnum.LAST_6_M) {
          currentDate.setDate(currentDate.getDate() - 1);
          currentDate.setUTCHours(23, 59, 59, 999);
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setUTCHours(0, 0, 0, 0);
        }

        const rentals = await this.prisma.prismaLocal.rentalApartment.findMany({
          where: {
            checkIn: {
              gte: currentDate.toISOString(),
              lt: nextDate.toISOString(),
            },
            endOccupationType: 'FINALIZADA',
          },
          include: {
            saleLease: true,
          },
        });

        const ids: number[] = [];
        for (const r of rentals) {
          if (r.saleLease?.stockOutId) ids.push(r.saleLease.stockOutId);
        }

        const outs =
          ids.length > 0
            ? await this.prisma.prismaLocal.stockOut.findMany({
                where: { id: { in: ids } },
                include: {
                  stockOutItem: {
                    where: { canceled: null },
                    include: {
                      productStock: {
                        include: {
                          product: {
                            include: {
                              typeProduct: {
                                select: { description: true },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  sale: { select: { discount: true } },
                },
              })
            : [];

        const outMap = new Map(outs.map((o) => [o.id, o]));

        const totalByCategory: { [key: string]: Prisma.Decimal } = {};
        categories.forEach((category) => {
          totalByCategory[category] = new Prisma.Decimal(0);
        });

        for (const r of rentals) {
          if (r.saleLease?.stockOutId) {
            const out = outMap.get(r.saleLease.stockOutId);
            if (out) {
              for (const item of out.stockOutItem) {
                const price = new Prisma.Decimal(item.priceSale);
                const qty = new Prisma.Decimal(item.quantity);
                const discount = out.sale?.discount
                  ? new Prisma.Decimal(out.sale.discount)
                  : new Prisma.Decimal(0);
                const total = price.times(qty).minus(discount);

                const desc =
                  item.productStock?.product?.typeProduct?.description;
                if (desc && categories.includes(desc)) {
                  totalByCategory[desc] = totalByCategory[desc].plus(total);
                }
              }
            }
          }
        }

        const displayDate = new Date(currentDate);

        for (const category of categories) {
          revenueByCategory[category].categories.push(
            displayDate.toISOString().split('T')[0],
          );
          revenueByCategory[category].series.push(
            Number(totalByCategory[category]),
          );
          revenueByCategory[category].total += Number(
            totalByCategory[category],
          );
        }

        for (const category of categories) {
          const createdDate = new Date(displayDate);
          createdDate.setUTCHours(5, 59, 59, 999);

          const totalValuePercent = finalTotalGeneral.gt(0)
            ? finalTotalByCategory[category].dividedBy(finalTotalGeneral)
            : new Prisma.Decimal(0);

          await this.insertRestaurantRevenueByOthersCategory({
            period,
            createdDate,
            othersCategory: category,
            totalValue: new Prisma.Decimal(totalByCategory[category]), // dia ou mês
            totalAllValue: new Prisma.Decimal(finalTotalByCategory[category]), // sempre fixo
            totalValuePercent: new Prisma.Decimal(
              totalValuePercent.times(100).toFixed(2),
            ),
            companyId,
          });
        }

        currentDate = nextDate;
      }

      return revenueByCategory;
    } catch (error) {
      console.error(
        'Error fetching restaurant revenue by food category:',
        error,
      );
      throw new Error('Could not fetch revenue data');
    }
  }

  private async insertRestaurantRevenueByOthersCategory(
    data: RestaurantRevenueByOthersCategory,
  ): Promise<RestaurantRevenueByOthersCategory> {
    return this.prisma.prismaOnline.restaurantRevenueByOthersCategory.upsert({
      where: {
        period_createdDate_othersCategory: {
          period: data.period as PeriodEnum,
          createdDate: data.createdDate,
          othersCategory: data.othersCategory,
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
    endDateLast7Days.setUTCHours(23, 59, 59, 999);

    const startDateLast7Days = new Date(endDateLast7Days);
    startDateLast7Days.setDate(startDateLast7Days.getDate() - 7); // Vai 6 dias para trás
    startDateLast7Days.setHours(0, 0, 0, 0);

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
    previousStartDateLast7Days.setHours(0, 0, 0, 0);

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
      `Início CronJob RestaurantRevenue - últimos 7 dias: ${startTimeLast7Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllRestaurantRevenue(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    // Chamar a função para o período anterior
    await this.findAllRestaurantRevenue(
      previousParsedStartDateLast7Days,
      previousParsedEndDateLast7DaysParsed,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantRevenueByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantRevenueByPeriodPercent(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantRevenueByGroupByPeriod(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantRevenueByFoodCategory(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantRevenueByDrinkCategory(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );
    await this.calculateRestaurantRevenueByOthersCategory(
      parsedStartDateLast7Days,
      parsedEndDateLast7Days,
      PeriodEnum.LAST_7_D,
    );

    const endTimeLast7Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob RestaurantRevenue - últimos 7 dias: ${endTimeLast7Days}`,
    );

    // Últimos 30 dias
    const endDateLast30Days = new Date(currentDate);
    endDateLast30Days.setUTCHours(23, 59, 59, 999);

    const startDateLast30Days = new Date(endDateLast30Days);
    startDateLast30Days.setDate(startDateLast30Days.getDate() - 30); // Vai 29 dias para trás
    startDateLast30Days.setHours(0, 0, 0, 0);

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
    previousStartDateLast30Days.setHours(0, 0, 0, 0);

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
      `Início CronJob RestaurantRevenue - últimos 30 dias: ${startTimeLast30Days}`,
    );

    // Chamar a função para o período atual
    await this.findAllRestaurantRevenue(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    // Chamar a função para o período anterior
    await this.findAllRestaurantRevenue(
      previousParsedStartDateLast30Days,
      previousParsedEndDateLast30DaysParsed,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantRevenueByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantRevenueByPeriodPercent(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantRevenueByGroupByPeriod(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantRevenueByFoodCategory(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantRevenueByDrinkCategory(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );
    await this.calculateRestaurantRevenueByOthersCategory(
      parsedStartDateLast30Days,
      parsedEndDateLast30Days,
      PeriodEnum.LAST_30_D,
    );

    const endTimeLast30Days = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob RestaurantRevenue - últimos 30 dias: ${endTimeLast30Days}`,
    );

    // Últimos 6 meses (180 dias)
    const endDateLast6Months = new Date(currentDate);
    endDateLast6Months.setUTCHours(23, 59, 59, 999);

    const startDateLast6Months = new Date(endDateLast6Months);
    startDateLast6Months.setMonth(startDateLast6Months.getMonth() - 6); // Vai 6 meses para trás
    startDateLast6Months.setHours(0, 0, 0, 0);

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
    previousStartDateLast6Months.setHours(0, 0, 0, 0); // Configuração de horas

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
      `Início CronJob RestaurantRevenue - últimos 6 meses: ${startTimeLast6Months}`,
    );

    // Chamar a função para o período atual
    await this.findAllRestaurantRevenue(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    // Chamar a função para o período anterior
    await this.findAllRestaurantRevenue(
      previousParsedStartDateLast6Months,
      previousParsedEndDateLast6MonthsParsed,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantRevenueByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantRevenueByPeriodPercent(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantRevenueByGroupByPeriod(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantRevenueByFoodCategory(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantRevenueByDrinkCategory(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );
    await this.calculateRestaurantRevenueByOthersCategory(
      parsedStartDateLast6Months,
      parsedEndDateLast6Months,
      PeriodEnum.LAST_6_M,
    );

    const endTimeLast6Months = moment()
      .tz(timezone)
      .format('DD-MM-YYYY HH:mm:ss');
    console.log(
      `Final CronJob RestaurantRevenue - últimos 6 meses: ${endTimeLast6Months}`,
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

    parsedStartDate.setUTCHours(0, 0, 0, 0); // Define início às 06:00
    parsedEndDate.setUTCHours(23, 59, 59, 999); // Define final às 05:59:59.999

    return { startDate: parsedStartDate, endDate: parsedEndDate };
  }
}

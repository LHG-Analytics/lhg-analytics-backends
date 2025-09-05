import { Prisma } from '@client-online';

export class Restaurant implements Prisma.RestaurantUncheckedCreateInput {
  id?: number;
  RestaurantRevenue?: Prisma.RestaurantRevenueUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantRevenueByDrinkCategory?: Prisma.RestaurantRevenueByDrinkCategoryUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantRevenueByFoodCategory?: Prisma.RestaurantRevenueByFoodCategoryUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantRevenueByGroupByPeriod?: Prisma.RestaurantRevenueByGroupByPeriodUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantRevenueByOthersCategory?: Prisma.RestaurantRevenueByOthersCategoryUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantRevenueByPeriod?: Prisma.RestaurantRevenueByPeriodUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantRevenueByPeriodPercent?: Prisma.RestaurantRevenueByPeriodPercentUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantSales?: Prisma.RestaurantSalesUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantSalesByDrinkCategory?: Prisma.RestaurantSalesByDrinkCategoryUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantSalesByFoodCategory?: Prisma.RestaurantSalesByFoodCategoryUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantSalesByOthersCategory?: Prisma.RestaurantSalesByOthersCategoryUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantSalesRanking?: Prisma.RestaurantSalesRankingUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantTicketAverage?: Prisma.RestaurantTicketAverageUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantTicketAverageByPeriod?: Prisma.RestaurantTicketAverageByPeriodUncheckedCreateNestedManyWithoutRestaurantInput;
  RestaurantTicketAverageByTotalRentals?: Prisma.RestaurantTicketAverageByTotalRentalsUncheckedCreateNestedManyWithoutRestaurantInput;
  companyId: number;

  constructor(
    companyId: number,
    id?: number,
    RestaurantRevenue?: Prisma.RestaurantRevenueUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantRevenueByDrinkCategory?: Prisma.RestaurantRevenueByDrinkCategoryUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantRevenueByFoodCategory?: Prisma.RestaurantRevenueByFoodCategoryUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantRevenueByGroupByPeriod?: Prisma.RestaurantRevenueByGroupByPeriodUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantRevenueByOthersCategory?: Prisma.RestaurantRevenueByOthersCategoryUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantRevenueByPeriod?: Prisma.RestaurantRevenueByPeriodUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantRevenueByPeriodPercent?: Prisma.RestaurantRevenueByPeriodPercentUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantSales?: Prisma.RestaurantSalesUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantSalesByDrinkCategory?: Prisma.RestaurantSalesByDrinkCategoryUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantSalesByFoodCategory?: Prisma.RestaurantSalesByFoodCategoryUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantSalesByOthersCategory?: Prisma.RestaurantSalesByOthersCategoryUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantSalesRanking?: Prisma.RestaurantSalesRankingUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantTicketAverage?: Prisma.RestaurantTicketAverageUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantTicketAverageByPeriod?: Prisma.RestaurantTicketAverageByPeriodUncheckedCreateNestedManyWithoutRestaurantInput,
    RestaurantTicketAverageByTotalRentals?: Prisma.RestaurantTicketAverageByTotalRentalsUncheckedCreateNestedManyWithoutRestaurantInput,
  ) {
    this.companyId = companyId;
    this.id = id;
    this.RestaurantRevenue = RestaurantRevenue;
    this.RestaurantRevenueByDrinkCategory = RestaurantRevenueByDrinkCategory;
    this.RestaurantRevenueByFoodCategory = RestaurantRevenueByFoodCategory;
    this.RestaurantRevenueByGroupByPeriod = RestaurantRevenueByGroupByPeriod;
    this.RestaurantRevenueByOthersCategory = RestaurantRevenueByOthersCategory;
    this.RestaurantRevenueByPeriod = RestaurantRevenueByPeriod;
    this.RestaurantRevenueByPeriodPercent = RestaurantRevenueByPeriodPercent;
    this.RestaurantSales = RestaurantSales;
    this.RestaurantSalesByDrinkCategory = RestaurantSalesByDrinkCategory;
    this.RestaurantSalesByFoodCategory = RestaurantSalesByFoodCategory;
    this.RestaurantSalesByOthersCategory = RestaurantSalesByOthersCategory;
    this.RestaurantSalesRanking = RestaurantSalesRanking;
    this.RestaurantTicketAverage = RestaurantTicketAverage;
    this.RestaurantTicketAverageByPeriod = RestaurantTicketAverageByPeriod;
    this.RestaurantTicketAverageByTotalRentals = RestaurantTicketAverageByTotalRentals;
  }
}

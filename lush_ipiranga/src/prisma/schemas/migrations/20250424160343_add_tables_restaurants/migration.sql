-- CreateEnum
CREATE TYPE "ConsumptionGroup" AS ENUM ('ALIMENTOS', 'BEBIDAS', 'OUTROS');

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenue" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantRevenueByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByPeriodPercent" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValuePercent" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantRevenueByPeriodPercent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByFoodCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "foodCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantRevenueByFoodCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByFoodCategoryPercent" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValuePercent" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "foodCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantRevenueByFoodCategoryPercent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByDrinkCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "drinkCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantRevenueByDrinkCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByDrinkCategoryPercent" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValuePercent" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "drinkCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantRevenueByDrinkCategoryPercent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByOthersCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValue" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "othersCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantRevenueByOthersCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRevenueByOthersCategoryPercent" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalValuePercent" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "othersCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantRevenueByOthersCategoryPercent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSales" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllSales" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantSales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesRanking" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSales" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantSalesRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesPercentGroup" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSalesPercent" DECIMAL(10,2) NOT NULL,
    "consumptionGroup" "ConsumptionGroup" NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantSalesPercentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesByFoodCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSales" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "foodCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantSalesByFoodCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesByFoodCategoryPercent" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSalesPercent" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "foodCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantSalesByFoodCategoryPercent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesByDrinkCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSale" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "drinkCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantSalesByDrinkCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesByDrinkCategoryPercent" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSalePercent" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "drinkCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantSalesByDrinkCategoryPercent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesByOthersCategory" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSales" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "othersCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantSalesByOthersCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesByOthersCategoryPercent" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalSalesPercent" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "othersCategory" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantSalesByOthersCategoryPercent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTicketAverage" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllTicketAverage" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantTicketAverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTicketAverageByTotalRentals" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllTicketAverageByTotalRentals" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantTicketAverageByTotalRentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantTicketAverageByTotalRentalsByPeriod" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalTicketAverageByTotalRentals" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER NOT NULL,

    CONSTRAINT "RestaurantTicketAverageByTotalRentalsByPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenue_period_createdDate_key" ON "RestaurantRevenue"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByPeriod_period_createdDate_key" ON "RestaurantRevenueByPeriod"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByPeriodPercent_period_createdDate_key" ON "RestaurantRevenueByPeriodPercent"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByFoodCategory_period_createdDate_foodCate_key" ON "RestaurantRevenueByFoodCategory"("period", "createdDate", "foodCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByFoodCategoryPercent_period_createdDate_f_key" ON "RestaurantRevenueByFoodCategoryPercent"("period", "createdDate", "foodCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByDrinkCategory_period_createdDate_drinkCa_key" ON "RestaurantRevenueByDrinkCategory"("period", "createdDate", "drinkCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByDrinkCategoryPercent_period_createdDate__key" ON "RestaurantRevenueByDrinkCategoryPercent"("period", "createdDate", "drinkCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByOthersCategory_period_createdDate_others_key" ON "RestaurantRevenueByOthersCategory"("period", "createdDate", "othersCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRevenueByOthersCategoryPercent_period_createdDate_key" ON "RestaurantRevenueByOthersCategoryPercent"("period", "createdDate", "othersCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSales_period_createdDate_key" ON "RestaurantSales"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesRanking_period_createdDate_productName_key" ON "RestaurantSalesRanking"("period", "createdDate", "productName");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesPercentGroup_period_createdDate_consumptionG_key" ON "RestaurantSalesPercentGroup"("period", "createdDate", "consumptionGroup");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesByFoodCategory_period_createdDate_foodCatego_key" ON "RestaurantSalesByFoodCategory"("period", "createdDate", "foodCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesByFoodCategoryPercent_period_createdDate_foo_key" ON "RestaurantSalesByFoodCategoryPercent"("period", "createdDate", "foodCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesByDrinkCategory_period_createdDate_drinkCate_key" ON "RestaurantSalesByDrinkCategory"("period", "createdDate", "drinkCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesByDrinkCategoryPercent_period_createdDate_dr_key" ON "RestaurantSalesByDrinkCategoryPercent"("period", "createdDate", "drinkCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesByOthersCategory_period_createdDate_othersCa_key" ON "RestaurantSalesByOthersCategory"("period", "createdDate", "othersCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesByOthersCategoryPercent_period_createdDate_o_key" ON "RestaurantSalesByOthersCategoryPercent"("period", "createdDate", "othersCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTicketAverage_period_createdDate_key" ON "RestaurantTicketAverage"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTicketAverageByTotalRentals_period_createdDate_key" ON "RestaurantTicketAverageByTotalRentals"("period", "createdDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTicketAverageByTotalRentalsByPeriod_period_create_key" ON "RestaurantTicketAverageByTotalRentalsByPeriod"("period", "createdDate");

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenue" ADD CONSTRAINT "RestaurantRevenue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenue" ADD CONSTRAINT "RestaurantRevenue_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriod" ADD CONSTRAINT "RestaurantRevenueByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriod" ADD CONSTRAINT "RestaurantRevenueByPeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriodPercent" ADD CONSTRAINT "RestaurantRevenueByPeriodPercent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByPeriodPercent" ADD CONSTRAINT "RestaurantRevenueByPeriodPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategory" ADD CONSTRAINT "RestaurantRevenueByFoodCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategory" ADD CONSTRAINT "RestaurantRevenueByFoodCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategoryPercent" ADD CONSTRAINT "RestaurantRevenueByFoodCategoryPercent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByFoodCategoryPercent" ADD CONSTRAINT "RestaurantRevenueByFoodCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategory" ADD CONSTRAINT "RestaurantRevenueByDrinkCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategory" ADD CONSTRAINT "RestaurantRevenueByDrinkCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategoryPercent" ADD CONSTRAINT "RestaurantRevenueByDrinkCategoryPercent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByDrinkCategoryPercent" ADD CONSTRAINT "RestaurantRevenueByDrinkCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategory" ADD CONSTRAINT "RestaurantRevenueByOthersCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategory" ADD CONSTRAINT "RestaurantRevenueByOthersCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategoryPercent" ADD CONSTRAINT "RestaurantRevenueByOthersCategoryPercent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRevenueByOthersCategoryPercent" ADD CONSTRAINT "RestaurantRevenueByOthersCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSales" ADD CONSTRAINT "RestaurantSales_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSales" ADD CONSTRAINT "RestaurantSales_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesRanking" ADD CONSTRAINT "RestaurantSalesRanking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesRanking" ADD CONSTRAINT "RestaurantSalesRanking_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesPercentGroup" ADD CONSTRAINT "RestaurantSalesPercentGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesPercentGroup" ADD CONSTRAINT "RestaurantSalesPercentGroup_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByFoodCategory" ADD CONSTRAINT "RestaurantSalesByFoodCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByFoodCategory" ADD CONSTRAINT "RestaurantSalesByFoodCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByFoodCategoryPercent" ADD CONSTRAINT "RestaurantSalesByFoodCategoryPercent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByFoodCategoryPercent" ADD CONSTRAINT "RestaurantSalesByFoodCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategory" ADD CONSTRAINT "RestaurantSalesByDrinkCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategory" ADD CONSTRAINT "RestaurantSalesByDrinkCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategoryPercent" ADD CONSTRAINT "RestaurantSalesByDrinkCategoryPercent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByDrinkCategoryPercent" ADD CONSTRAINT "RestaurantSalesByDrinkCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByOthersCategory" ADD CONSTRAINT "RestaurantSalesByOthersCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByOthersCategory" ADD CONSTRAINT "RestaurantSalesByOthersCategory_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByOthersCategoryPercent" ADD CONSTRAINT "RestaurantSalesByOthersCategoryPercent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantSalesByOthersCategoryPercent" ADD CONSTRAINT "RestaurantSalesByOthersCategoryPercent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverage" ADD CONSTRAINT "RestaurantTicketAverage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverage" ADD CONSTRAINT "RestaurantTicketAverage_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentals" ADD CONSTRAINT "RestaurantTicketAverageByTotalRentals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentals" ADD CONSTRAINT "RestaurantTicketAverageByTotalRentals_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentalsByPeriod" ADD CONSTRAINT "RestaurantTicketAverageByTotalRentalsByPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTicketAverageByTotalRentalsByPeriod" ADD CONSTRAINT "RestaurantTicketAverageByTotalRentalsByPeriod_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

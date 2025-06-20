-- CreateTable
CREATE TABLE "RestaurantCMV" (
    "id" SERIAL NOT NULL,
    "period" "PeriodEnum",
    "totalAllCMV" DECIMAL(10,2) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "restaurantId" INTEGER,

    CONSTRAINT "RestaurantCMV_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantCMV_period_createdDate_key" ON "RestaurantCMV"("period", "createdDate");

-- AddForeignKey
ALTER TABLE "RestaurantCMV" ADD CONSTRAINT "RestaurantCMV_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantCMV" ADD CONSTRAINT "RestaurantCMV_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

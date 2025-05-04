/*
  Warnings:

  - You are about to drop the column `companyId` on the `User` table. All the data in the column will be lost.
  - Added the required column `company` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_companyId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "companyId",
ADD COLUMN     "company" TEXT NOT NULL;

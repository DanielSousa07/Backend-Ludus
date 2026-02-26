/*
  Warnings:

  - The `status` column on the `Rental` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('PENDING', 'ACTIVE', 'RETURNED', 'CANCELED');

-- AlterTable
ALTER TABLE "Rental" DROP COLUMN "status",
ADD COLUMN     "status" "RentalStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserPointsLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPointsLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserPointsLog_userId_idx" ON "UserPointsLog"("userId");

-- CreateIndex
CREATE INDEX "Rental_userId_idx" ON "Rental"("userId");

-- AddForeignKey
ALTER TABLE "UserPointsLog" ADD CONSTRAINT "UserPointsLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

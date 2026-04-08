/*
  Warnings:

  - A unique constraint covering the columns `[gameId,name]` on the table `GameComponent` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `gameTitleSnapshot` to the `Rental` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "GameCopy" DROP CONSTRAINT "GameCopy_gameId_fkey";

-- DropForeignKey
ALTER TABLE "Rental" DROP CONSTRAINT "Rental_gameId_fkey";

-- DropForeignKey
ALTER TABLE "Rental" DROP CONSTRAINT "Rental_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserPointsLog" DROP CONSTRAINT "UserPointsLog_userId_fkey";

-- AlterTable
ALTER TABLE "Rental" ADD COLUMN     "copyCodeSnapshot" TEXT,
ADD COLUMN     "copyNumberSnapshot" INTEGER,
ADD COLUMN     "gameCoverSnapshot" TEXT,
ADD COLUMN     "gameTitleSnapshot" TEXT NOT NULL,
ALTER COLUMN "gameId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE INDEX "Favorite_gameId_idx" ON "Favorite"("gameId");

-- CreateIndex
CREATE INDEX "Game_title_idx" ON "Game"("title");

-- CreateIndex
CREATE INDEX "Game_ludopediaId_idx" ON "Game"("ludopediaId");

-- CreateIndex
CREATE INDEX "GameComponent_gameId_idx" ON "GameComponent"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameComponent_gameId_name_key" ON "GameComponent"("gameId", "name");

-- CreateIndex
CREATE INDEX "GameCopy_gameId_idx" ON "GameCopy"("gameId");

-- CreateIndex
CREATE INDEX "GameRating_gameId_idx" ON "GameRating"("gameId");

-- CreateIndex
CREATE INDEX "GameRating_userId_idx" ON "GameRating"("userId");

-- CreateIndex
CREATE INDEX "Rental_status_idx" ON "Rental"("status");

-- AddForeignKey
ALTER TABLE "UserPointsLog" ADD CONSTRAINT "UserPointsLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCopy" ADD CONSTRAINT "GameCopy_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

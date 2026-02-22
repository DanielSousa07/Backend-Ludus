-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "allowOriginalRental" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Rental" ADD COLUMN     "copyId" TEXT;

-- CreateTable
CREATE TABLE "GameCopy" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT,
    "condition" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gameId" TEXT NOT NULL,

    CONSTRAINT "GameCopy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameCopy_gameId_number_key" ON "GameCopy"("gameId", "number");

-- CreateIndex
CREATE INDEX "Rental_gameId_idx" ON "Rental"("gameId");

-- CreateIndex
CREATE INDEX "Rental_copyId_idx" ON "Rental"("copyId");

-- AddForeignKey
ALTER TABLE "GameCopy" ADD CONSTRAINT "GameCopy_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "GameCopy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

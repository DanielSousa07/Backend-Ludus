-- CreateTable
CREATE TABLE "GameAvailabilityWatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameAvailabilityWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameAvailabilityWatch_gameId_idx" ON "GameAvailabilityWatch"("gameId");

-- CreateIndex
CREATE INDEX "GameAvailabilityWatch_userId_idx" ON "GameAvailabilityWatch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameAvailabilityWatch_userId_gameId_key" ON "GameAvailabilityWatch"("userId", "gameId");

-- AddForeignKey
ALTER TABLE "GameAvailabilityWatch" ADD CONSTRAINT "GameAvailabilityWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameAvailabilityWatch" ADD CONSTRAINT "GameAvailabilityWatch_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

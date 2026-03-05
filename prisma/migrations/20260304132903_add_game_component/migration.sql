-- CreateTable
CREATE TABLE "GameComponent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "GameComponent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GameComponent" ADD CONSTRAINT "GameComponent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

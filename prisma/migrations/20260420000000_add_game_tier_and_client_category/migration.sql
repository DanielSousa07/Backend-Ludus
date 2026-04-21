-- CreateEnum
CREATE TYPE "GameTier" AS ENUM ('LATAO', 'BRONZE', 'PRATA', 'OURO', 'DIAMANTE');

-- CreateEnum
CREATE TYPE "ClientCategory" AS ENUM ('STARTER', 'FAMILY', 'EXPERT', 'ULTRAGAMER');

-- AlterTable Game: adiciona tier (default BRONZE para jogos existentes)
ALTER TABLE "Game" ADD COLUMN "tier" "GameTier" NOT NULL DEFAULT 'BRONZE';

-- AlterTable User: adiciona categoria e contador de progressão
ALTER TABLE "User" ADD COLUMN "clientCategory" "ClientCategory" NOT NULL DEFAULT 'STARTER';
ALTER TABLE "User" ADD COLUMN "totalRentalsCount" INTEGER NOT NULL DEFAULT 0;
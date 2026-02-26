-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authProvider" TEXT NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "googleSub" TEXT,
ALTER COLUMN "senhaHash" DROP NOT NULL;

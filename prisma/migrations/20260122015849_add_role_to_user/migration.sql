-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "cover" TEXT,
ADD COLUMN     "ludopediaId" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'USER';

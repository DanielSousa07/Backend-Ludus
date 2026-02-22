-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailVerificationCode" TEXT,
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastEmailSentAt" TIMESTAMP(3);

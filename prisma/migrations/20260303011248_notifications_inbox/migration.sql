-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RENTAL_CREATED', 'RENTAL_DUE_24H', 'RENTAL_DUE_TODAY', 'RENTAL_OVERDUE', 'RENTAL_RETURN_CONFIRMED', 'RATING_SAVED', 'FAVORITE_ADDED', 'FAVORITE_REMOVED', 'EMAIL_VERIFIED', 'PHONE_VERIFIED', 'VERIFY_REQUIRED', 'POINTS_EARNED', 'LEVEL_UP', 'SYSTEM_ANNOUNCEMENT', 'GAME_BACK_AVAILABLE');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_dedupeKey_idx" ON "Notification"("dedupeKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

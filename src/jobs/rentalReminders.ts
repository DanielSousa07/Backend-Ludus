import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { notifyUser } from "../services/notify.service";
import { RentalStatus, NotificationType } from "@prisma/client";

const OPEN_STATUSES: RentalStatus[] = [RentalStatus.PENDING, RentalStatus.ACTIVE];

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function startRentalReminderJob() {
  
  cron.schedule("0 * * * *", async () => {
    const now = new Date();

    
    const tomorrow = addDays(now, 1);
    const in24hStart = startOfDay(tomorrow);
    const in24hEnd = endOfDay(tomorrow);

    const due24h = await prisma.rental.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        endDate: { gte: in24hStart, lte: in24hEnd },
      },
      select: {
        id: true,
        userId: true,
        endDate: true,
        game: { select: { id: true, title: true } },
      },
    });

    for (const r of due24h) {
      await notifyUser({
        userId: r.userId,
        type: NotificationType.RENTAL_DUE_24H,
        title: "Seu aluguel vence em 24h ⏳",
        body: `O jogo "${r.game.title}" vence amanhã. Combine a devolução na biblioteca.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: r.id, gameId: r.game.id },
        dedupeKey: `RENTAL_DUE_24H:${r.id}:${startOfDay(now).toISOString()}`,
      });
    }

    
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const dueToday = await prisma.rental.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        endDate: { gte: todayStart, lte: todayEnd },
      },
      select: {
        id: true,
        userId: true,
        endDate: true,
        game: { select: { id: true, title: true } },
      },
    });

    for (const r of dueToday) {
      await notifyUser({
        userId: r.userId,
        type: NotificationType.RENTAL_DUE_TODAY,
        title: "Seu aluguel vence hoje 📌",
        body: `O jogo "${r.game.title}" vence hoje. Devolva na Biblioteca IFMA - Campus Timon.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: r.id, gameId: r.game.id },
        dedupeKey: `RENTAL_DUE_TODAY:${r.id}:${todayStart.toISOString()}`,
      });
    }

  
    const overdue = await prisma.rental.findMany({
      where: {
        status: { in: OPEN_STATUSES },
        endDate: { lt: now },
      },
      select: {
        id: true,
        userId: true,
        endDate: true,
        game: { select: { id: true, title: true } },
      },
    });

    for (const r of overdue) {
      await notifyUser({
        userId: r.userId,
        type: NotificationType.RENTAL_OVERDUE,
        title: "Devolução em atraso ⚠️",
        body: `O jogo "${r.game.title}" está em atraso. Regularize na biblioteca.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: r.id, gameId: r.game.id },
        dedupeKey: `RENTAL_OVERDUE:${r.id}:${todayStart.toISOString()}`,
      });
    }
  });
}
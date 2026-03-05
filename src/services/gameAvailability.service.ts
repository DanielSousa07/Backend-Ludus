import { prisma } from "../lib/prisma";
import { NotificationType } from "@prisma/client";
import { notifyUser } from "./notify.service";
import { sendPushToUser } from "./push.service";

export async function notifyGameBackAvailable(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, title: true, available: true },
  });
  if (!game) return;


  if (!game.available) return;

  const watchers = await prisma.gameAvailabilityWatch.findMany({
    where: { gameId: game.id },
    select: { userId: true },
  });

  for (const w of watchers) {
    const dedupeKey = `GAME_BACK_AVAILABLE:${w.userId}:${game.id}`;

    await notifyUser({
      userId: w.userId,
      type: NotificationType.GAME_BACK_AVAILABLE,
      title: "Jogo disponível novamente 🎲",
      body: `"${game.title}" voltou a ficar disponível para aluguel.`,
      channelId: "rentals",
      data: { route: `/details?id=${game.id}`, gameId: game.id },
      dedupeKey,
    });

    await sendPushToUser({
      userId: w.userId,
      title: "Jogo disponível novamente 🎲",
      body: `"${game.title}" voltou a ficar disponível para aluguel.`,
      channelId: "rentals",
      data: { route: `/details?id=${game.id}`, gameId: game.id },
    });
  }

  
  await prisma.gameAvailabilityWatch.deleteMany({ where: { gameId: game.id } });
}
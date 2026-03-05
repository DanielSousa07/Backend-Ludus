import { prisma } from "../lib/prisma";
import { NotificationType } from "@prisma/client";
import { notifyUser } from "./notify.service";
import { sendPushToUser } from "./push.service";

type LevelConfig = {
  level: number;
  name: string;
  minPoints: number;
};

const LEVELS: LevelConfig[] = [
  { level: 1, name: "Iniciante", minPoints: 0 },
  { level: 2, name: "Explorador", minPoints: 100 },
  { level: 3, name: "Estrategista", minPoints: 300 },
  { level: 4, name: "Campeão", minPoints: 700 },
  { level: 5, name: "Lenda", minPoints: 1500 },
];

export function getLevelByPoints(points: number) {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (points >= lvl.minPoints) current = lvl;
  }
  return current;
}

export function getLevelName(level: number) {
  const found = LEVELS.find((l) => l.level === level);
  return found?.name ?? "Iniciante";
}

export function getLevelsConfig() {
  return LEVELS;
}

export async function addUserPoints(params: {
  userId: string;
  delta: number;
  reason: string;
}) {
  const { userId, delta, reason } = params;

  
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, points: true, level: true },
    });
    if (!user) throw new Error("User not found");

    const prevPoints = user.points ?? 0;
    const prevLevel = user.level ?? 1;

    const nextPoints = Math.max(0, prevPoints + delta);
    const nextLevel = getLevelByPoints(nextPoints).level;

    await tx.userPointsLog.create({
      data: { userId, points: delta, reason },
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: { points: nextPoints, level: nextLevel },
      select: { id: true, name: true, points: true, level: true },
    });

    return {
      updated,
      prevPoints,
      prevLevel,
      nextPoints,
      nextLevel,
      leveledUp: nextLevel > prevLevel,
    };
  });


  try {
    if (delta > 0) {
      await notifyUser({
        userId,
        type: NotificationType.POINTS_EARNED,
        title: "Pontos recebidos ✨",
        body: `Você ganhou +${delta} pontos.`,
        channelId: "system",
        data: { route: "/ranking", delta, reason },
        dedupeKey: `POINTS_EARNED:${userId}:${reason}`,
      });

      await sendPushToUser({
        userId,
        title: "Pontos recebidos ✨",
        body: `Você ganhou +${delta} pontos.`,
        channelId: "system",
        data: { route: "/ranking" },
      });
    }

    if (result.leveledUp) {
      const levelName = getLevelName(result.nextLevel);

      await notifyUser({
        userId,
        type: NotificationType.LEVEL_UP,
        title: "Você subiu de nível! 🏆",
        body: `Agora você é ${levelName} (Nível ${result.nextLevel}).`,
        channelId: "system",
        data: {
          route: "/ranking",
          level: result.nextLevel,
          levelName,
          points: result.nextPoints,
        },
        dedupeKey: `LEVEL_UP:${userId}:${result.nextLevel}`,
      });

      await sendPushToUser({
        userId,
        title: "Você subiu de nível! 🏆",
        body: `Agora você é ${levelName} (Nível ${result.nextLevel}).`,
        channelId: "system",
        data: { route: "/ranking" },
      });
    }
  } catch (e) {

    console.error("Falha ao notificar pontos/level:", e);
  }

  return result.updated;
}
import { prisma } from "../lib/prisma";

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

export async function addUserPoints(params: {
  userId: string;
  delta: number;        
  reason: string;
}) {
  const { userId, delta, reason } = params;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const nextPoints = Math.max(0, user.points + delta);
    const nextLevel = getLevelByPoints(nextPoints).level;

    await tx.userPointsLog.create({
      data: {
        userId,
        points: delta,
        reason,
      },
    });

    const updated = await tx.user.update({
      where: { id: userId },
      data: { points: nextPoints, level: nextLevel },
      select: { id: true, name: true, points: true, level: true },
    });

    return updated;
  });
}

export function getLevelName(level: number) {
  const found = LEVELS.find((l) => l.level === level);
  return found?.name ?? "Iniciante";
}

export function getLevelsConfig() {
  return LEVELS;
}
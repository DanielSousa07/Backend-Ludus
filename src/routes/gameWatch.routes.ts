import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";

export const gameWatchRoutes = Router();


gameWatchRoutes.post("/:gameId/watch", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const userId = req.user.id;
  const { gameId } = req.params;

  const game = await prisma.game.findUnique({ where: { id: String(gameId) }, select: { id: true, available: true } });
  if (!game) return res.status(404).json({ error: "Jogo não encontrado" });

 
  if (game.available) {
    return res.status(409).json({ error: "Este jogo já está disponível.", code: "GAME_ALREADY_AVAILABLE" });
  }

  await prisma.gameAvailabilityWatch.upsert({
    where: { userId_gameId: { userId, gameId: game.id } },
    update: {},
    create: { userId, gameId: game.id },
  });

  return res.json({ ok: true });
});


gameWatchRoutes.delete("/:gameId/watch", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const userId = req.user.id;
  const { gameId } = req.params;

  await prisma.gameAvailabilityWatch.deleteMany({
    where: { userId, gameId: String(gameId) },
  });

  return res.json({ ok: true });
});


gameWatchRoutes.get("/:gameId/watch", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const userId = req.user.id;
  const { gameId } = req.params;

  const exists = await prisma.gameAvailabilityWatch.findFirst({
    where: { userId, gameId: String(gameId) },
    select: { id: true },
  });

  return res.json({ watching: !!exists });
});
import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { prisma } from "../lib/prisma";

const favoritesRoutes = Router();

favoritesRoutes.use(ensureAuthenticated);


favoritesRoutes.get("/", async (req, res) => {
  const favorites = await prisma.favorite.findMany({
    where: { userId: req.user.id },
    include: {
      game: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const formatted = favorites.map((f) => ({
    id: f.game.id,
    title: f.game.title,
    cover: f.game.cover,
    price: f.game.price,
    rating: f.game.rating,
  }));

  res.json(formatted);
});


favoritesRoutes.post("/:gameId", async (req, res) => {
  const { gameId } = req.params;

  try {
    await prisma.favorite.create({
      data: {
        userId: req.user.id,
        gameId,
      },
    });

    res.status(201).json({ ok: true });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Já favoritado" });
    }
    res.status(400).json({ error: "Erro ao favoritar" });
  }
});

favoritesRoutes.delete("/:gameId", async (req, res) => {
  const { gameId } = req.params;

  await prisma.favorite.deleteMany({
    where: {
      userId: req.user.id,
      gameId,
    },
  });

  res.json({ ok: true });
});

favoritesRoutes.get("/check/:gameId", async (req, res) => {
  const { gameId } = req.params;

  const fav = await prisma.favorite.findUnique({
    where: {
      userId_gameId: {
        userId: req.user.id,
        gameId: String(gameId),
      },
    },
    select: { id: true },
  });

  return res.json({ isFavorite: !!fav });
});

export { favoritesRoutes };
import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { prisma } from "../lib/prisma";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";

const favoritesRoutes = Router();

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

favoritesRoutes.use(ensureAuthenticated);

favoritesRoutes.get("/", async (req, res) => {
  try {
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

    return res.json(formatted);
  } catch (err) {
    console.error("Erro ao listar favoritos:", err);
    return res.status(500).json({ error: "Erro ao listar favoritos" });
  }
});

favoritesRoutes.post("/:gameId", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const gameId = getParam(req.params.gameId);

  if (!gameId) {
    return res.status(400).json({ error: "gameId inválido" });
  }

  try {
    await prisma.favorite.create({
      data: {
        userId: req.user.id,
        gameId,
      },
    });

    return res.status(201).json({ ok: true });
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Já favoritado" });
    }
    console.error("Erro ao favoritar:", err);
    return res.status(400).json({ error: "Erro ao favoritar" });
  }
});

favoritesRoutes.delete("/:gameId", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const gameId = getParam(req.params.gameId);

  if (!gameId) {
    return res.status(400).json({ error: "gameId inválido" });
  }

  try {
    await prisma.favorite.deleteMany({
      where: {
        userId: req.user.id,
        gameId,
      },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao desfavoritar:", err);
    return res.status(500).json({ error: "Erro ao remover favorito" });
  }
});

favoritesRoutes.get("/check/:gameId", async (req, res) => {
  const gameId = getParam(req.params.gameId);

  if (!gameId) {
    return res.status(400).json({ error: "gameId inválido" });
  }

  try {
    const fav = await prisma.favorite.findUnique({
      where: {
        userId_gameId: {
          userId: req.user.id,
          gameId,
        },
      },
      select: { id: true },
    });

    return res.json({ isFavorite: !!fav });
  } catch (err) {
    console.error("Erro ao verificar favorito:", err);
    return res.status(500).json({ error: "Erro ao verificar favorito" });
  }
});

export { favoritesRoutes };
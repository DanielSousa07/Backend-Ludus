import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";
import { prisma } from "../lib/prisma";
import { searchLudopedia, getLudopediaGameDetails } from "../services/ludopedia.service";
import { searchBGG, getBGGDetails } from "../services/bgg.services";
import { translateToPT } from "../services/translate.service";

const gameRoutes = Router();


gameRoutes.get(
  "/search-ludopedia",
  ensureAuthenticated,
  ensureAdmin,
  async (req, res) => {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: "O termo de busca é obrigatório" });
    }

    try {
      const results = await searchLudopedia(String(q));
      return res.json(results);
    } catch (err) {
      return res.status(500).json({ error: "Falha na comunicação com a Ludopedia" });
    }
  }
);


gameRoutes.get("/", async (req, res) => {
  const { q, status, players, age, priceMin, priceMax, timeMax, stars } = req.query;

  const where: any = {};


  if (q && String(q).trim()) {
    const term = String(q).trim();

    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
    ];
  }


  if (status && String(status) !== "ALL") {
    const st = String(status);

    if (st === "AVAILABLE") {

      const availableCondition = {
        OR: [

          { copies: { some: { available: true } } },


          {
            AND: [
              { available: true },
              {
                OR: [
                  { allowOriginalRental: true },
                  { copies: { none: {} } },
                ],
              },
            ],
          },
        ],
      };


      if (where.OR) {
        where.AND = [...(where.AND ?? []), availableCondition];
      } else {
        Object.assign(where, availableCondition);
      }
    } else {

      const unavailableCondition = {
        AND: [

          { copies: { none: { available: true } } },

          {
            OR: [
              { available: false },
              { allowOriginalRental: false },
            ],
          },
        ],
      };

      if (where.OR) {
        where.AND = [...(where.AND ?? []), unavailableCondition];
      } else {
        Object.assign(where, unavailableCondition);
      }
    }
  }


  if (priceMin || priceMax) {
    where.price = {
      gte: priceMin ? parseFloat(String(priceMin)) : 0,
      lte: priceMax ? parseFloat(String(priceMax)) : 1000,
    };
  }

  if (timeMax && String(timeMax) !== "null") {
    const time = Number(timeMax);
    if (!isNaN(time)) where.maxTime = { lte: time };
  }


  if (players && String(players) !== "null") {
    const p = Number(players);
    if (!isNaN(p)) where.maxPlayers = { lte: p };
  }


  if (age && String(age) !== "null") {
    const a = Number(age);
    if (!isNaN(a)) where.minAge = { lte: a };
  }


  if (stars && String(stars).trim()) {
    const list = String(stars)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => [1, 2, 3, 4, 5].includes(n));

    if (list.length) {

      const starsOr = {
        OR: list.map((n) => {
          const min = n - 0.5;
          const max = n === 5 ? 5.0 : n + 0.5 - 0.0001;
          return { rating: { gte: min, lte: max } };
        }),
      };

      if (where.OR) {
        where.AND = [...(where.AND ?? []), starsOr];
      } else {
        Object.assign(where, starsOr);
      }
    }
  }

  try {
    const games = await prisma.game.findMany({
      where,
      orderBy: { title: "asc" },
      include: {
        _count: { select: { copies: true } },
        copies: { select: { available: true } },
      },
    });

    const mapped = games.map((g) => {
      const copiesCount = g._count?.copies ?? 0;
      const availableCopiesCount = (g.copies ?? []).filter((c) => c.available).length;


      const isAvailableNow =
        availableCopiesCount > 0 ||
        (availableCopiesCount === 0 &&
          g.available === true &&
          (g.allowOriginalRental === true || copiesCount === 0));

      const { copies, _count, ...rest } = g as any;

      return {
        ...rest,
        copiesCount,
        availableCopiesCount,
        isAvailableNow,
      };
    });

    return res.json(mapped);
  } catch (err) {
    console.error("Erro na busca:", err);
    return res.status(500).json({ error: "Erro ao filtrar jogos" });
  }
});


gameRoutes.post("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { ludopediaId, title, cover, price, description: bodyDescription } = req.body;

  try {
    const parsedLudopediaId = Number(ludopediaId);
    const cleanTitle = String(title || "").trim();
    const parsedPrice = Number(String(price).replace(",", "."));

    if (!parsedLudopediaId || Number.isNaN(parsedLudopediaId)) {
      return res.status(400).json({ error: "ludopediaId inválido." });
    }

    if (!cleanTitle) {
      return res.status(400).json({ error: "Título é obrigatório." });
    }

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: "Preço inválido." });
    }

    const existingGame = await prisma.game.findFirst({
      where: {
        OR: [
          { ludopediaId: parsedLudopediaId },
          { title: { equals: cleanTitle, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        ludopediaId: true,
      },
    });

    if (existingGame) {
      return res.status(409).json({
        error: "Esse jogo já foi adicionado ao catálogo.",
        code: "GAME_ALREADY_EXISTS",
        existingGame,
      });
    }

    const details = await getLudopediaGameDetails(parsedLudopediaId);

    let finalDescription =
      bodyDescription?.toString()?.trim() ||
      details?.description ||
      "";

    let finalMinPlayers = details?.minPlayers || 1;
    let finalMaxPlayers = details?.maxPlayers ?? null;
    let finalMinAge = details?.minAge || 0;
    let finalMinTime = details?.minTime || 0;
    let finalMaxTime = details?.maxTime ?? null;

    try {
      const bggId = await searchBGG(cleanTitle);

      if (bggId) {
        const bggDetails = await getBGGDetails(bggId);

        if (bggDetails?.description?.trim()) {
          const translated = await translateToPT(bggDetails.description);

          if (translated?.trim()) {
            finalDescription = translated.trim();
          }
        }

        finalMinPlayers = details?.minPlayers ?? bggDetails?.minPlayers ?? 1;
        finalMaxPlayers = details?.maxPlayers ?? bggDetails?.maxPlayers ?? null;
        finalMinAge = details?.minAge ?? bggDetails?.minAge ?? 0;
        finalMinTime = details?.minTime ?? bggDetails?.minTime ?? 0;
        finalMaxTime = details?.maxTime ?? bggDetails?.maxTime ?? null;
      }
    } catch (e) {
      console.log("Erro ao enriquecer dados com BGG/tradução:", e);
    }

    const game = await prisma.game.create({
      data: {
        ludopediaId: parsedLudopediaId,
        title: cleanTitle,
        cover,
        price: parsedPrice,
        available: true,
        userId: req.user.id,

        description: finalDescription,
        rating: details?.rating || 0,
        minPlayers: finalMinPlayers,
        maxPlayers: finalMaxPlayers,
        minAge: finalMinAge,
        minTime: finalMinTime,
        maxTime: finalMaxTime,
      },
    });

    return res.status(201).json(game);
  } catch (err) {
    console.error("Erro no cadastro:", err);
    return res.status(400).json({ error: "Erro ao cadastrar jogo" });
  }
});

gameRoutes.get("/:id/components", ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) return res.status(404).json({ error: "Jogo não encontrado" });

  const components = await prisma.gameComponent.findMany({
    where: { gameId: id },
    orderBy: [{ name: "asc" }],
  });

  return res.json(components);
});


gameRoutes.post("/:id/components", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { id } = req.params;
  const name = String(req.body?.name ?? "").trim();
  const quantity = Number(req.body?.quantity ?? 1);

  if (!name) return res.status(400).json({ error: "Nome é obrigatório" });
  if (!Number.isFinite(quantity) || quantity < 1)
    return res.status(400).json({ error: "Quantidade inválida" });

  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) return res.status(404).json({ error: "Jogo não encontrado" });

  try {
    const created = await prisma.gameComponent.create({
      data: { gameId: id, name, quantity: Math.floor(quantity) },
    });
    return res.status(201).json(created);
  } catch (err: any) {

    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Esse componente já existe. Edite a quantidade." });
    }
    console.error(err);
    return res.status(500).json({ error: "Erro ao adicionar componente" });
  }
});


gameRoutes.patch("/:id/components/:componentId", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { id, componentId } = req.params;
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
  const quantity = req.body?.quantity !== undefined ? Number(req.body.quantity) : undefined;

  const comp = await prisma.gameComponent.findUnique({ where: { id: componentId } });
  if (!comp || comp.gameId !== id) return res.status(404).json({ error: "Componente não encontrado" });

  const data: any = {};
  if (name !== undefined) {
    if (!name) return res.status(400).json({ error: "Nome inválido" });
    data.name = name;
  }
  if (quantity !== undefined) {
    if (!Number.isFinite(quantity) || quantity < 1) return res.status(400).json({ error: "Quantidade inválida" });
    data.quantity = Math.floor(quantity);
  }

  try {
    const updated = await prisma.gameComponent.update({
      where: { id: componentId },
      data,
    });
    return res.json(updated);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Já existe um componente com esse nome." });
    }
    console.error(err);
    return res.status(500).json({ error: "Erro ao atualizar componente" });
  }
});


gameRoutes.delete("/:id/components/:componentId", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { id, componentId } = req.params;

  const comp = await prisma.gameComponent.findUnique({ where: { id: componentId } });
  if (!comp || comp.gameId !== id) return res.status(404).json({ error: "Componente não encontrado" });

  await prisma.gameComponent.delete({ where: { id: componentId } });
  return res.json({ ok: true });
});

gameRoutes.get("/home", async (req, res) => {
  try {
    const top = await prisma.rental.groupBy({
      by: ["gameId"],
      _count: { gameId: true },
      orderBy: { _count: { gameId: "desc" } },
      take: 6,
    });

    const topIds = top.map((t) => t.gameId);

    const topGames = topIds.length
      ? await prisma.game.findMany({
        where: { id: { in: topIds } },
        include: {
          _count: { select: { copies: true } },
          copies: { select: { available: true } },
        },
      })
      : [];

    const topById = new Map(topGames.map((g) => [g.id, g]));
    const mostRented = topIds
      .map((id) => topById.get(id))
      .filter(Boolean)
      .map((g: any) => {
        const copiesCount = g._count?.copies ?? 0;
        const availableCopiesCount = (g.copies ?? []).filter((c: any) => c.available).length;

        const isAvailableNow =
          availableCopiesCount > 0 ||
          (availableCopiesCount === 0 &&
            g.available === true &&
            (g.allowOriginalRental === true || copiesCount === 0));

        const { copies, _count, ...rest } = g;
        return { ...rest, copiesCount, availableCopiesCount, isAvailableNow };
      });

    const forYouRaw = await prisma.game.findMany({
      orderBy: [{ rating: "desc" }, { ratingsCount: "desc" }, { title: "asc" }],
      take: 3,
      include: {
        _count: { select: { copies: true } },
        copies: { select: { available: true } },
      },
    });

    const forYou = forYouRaw.map((g: any) => {
      const copiesCount = g._count?.copies ?? 0;
      const availableCopiesCount = (g.copies ?? []).filter((c: any) => c.available).length;

      const isAvailableNow =
        availableCopiesCount > 0 ||
        (availableCopiesCount === 0 &&
          g.available === true &&
          (g.allowOriginalRental === true || copiesCount === 0));

      const { copies, _count, ...rest } = g;
      return { ...rest, copiesCount, availableCopiesCount, isAvailableNow };
    });

    return res.json({ forYou, mostRented });
  } catch (err) {
    console.error("Erro ao montar home:", err);
    return res.status(500).json({ error: "Erro ao carregar dados da home" });
  }
});


gameRoutes.patch("/:id", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { id } = req.params;
  const { title, price, description, available, howToPlayUrl } = req.body;

  const data: any = {};

  if (typeof title === "string") data.title = title.trim();
  if (typeof description === "string") data.description = description;
  if (typeof available === "boolean") data.available = available;


  if (typeof howToPlayUrl === "string") {
    const clean = howToPlayUrl.trim();
    data.howToPlayUrl = clean.length ? clean : null;
  } else if (howToPlayUrl === null) {
    data.howToPlayUrl = null;
  }

  if (price !== undefined) {
    const p = Number(String(price).replace(",", "."));
    if (Number.isNaN(p) || p < 0) {
      return res.status(400).json({ error: "Preço inválido" });
    }
    data.price = p;
  }

  try {
    const updated = await prisma.game.update({
      where: { id: String(id) },
      data,
    });

    return res.json(updated);
  } catch (err: any) {
    console.error("Erro ao atualizar jogo:", err);

    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    return res.status(500).json({ error: "Erro ao atualizar jogo" });
  }
});

gameRoutes.delete("/:id", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const rentalsCount = await prisma.rental.count({
      where: { gameId: String(id) },
    });

    if (rentalsCount > 0) {
      return res.status(409).json({
        error: "Não é possível excluir este jogo porque ele possui histórico de aluguel.",
        code: "GAME_HAS_RENTALS",
      });
    }

    await prisma.game.delete({
      where: { id: String(id) },
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("Erro ao excluir jogo:", err);

    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    return res.status(500).json({ error: "Erro ao excluir jogo" });
  }
});


gameRoutes.get("/:id", ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const game = await prisma.game.findUnique({
      where: { id: String(id) },
    });

    if (!game) {
      return res.status(404).json({ error: "Jogo não encontrado" });
    }

    const myRating = await prisma.gameRating.findUnique({
      where: { userId_gameId: { userId: req.user.id, gameId: String(id) } },
    });

    return res.json({
      ...game,
      myRating: myRating?.value ?? null,
    });
  } catch (err) {
    console.error("Erro ao buscar jogo", err);
    return res.status(500).json({ error: "Erro ao buscar detalhes do jogo" });
  }
});


gameRoutes.post("/:id/rating", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const { id } = req.params;
  const value = Number(req.body?.value);

  if (![1, 2, 3, 4, 5].includes(value)) {
    return res.status(400).json({ error: "value deve ser de 1 a 5" });
  }

  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) {
    return res.status(404).json({ error: "Jogo não encontrado" });
  }

  const hasReturnedRental = await prisma.rental.findFirst({
    where: {
      userId: req.user.id,
      gameId: id,
      status: "RETURNED",
    },
  });

  if (!hasReturnedRental) {
    return res.status(403).json({
      error: "Você só pode avaliar jogos que já alugou e devolveu.",
      code: "CANNOT_RATE",
    });
  }

  await prisma.gameRating.upsert({
    where: {
      userId_gameId: { userId: req.user.id, gameId: id },
    },
    create: { userId: req.user.id, gameId: id, value },
    update: { value },
  });

  const agg = await prisma.gameRating.aggregate({
    where: { gameId: id },
    _avg: { value: true },
    _count: { value: true },
  });

  const avg = Number(agg._avg.value ?? 0);
  const count = Number(agg._count.value ?? 0);

  await prisma.game.update({
    where: { id },
    data: { rating: avg, ratingsCount: count },
  });

  return res.json({
    ok: true,
    avgRating: avg,
    ratingsCount: count,
    myRating: value,
  });
});

gameRoutes.get("/:id/can-rate", ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  const rental = await prisma.rental.findFirst({
    where: {
      userId: req.user.id,
      gameId: id,
      status: "RETURNED",
    },
    select: { id: true },
  });

  return res.json({ canRate: !!rental });
});

export { gameRoutes };
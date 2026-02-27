import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { searchLudopedia } from "../services/ludopedia.service";
import { prisma } from "../lib/prisma"; //
import { getLudopediaGameDetails } from "../services/ludopedia.service";
import { error } from "node:console";
import { addUserPoints } from "../services/engagement.service";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";

const gameRoutes = Router();


gameRoutes.get("/search-ludopedia", ensureAuthenticated, ensureAdmin, async (req, res) => {
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
});



gameRoutes.get("/", async (req, res) => {
    const { q, status, players, age, priceMin, priceMax, timeMax, stars } = req.query;

    const where: any = {};

    if (q) where.title = { contains: String(q), mode: "insensitive" };

    if (status && status !== "ALL") {
        // ATENÇÃO: isso filtra só o ORIGINAL
        where.available = status === "AVAILABLE";
    }

    if (priceMin || priceMax) {
        where.price = {
            gte: priceMin ? parseFloat(String(priceMin)) : 0,
            lte: priceMax ? parseFloat(String(priceMax)) : 1000,
        };
    }

    if (timeMax && timeMax !== "null") {
        const time = Number(timeMax);
        if (!isNaN(time)) where.maxTime = { lte: time };
    }

    if (players && players !== "null") {
        const p = Number(players);
        if (!isNaN(p)) where.maxPlayers = { lte: p };
    }

    if (age && age !== "null") {
        const a = Number(age);
        if (!isNaN(a)) where.minAge = { lte: a };
    }


    if (stars && String(stars).trim()) {
        const list = String(stars)
            .split(",")
            .map((s) => Number(s.trim()))
            .filter((n) => [1, 2, 3, 4, 5].includes(n));

        if (list.length) {
            where.OR = list.map((n) => {
                const min = n - 0.5;
                const max = n === 5 ? 5.0 : n + 0.5 - 0.0001;
                return { rating: { gte: min, lte: max } };
            });
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
                (availableCopiesCount === 0 && g.available === true && (g.allowOriginalRental === true || copiesCount === 0));


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
    const { ludopediaId, title, cover, price, description } = req.body;

    try {

        const details = await getLudopediaGameDetails(Number(ludopediaId));

        const game = await prisma.game.create({
            data: {
                ludopediaId: Number(ludopediaId),
                title,
                cover,
                price: parseFloat(price),
                available: true,
                userId: req.user.id,


                description: description?.toString() || "",
                rating: details?.rating || 0,
                minPlayers: details?.minPlayers || 1,
                maxPlayers: details?.maxPlayers,
                minAge: details?.minAge || 0,
                maxTime: details?.maxTime,
            }
        });

        return res.status(201).json(game);
    } catch (err) {
        console.error("Erro no cadastro:", err);
        return res.status(400).json({ error: "Erro ao cadastrar jogo" });
    }
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
                    (availableCopiesCount === 0 && g.available === true && (g.allowOriginalRental === true || copiesCount === 0));

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
                (availableCopiesCount === 0 && g.available === true && (g.allowOriginalRental === true || copiesCount === 0));

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
    const { title, price, description, available } = req.body;

    const data: any = {};

    if (typeof title === "string") data.title = title.trim();
    if (typeof description === "string") data.description = description;
    if (typeof available === "boolean") data.available = available;

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
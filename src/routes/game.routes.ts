import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { searchLudopedia } from "../services/ludopedia.service";
import { prisma } from "../lib/prisma"; //
import { getLudopediaGameDetails } from "../services/ludopedia.service";
import { error } from "node:console";

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
    const { q, status, players, age, priceMin, priceMax, timeMax } = req.query;

    const where: any = {};

    if (q) {
        where.title = { contains: String(q), mode: 'insensitive' };
    }

    if (status && status !== 'ALL') {
        where.available = status === 'AVAILABLE';
    }

    if (priceMin || priceMax) {
        where.price = {
            gte: priceMin ? parseFloat(String(priceMin)) : 0,
            lte: priceMax ? parseFloat(String(priceMax)) : 1000
        };
    }


    if (timeMax && timeMax !== 'null') {
        const time = Number(timeMax);
        if (!isNaN(time)) {
            where.maxTime = { lte: time };
        }
    }


    if (players && players !== 'null') {
        const p = Number(players);
        if (!isNaN(p)) {
            where.maxPlayers = { lte: p };
        }
    }


    if (age && age !== 'null') {
        const a = Number(age);
        if (!isNaN(a)) {
            where.minAge = { lte: a };
        }
    }

    try {
        const games = await prisma.game.findMany({
            where,
            orderBy: { title: 'asc' }
        });
        return res.json(games);
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

gameRoutes.get("/:id", async (req, res) => {
    const { id } = req.params

    try {
        const game = await prisma.game.findUnique({
            where: { id: String(id) },
        })

        if (!game) {
            return res.status(404).json({ error: "Jogo não encontrado" });
        }
        return res.json(game);
    } catch (err) {
        console.error("Erro ao buscar jogo", err);
        return res.status(500).json({ error: "Erro ao buscar detalhes do jogo" })
    }
})

gameRoutes.post("/:id/rating", ensureAuthenticated, async (req, res) => {
    const { id } = req.params
    const value = Number(req.body?.value);

    if (![1, 2, 3, 4, 5].includes(value)) {
        return res.status(400).json({ error: "value deve ser de 1 a 5" });
    }

    const game = await prisma.game.findUnique({ where: { id } });
    if (!game) return res.status(404).json({ error: "Jogo não encontrado" });

    await prisma.gameRating.upsert({
        where: { userId_gameId: { userId: req.user.id, gameId: id } },
        create: { userId: req.user.id, gameId: id, value },
        update: { value },

    })

    const agg = await prisma.gameRating.aggregate({
        where: {gameId: id},
        _avg: {value: true},
        _count: {value: true},

    });

    const avg = Number(agg._avg.value ?? 0);
    const count = Number(agg._count.value ?? 0);

    await prisma.game.update({
        where: {id},
        data: {rating: avg, ratingsCount: count},

    });

    return res.json({ok: true, acgRating: avg, ratingsCount: count, myRating: value})
})

export { gameRoutes };
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

// src/routes/game.routes.ts

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
    
    // 1. FILTRO DE TEMPO: Usando maxTime (o campo que você tem no banco)
    if (timeMax && timeMax !== 'null') {
        const time = Number(timeMax);
        if (!isNaN(time)) {
            where.maxTime = { lte: time }; // Jogos com tempo máximo até X
        }
    }

    // 2. FILTRO DE JOGADORES: "Suporta este número ou menos"
    if (players && players !== 'null') {
        const p = Number(players);
        if (!isNaN(p)) {
            where.maxPlayers = { lte: p }; // maxPlayers no banco deve ser <= selecionado
        }
    }

    // 3. FILTRO DE IDADE: "Idade selecionada ou menos"
    if (age && age !== 'null') {
        const a = Number(age);
        if (!isNaN(a)) {
            where.minAge = { lte: a }; // minAge no banco deve ser <= selecionado
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
    const { ludopediaId, title, cover, price } = req.body;

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
                
                
                description: details?.description || "",
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

export { gameRoutes };
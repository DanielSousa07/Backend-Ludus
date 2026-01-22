import { Router } from "express";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { searchLudopedia } from "../services/ludopedia.service"; 
import { prisma } from "../lib/prisma"; //

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


gameRoutes.post("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { ludopediaId, title, cover, price } = req.body;

    try {
        const game = await prisma.game.create({
            data: {
                ludopediaId: Number(ludopediaId),
                title,
                cover,
                price: parseFloat(price),
                available: true,
                userId: req.user.id 
            }
        });

        return res.status(201).json(game);
    } catch (err) {
        return res.status(400).json({ error: "Erro ao cadastrar jogo no acervo" });
    }
});

export { gameRoutes };
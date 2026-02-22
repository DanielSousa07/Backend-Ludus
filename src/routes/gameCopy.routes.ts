import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";

export const gameCopyRoutes = Router();

function formatCopyCode(title: string, num: number) {
    const slug = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .toUpperCase()
        .slice(0, 12);

    return `${slug}-${String(num).padStart(3, "0")}`;
}


gameCopyRoutes.get("/:gameId/copies", ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { gameId } = req.params;

    try {
        const game = await prisma.game.findUnique({ where: { id: String(gameId) } });
        if (!game) return res.status(404).json({ error: "Jogo não encontrado" });

        const copies = await prisma.gameCopy.findMany({
            where: { gameId: String(gameId) },
            orderBy: { createdAt: "desc" },
        });

        return res.json(copies);
    } catch (err) {
        console.error("Erro ao listar exemplares:", err);
        return res.status(500).json({ error: "Erro ao listar exemplares" });
    }
});


gameCopyRoutes.post("/:gameId/copies", ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { gameId } = req.params;
    const { condition } = req.body;

    try {
        const copy = await prisma.$transaction(async (tx) => {
            const game = await tx.game.findUnique({ where: { id: String(gameId) } });
            if (!game) {
                const e: any = new Error("GAME_NOT_FOUND");
                e.code = "GAME_NOT_FOUND";
                throw e;
            }

            const max = await tx.gameCopy.aggregate({
                where: { gameId: String(gameId) },
                _max: { number: true },
            });

            const nextNumber = (max._max.number ?? 0) + 1;
            const code = formatCopyCode(game.title, nextNumber);

            return tx.gameCopy.create({
                data: {
                    gameId: String(gameId),
                    number: nextNumber,
                    code,
                    condition: typeof condition === "string" ? condition.trim() : null,
                    available: true,
                },
            });
        });

        return res.status(201).json(copy);
    } catch (err: any) {
        if (err?.code === "GAME_NOT_FOUND") {
            return res.status(404).json({ error: "Jogo não encontrado" });
        }

        
        if (err?.code === "P2002") {
            return res.status(409).json({ error: "Conflito ao gerar número do exemplar. Tente novamente." });
        }

        console.error("Erro ao criar exemplar:", err);
        return res.status(500).json({ error: "Erro ao criar exemplar" });
    }
});


gameCopyRoutes.patch("/copies/:copyId", ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { copyId } = req.params;
    const { code, condition, available } = req.body;

    const data: any = {};
    if (typeof code === "string") data.code = code.trim();
    if (typeof condition === "string") data.condition = condition.trim();
    if (typeof available === "boolean") data.available = available;

    try {
        const updated = await prisma.gameCopy.update({
            where: { id: String(copyId) },
            data,
        });

        return res.json(updated);
    } catch (err: any) {
        console.error("Erro ao atualizar exemplar:", err);
        if (err?.code === "P2025") return res.status(404).json({ error: "Exemplar não encontrado" });
        return res.status(500).json({ error: "Erro ao atualizar exemplar" });
    }
});


gameCopyRoutes.delete("/copies/:copyId", ensureAuthenticated, ensureAdmin, async (req, res) => {
    const { copyId } = req.params;

    try {
        const rentalsCount = await prisma.rental.count({ where: { copyId: String(copyId) } });
        if (rentalsCount > 0) {
            return res.status(409).json({
                error: "Não é possível excluir este exemplar porque ele possui histórico de aluguel.",
                code: "COPY_HAS_RENTALS",
            });
        }

        await prisma.gameCopy.delete({ where: { id: String(copyId) } });
        return res.json({ ok: true });
    } catch (err: any) {
        console.error("Erro ao excluir exemplar:", err);
        if (err?.code === "P2025") return res.status(404).json({ error: "Exemplar não encontrado" });
        return res.status(500).json({ error: "Erro ao excluir exemplar" });
    }
});
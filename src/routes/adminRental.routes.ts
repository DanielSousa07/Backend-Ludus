import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";

export const adminRentalRoutes = Router();


adminRentalRoutes.get("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { status, q, overdue } = req.query;

  const where: any = {};

  if (status && typeof status === "string" && status !== "ALL") {
    where.status = status;
  }

  
  if (overdue === "true") {
    where.endDate = { lt: new Date() };
    where.status = { in: ["PENDING", "ACTIVE"] };
  }

  if (q && typeof q === "string" && q.trim()) {
    const term = q.trim();
    where.OR = [
      { game: { title: { contains: term, mode: "insensitive" } } },
      { user: { name: { contains: term, mode: "insensitive" } } },
      { user: { email: { contains: term, mode: "insensitive" } } },
      { copy: { code: { contains: term, mode: "insensitive" } } },
    ];
  }

  try {
    const rentals = await prisma.rental.findMany({
      where,
      orderBy: { startDate: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        game: { select: { id: true, title: true, cover: true, price: true } },
        copy: { select: { id: true, code: true, number: true, condition: true } },
      },
    });

    return res.json(rentals);
  } catch (err) {
    console.error("Erro ao listar aluguéis (admin):", err);
    return res.status(500).json({ error: "Erro ao listar aluguéis" });
  }
});


adminRentalRoutes.patch("/:id/status", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status?: string };

  if (!["ACTIVE", "RETURNED", "CANCELED"].includes(String(status))) {
    return res.status(400).json({ error: "status inválido" });
  }

  try {
    const rental = await prisma.rental.findUnique({ where: { id: String(id) } });
    if (!rental) return res.status(404).json({ error: "Aluguel não encontrado" });

    
    if (["RETURNED", "CANCELED"].includes(rental.status) && status !== rental.status) {
      return res.status(409).json({ error: "Aluguel já finalizado", code: "RENTAL_FINALIZED" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      
      if (status === "RETURNED" || status === "CANCELED") {
        if (rental.copyId) {
          await tx.gameCopy.update({
            where: { id: rental.copyId },
            data: { available: true },
          });
        } else {
          await tx.game.update({
            where: { id: rental.gameId },
            data: { available: true },
          });
        }
      }

      return tx.rental.update({
        where: { id: rental.id },
        data: { status },
      });
    });

    return res.json(updated);
  } catch (err) {
    console.error("Erro ao atualizar status (admin):", err);
    return res.status(500).json({ error: "Erro ao atualizar aluguel" });
  }
});
import { Router } from "express";
import { RentalStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { addUserPoints } from "../services/engagement.service";

export const adminRentalRoutes = Router();

adminRentalRoutes.get("/", ensureAuthenticated, ensureAdmin, async (req, res) => {
  const { status, q, overdue } = req.query;

  const where: any = {};

  if (typeof status === "string" && status !== "ALL") {
    if (!Object.values(RentalStatus).includes(status as RentalStatus)) {
      return res.status(400).json({ error: "status inválido" });
    }
    where.status = status as RentalStatus;
  }

  if (overdue === "true") {
    where.endDate = { lt: new Date() };
    where.status = { in: [RentalStatus.PENDING, RentalStatus.ACTIVE] };
  }

  if (typeof q === "string" && q.trim()) {
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
  const { status } = req.body as { status?: RentalStatus };

  if (!status) {
    return res.status(400).json({ error: "status é obrigatório" });
  }

  const ALLOWED: RentalStatus[] = [
    RentalStatus.ACTIVE,
    RentalStatus.RETURNED,
    RentalStatus.CANCELED,
  ];

  if (!ALLOWED.includes(status)) {
    return res.status(400).json({ error: "status inválido" });
  }

  try {
    const rental = await prisma.rental.findUnique({ where: { id: String(id) } });
    if (!rental) return res.status(404).json({ error: "Aluguel não encontrado" });

    const FINALIZED: RentalStatus[] = [RentalStatus.RETURNED, RentalStatus.CANCELED];

    if (FINALIZED.includes(rental.status) && status !== rental.status) {
      return res.status(409).json({ error: "Aluguel já finalizado", code: "RENTAL_FINALIZED" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (status === RentalStatus.RETURNED || status === RentalStatus.CANCELED) {
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

    if (status === RentalStatus.RETURNED) {
      try {
        await addUserPoints({
          userId: updated.userId,
          delta: 5,
          reason: `ADMIN_RENTAL_RETURNED:${updated.id}`,
        });
      } catch (pointsErr) {
        console.error("Falha ao adicionar pontos (admin return):", pointsErr);
      }
    }

    return res.json(updated);
  } catch (err) {
    console.error("Erro ao atualizar status (admin):", err);
    return res.status(500).json({ error: "Erro ao atualizar aluguel" });
  }
});
import { Router } from "express";
import { RentalStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureAdmin } from "../middlewares/ensureAdmin";
import { addUserPoints } from "../services/engagement.service";
import { notifyUser } from "../services/notify.service";
import { NotificationType } from "@prisma/client";
import { notifyGameBackAvailable } from "../services/gameAvailability.service";

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
    const rental = await prisma.rental.findUnique({ 
    where: { id: String(id) },
    include: { game: { select: { title: true } }, user: { select: { name: true } } }
  });

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
    
    if (status === RentalStatus.RETURNED || status === RentalStatus.CANCELED) {
      notifyGameBackAvailable(updated.gameId).catch(err => 
        console.error("Erro ao notificar disponibilidade:", err)
      );
    }
    
    if (status === RentalStatus.ACTIVE) {
    try {
    
    await addUserPoints({
      userId: updated.userId,
      delta: 7,
      reason: `RENTAL_CONFIRMED_BY_ADMIN:${updated.id}`,
    });

  
    await notifyUser({
      userId: updated.userId,
      type: "RENTAL_CREATED", 
      title: "Aluguel Confirmado! ✅",
      body: `Sua retirada de "${rental.game.title}" foi confirmada. O prazo de devolução é até ${updated.endDate.toLocaleDateString('pt-BR')}.`,
      channelId: "rentals",
      data: { route: "/rentals", rentalId: updated.id },
    });
  } catch (err) {
    console.error("Erro ao processar pontos ou notificação de confirmação:", err);
  }
  }

 if (status === RentalStatus.RETURNED) {
  try {
    
    const isOverdue = new Date() > rental.endDate;
    
    
    const pointsDelta = isOverdue ? -5 : 5;
    const reasonPrefix = isOverdue ? "RENTAL_RETURNED_LATE" : "RENTAL_RETURNED_ON_TIME";

    
    await addUserPoints({
      userId: updated.userId,
      delta: pointsDelta,
      reason: `${reasonPrefix}:${updated.id}`,
    });

    
    await notifyUser({
      userId: updated.userId,
      type: "RENTAL_RETURN_CONFIRMED",
      title: isOverdue ? "Jogo Devolvido 📥" : "Parabéns pela Devolução! 🏆",
      body: isOverdue 
        ? `Você devolveu "${rental.game.title}". Tente cumprir o prazo na próxima vez para manter seus pontos altos e evitar suspensões.`
        : `Obrigado por devolver "${rental.game.title}" no prazo! Você ganhou ${pointsDelta} pontos e está mais perto do próximo nível.`,
      channelId: "rentals",
      data: { route: "/rentals" },
    });

  } catch (err) {
    console.error("Erro ao processar pontos ou notificação de devolução:", err);
  }
}
    return res.json(updated);
  } catch (err) {
    console.error("Erro ao atualizar status (admin):", err);
    return res.status(500).json({ error: "Erro ao atualizar aluguel" });
  }
});
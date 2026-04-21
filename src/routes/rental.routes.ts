import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";
import { notifyUser } from "../services/notify.service";
import { notifyGameBackAvailable } from "../services/gameAvailability.service";
import {
  canClientRentTier,
  incrementRentalCountAndMaybePromote,
} from "../services/category.service";

export const rentalRoutes = Router();

const RENTAL_DAYS = 3;

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

rentalRoutes.post("/", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const userId = req.user.id;
  const { gameId, copyId } = req.body;

  if (!gameId) {
    return res.status(400).json({ error: "gameId é obrigatório" });
  }

  const endDate = addDays(new Date(), RENTAL_DAYS);

  try {
    const result = await prisma.$transaction(async (tx) => {


      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          clientCategory: true,
        },
      });

      if (!user) {
        return {
          status: 404,
          body: { error: "Usuário não encontrado" },
        } as const;
      }


      const activeCount = await tx.rental.count({
        where: {
          userId,
          status: { in: ["PENDING", "ACTIVE"] },
        },
      });

      if (activeCount >= 2) {
        return {
          status: 409,
          body: {
            error: "Você já possui 2 aluguéis em aberto.",
            code: "RENTAL_LIMIT_REACHED",
          },
        } as const;
      }


      const game = await tx.game.findUnique({
        where: { id: String(gameId) },
        select: {
          id: true,
          title: true,
          cover: true,
          available: true,
          allowOriginalRental: true,
          isActive: true,
          isVisible: true,
          tier: true, 
        },
      });

      if (!game || !game.isActive || !game.isVisible) {
        return {
          status: 404,
          body: { error: "Jogo não encontrado" },
        } as const;
      }


      if (game.tier) {
        const allowed = canClientRentTier(
          user.clientCategory,
          game.tier
        );

        if (!allowed) {
          return {
            status: 403,
            body: {
              error: "Sua categoria não permite alugar este jogo.",
              code: "TIER_ACCESS_DENIED",
            },
          } as const;
        }
      }

 
      if (!copyId && game.allowOriginalRental === false) {
        const copiesCount = await tx.gameCopy.count({
          where: { gameId: game.id },
        });

        if (copiesCount > 0) {
          return {
            status: 409,
            body: {
              error: "Este jogo só pode ser alugado por exemplar.",
              code: "ONLY_COPIES_ALLOWED",
            },
          } as const;
        }
      }


      if (copyId) {
        const copy = await tx.gameCopy.findUnique({
          where: { id: String(copyId) },
        });

        if (!copy || copy.gameId !== game.id) {
          return {
            status: 404,
            body: { error: "Exemplar não encontrado" },
          } as const;
        }

        if (!copy.available) {
          return {
            status: 409,
            body: {
              error: "Exemplar indisponível",
              code: "COPY_UNAVAILABLE",
            },
          } as const;
        }

        await tx.gameCopy.update({
          where: { id: copy.id },
          data: { available: false },
        });

        const rental = await tx.rental.create({
          data: {
            userId,
            gameId: game.id,
            copyId: copy.id,
            endDate,
            status: "PENDING",
            gameTitleSnapshot: game.title,
            gameCoverSnapshot: game.cover ?? null,
          },
        });

        return {
          status: 201,
          body: { ...rental, rentalDays: RENTAL_DAYS },
        } as const;
      }

      if (!game.available) {
        return {
          status: 409,
          body: {
            error: "Jogo indisponível",
            code: "GAME_UNAVAILABLE",
          },
        } as const;
      }

      await tx.game.update({
        where: { id: game.id },
        data: { available: false },
      });

      const rental = await tx.rental.create({
        data: {
          userId,
          gameId: game.id,
          endDate,
          status: "PENDING",
          gameTitleSnapshot: game.title,
          gameCoverSnapshot: game.cover ?? null,
        },
      });

      return {
        status: 201,
        body: { ...rental, rentalDays: RENTAL_DAYS },
      } as const;
    });

 
    if (result.status === 201 && "id" in result.body) {
      await incrementRentalCountAndMaybePromote(userId); // 👈 evolução automática

      const game = await prisma.game.findUnique({
        where: { id: String(gameId) },
        select: { title: true },
      });

      await notifyUser({
        userId,
        type: "RENTAL_CREATED",
        title: "Solicitação realizada 🎲",
        body: `Aluguel de "${game?.title}" realizado.`,
        channelId: "rentals",
      });
    }

    return res.status(result.status).json(result.body);

  } catch (err) {
    console.error("Erro ao criar aluguel:", err);
    return res.status(500).json({ error: "Erro ao criar aluguel" });
  }
});
rentalRoutes.get("/me", ensureAuthenticated, async (req, res) => {
  try {
    const rentals = await prisma.rental.findMany({
      where: { userId: req.user.id },
      orderBy: { startDate: "desc" },
      include: {
        game: {
          select: {
            id: true,
            title: true,
            cover: true,
            isActive: true,
            isVisible: true,
          },
        },
        copy: {
          select: {
            id: true,
            code: true,
            number: true,
          },
        },
      },
    });

    const mapped = rentals.map((r) => ({
      ...r,
      game: r.game
        ? r.game
        : {
            id: null,
            title: r.gameTitleSnapshot,
            cover: r.gameCoverSnapshot,
            isActive: false,
            isVisible: false,
          },
      copy: r.copy
        ? r.copy
        : r.copyCodeSnapshot || r.copyNumberSnapshot
        ? {
            id: null,
            code: r.copyCodeSnapshot,
            number: r.copyNumberSnapshot,
          }
        : null,
    }));

    return res.json(mapped);
  } catch (err) {
    console.error("Erro ao listar aluguéis:", err);
    return res.status(500).json({ error: "Erro ao listar aluguéis" });
  }
});

rentalRoutes.patch("/:id/cancel", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const rental = await prisma.rental.findUnique({
      where: { id: String(id) },
      include: {
        game: {
          select: {
            id: true,
            title: true,
          },
        },
        copy: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!rental || rental.userId !== userId) {
      return res.status(404).json({ error: "Aluguel não encontrado." });
    }

    if (rental.status !== "PENDING") {
      return res.status(409).json({
        error: "Só é possível cancelar um aluguel que ainda está pendente.",
        code: "ONLY_PENDING_CAN_CANCEL",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (rental.copyId && rental.copy) {
        await tx.gameCopy.update({
          where: { id: rental.copyId },
          data: { available: true },
        });
      } else if (rental.gameId && rental.game) {
        await tx.game.update({
          where: { id: rental.gameId },
          data: { available: true },
        });
      }

      return await tx.rental.update({
        where: { id: rental.id },
        data: { status: "CANCELED" },
        include: {
          game: {
            select: {
              id: true,
              title: true,
              cover: true,
            },
          },
          copy: {
            select: {
              id: true,
              code: true,
              number: true,
            },
          },
        },
      });
    });

    try {
      await notifyUser({
        userId,
        type: "SYSTEM_ANNOUNCEMENT",
        title: "Aluguel cancelado",
        body: `Seu aluguel de "${rental.game?.title || rental.gameTitleSnapshot}" foi cancelado com sucesso.`,
        channelId: "rentals",
        data: { route: "/rentals", rentalId: rental.id },
      });
    } catch (err) {
      console.error("Erro ao notificar cancelamento:", err);
    }

    try {
      if (rental.gameId) {
        await notifyGameBackAvailable(rental.gameId);
      }
    } catch (err) {
      console.error("Erro ao avisar disponibilidade após cancelamento:", err);
    }

    const finalMapped = {
      ...updated,
      game: updated.game
        ? updated.game
        : {
            id: null,
            title: updated.gameTitleSnapshot,
            cover: updated.gameCoverSnapshot,
          },
      copy: updated.copy
        ? updated.copy
        : updated.copyCodeSnapshot || updated.copyNumberSnapshot
        ? {
            id: null,
            code: updated.copyCodeSnapshot,
            number: updated.copyNumberSnapshot,
          }
        : null,
    };

    return res.json(finalMapped);
  } catch (err) {
    console.error("Erro ao cancelar aluguel:", err);
    return res.status(500).json({ error: "Erro ao cancelar aluguel." });
  }
});

rentalRoutes.patch("/:id/finish", ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const rental = await prisma.rental.findUnique({
      where: { id: String(id) },
    });

    if (!rental) {
      return res.status(404).json({ error: "Aluguel não encontrado" });
    }

    if (rental.status !== "ACTIVE") {
      return res.status(409).json({
        error: "Só pode finalizar aluguel ativo",
      });
    }

    const updated = await prisma.rental.update({
      where: { id: rental.id },
      data: {
        status: "RETURNED",
        endDate: new Date(),
      },
    });


    await incrementRentalCountAndMaybePromote(rental.userId);

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao finalizar aluguel" });
  }
});
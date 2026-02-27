import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { ensureUserOnly } from "../middlewares/ensureUserOnly";
import { addUserPoints } from "../services/engagement.service";

export const rentalRoutes = Router();

rentalRoutes.post("/", ensureAuthenticated, ensureUserOnly, async (req, res) => {
  const userId = req.user.id;
  const { gameId, copyId, endDate } = req.body;

  if (!gameId) return res.status(400).json({ error: "gameId é obrigatório" });
  if (!endDate) return res.status(400).json({ error: "endDate é obrigatório" });

  const parsedEnd = new Date(endDate);
  if (Number.isNaN(parsedEnd.getTime())) {
    return res.status(400).json({ error: "endDate inválido" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const game = await tx.game.findUnique({
        where: { id: String(gameId) },
      });

      if (!game) {
        return { status: 404, body: { error: "Jogo não encontrado" } } as const;
      }

      
      if (!copyId && game.allowOriginalRental === false) {
        const copiesCount = await tx.gameCopy.count({ where: { gameId: game.id } });
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
        const copy = await tx.gameCopy.findUnique({ where: { id: String(copyId) } });

        if (!copy || copy.gameId !== game.id) {
          return {
            status: 404,
            body: { error: "Exemplar não encontrado para este jogo" },
          } as const;
        }

        if (!copy.available) {
          return {
            status: 409,
            body: { error: "Exemplar indisponível", code: "COPY_UNAVAILABLE" },
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
            endDate: parsedEnd,
            status: "PENDING",
          },
        });

        return { status: 201, body: rental } as const;
      }

      
      if (!game.available) {
        return {
          status: 409,
          body: { error: "Jogo indisponível", code: "GAME_UNAVAILABLE" },
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
          copyId: null,
          endDate: parsedEnd,
          status: "PENDING",
        },
      });

      return { status: 201, body: rental } as const;
    });

    
    if (result.status === 201 && result.body?.id) {
      try {
        await addUserPoints({
          userId,
          delta: 10,
          reason: `RENTAL_CREATED:${result.body.id}`,
        });
      } catch (pointsErr) {
        
        console.error("Falha ao adicionar pontos (create rental):", pointsErr);
      }
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
        game: { select: { id: true, title: true, cover: true } },
        copy: { select: { id: true, code: true, number: true } },
      },
    });

    return res.json(rentals);
  } catch (err) {
    console.error("Erro ao listar aluguéis:", err);
    return res.status(500).json({ error: "Erro ao listar aluguéis" });
  }
});



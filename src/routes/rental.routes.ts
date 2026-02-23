import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";

export const rentalRoutes = Router();

rentalRoutes.post("/", ensureAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { gameId, copyId, endDate, rentOriginal } = req.body;

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
            body: { error: "Este jogo só pode ser alugado por exemplar.", code: "ONLY_COPIES_ALLOWED" },
          } as const;
        }
      }

      
      if (copyId) {
        const copy = await tx.gameCopy.findUnique({ where: { id: String(copyId) } });

        if (!copy || copy.gameId !== game.id) {
          return { status: 404, body: { error: "Exemplar não encontrado para este jogo" } } as const;
        }

        if (!copy.available) {
          return { status: 409, body: { error: "Exemplar indisponível", code: "COPY_UNAVAILABLE" } } as const;
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
        return { status: 409, body: { error: "Jogo indisponível", code: "GAME_UNAVAILABLE" } } as const;
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


rentalRoutes.patch("/:id/return", ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    const rental = await prisma.rental.findUnique({ where: { id: String(id) } });
    if (!rental) return res.status(404).json({ error: "Aluguel não encontrado" });

    
    if (rental.userId !== req.user.id) {
      return res.status(403).json({ error: "Sem permissão" });
    }

    const result = await prisma.$transaction(async (tx) => {
      
      if (rental.copyId) {
        await tx.gameCopy.update({ where: { id: rental.copyId }, data: { available: true } });
      } else {
        await tx.game.update({ where: { id: rental.gameId }, data: { available: true } });
      }

      const updated = await tx.rental.update({
        where: { id: rental.id },
        data: { status: "RETURNED" },
      });

      return updated;
    });

    return res.json(result);
  } catch (err) {
    console.error("Erro ao devolver aluguel:", err);
    return res.status(500).json({ error: "Erro ao devolver aluguel" });
  }
});
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";

export const notificationRoutes = Router();

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] ?? "";
  return param ?? "";
}

notificationRoutes.get("/me", ensureAuthenticated, async (req, res) => {
  const takeRaw = Array.isArray(req.query.take) ? req.query.take[0] : req.query.take;
  const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;

  const take = Number(takeRaw) || 20;
  const cursor = cursorRaw ? String(cursorRaw) : undefined;

  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      take: take + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: "desc" },
    });

    let nextCursor: string | undefined = undefined;

    if (notifications.length > take) {
      const nextItem = notifications.pop();
      nextCursor = nextItem?.id;
    }

    return res.json({
      notifications,
      nextCursor,
    });
  } catch (err) {
    console.error("Erro ao buscar notificações:", err);
    return res.status(500).json({ error: "Erro ao buscar notificações" });
  }
});

notificationRoutes.get("/unread-count", ensureAuthenticated, async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: {
        userId: req.user.id,
        readAt: null,
      },
    });

    return res.json({ count });
  } catch (err) {
    console.error("Erro ao buscar contagem de notificações:", err);
    return res.status(500).json({ error: "Erro ao buscar notificações" });
  }
});

notificationRoutes.patch("/:id/read", ensureAuthenticated, async (req, res) => {
  const id = getParam(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "id inválido" });
  }

  try {
    const result = await prisma.notification.updateMany({
      where: { id, userId: req.user.id },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: "Notificação não encontrada" });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao marcar notificação como lida:", err);
    return res.status(500).json({ error: "Erro ao atualizar notificação" });
  }
});

notificationRoutes.post("/read-all", ensureAuthenticated, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao marcar todas notificações como lidas:", err);
    return res.status(500).json({ error: "Erro ao atualizar notificações" });
  }
});
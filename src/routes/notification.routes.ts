import { Router } from "express";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";

export const notificationRoutes = Router();


notificationRoutes.get("/me", ensureAuthenticated, async (req, res) => {
  const take = Number(req.query.take) || 20;
  const cursor = req.query.cursor as string;

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
    return res.status(500).json({ error: "Erro ao buscar notificações" });
  }
});


notificationRoutes.get("/unread-count", ensureAuthenticated, async (req, res) => {
  const count = await prisma.notification.count({
    where: {
      userId: req.user.id,
      readAt: null,
    },
  });
  return res.json({ count });
});


notificationRoutes.patch("/:id/read", ensureAuthenticated, async (req, res) => {
  const { id } = req.params;

  const result = await prisma.notification.updateMany({
    where: { id, userId: req.user.id },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    return res.status(404).json({ error: "Notificação não encontrada" });
  }

  return res.json({ ok: true });
});

notificationRoutes.post("/read-all", ensureAuthenticated, async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return res.json({ ok: true });
});
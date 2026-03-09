import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { uploadAvatar } from "../middlewares/uploadAvatar";

export const userProfileRoutes = Router();

userProfileRoutes.post(
  "/me/avatar",
  ensureAuthenticated,
  uploadAvatar.single("avatar"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Imagem não enviada." });
      }

      const filename = req.file.filename;
      const avatarUrl = `${req.protocol}://${req.get("host")}/uploads/avatars/${filename}`;

      const currentUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { avatar: true },
      });

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: { avatar: avatarUrl },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          emailVerified: true,
          phoneVerified: true,
          points: true,
          level: true,
          authProvider: true,
          avatar: true,
          picture: true,
        },
      });

   
      if (currentUser?.avatar) {
        try {
          const marker = "/uploads/avatars/";
          const idx = currentUser.avatar.indexOf(marker);
          if (idx !== -1) {
            const oldFile = currentUser.avatar.slice(idx + marker.length);
            const oldPath = path.resolve(__dirname, "../../uploads/avatars", oldFile);
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          }
        } catch {
          
        }
      }

      return res.json({
        message: "Avatar atualizado com sucesso.",
        user: updatedUser,
      });
    } catch (err) {
      console.error("Erro ao salvar avatar:", err);
      return res.status(500).json({ error: "Erro ao atualizar avatar." });
    }
  }
);

userProfileRoutes.delete("/me/avatar", ensureAuthenticated, async (req, res) => {
  try {
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { avatar: true },
    });

    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: null },
    });

    if (currentUser?.avatar) {
      try {
        const marker = "/uploads/avatars/";
        const idx = currentUser.avatar.indexOf(marker);
        if (idx !== -1) {
          const oldFile = currentUser.avatar.slice(idx + marker.length);
          const oldPath = path.resolve(__dirname, "../../uploads/avatars", oldFile);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
      } catch {
        
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao remover avatar:", err);
    return res.status(500).json({ error: "Erro ao remover avatar." });
  }
});
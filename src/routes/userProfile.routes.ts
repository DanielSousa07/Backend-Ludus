import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";
import { ensureAuthenticated } from "../middlewares/ensureAuthenticated";
import { uploadAvatar } from "../middlewares/uploadAvatar";
import bcrypt from "bcryptjs";

export const userProfileRoutes = Router();



userProfileRoutes.get("/me", ensureAuthenticated, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
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
        senhaHash: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      points: user.points,
      level: user.level,
      authProvider: user.authProvider,
      avatar: user.avatar,
      picture: user.picture,
      hasPassword: !!user.senhaHash,
    });
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    return res.status(500).json({ error: "Erro ao buscar usuário." });
  }
});



userProfileRoutes.patch("/me", ensureAuthenticated, async (req, res) => {
  try {
    const { name, phone } = req.body;

    const updateData: any = {};

    if (name) {
      const cleanName = String(name).trim();
      if (cleanName.length < 3) {
        return res.status(400).json({
          error: "Nome precisa ter pelo menos 3 caracteres.",
        });
      }
      updateData.name = cleanName;
    }

    if (phone !== undefined) {
      const cleanPhone = String(phone).replace(/\D/g, "");

      if (cleanPhone.length < 10) {
        return res.status(400).json({
          error: "Telefone inválido.",
        });
      }

      const phoneExists = await prisma.user.findFirst({
        where: {
          phone: cleanPhone,
          NOT: {
            id: req.user.id,
          },
        },
      });

      if (phoneExists) {
        return res.status(400).json({
          error: "Telefone já está sendo usado.",
        });
      }

      updateData.phone = cleanPhone;
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
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

    return res.json({
      message: "Dados atualizados com sucesso.",
      user,
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    return res.status(500).json({
      error: "Erro ao atualizar perfil.",
    });
  }
});

userProfileRoutes.patch("/me/password", ensureAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: "A nova senha é obrigatória." });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

  
    if (user.senhaHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: "A senha atual é obrigatória." });
      }

      const passwordOk = await bcrypt.compare(currentPassword, user.senhaHash);
      if (!passwordOk) {
        return res.status(400).json({ error: "Senha atual incorreta." });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        senhaHash: newHash,
      },
    });

    return res.json({
      ok: true,
      message: user.senhaHash
        ? "Senha alterada com sucesso."
        : "Senha criada com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return res.status(500).json({ error: "Erro ao alterar senha." });
  }
});

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
            const oldPath = path.resolve(
              __dirname,
              "../../uploads/avatars",
              oldFile
            );

            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
          }
        } catch {}
      }

      return res.json({
        message: "Avatar atualizado com sucesso.",
        user: updatedUser,
      });
    } catch (err) {
      console.error("Erro ao salvar avatar:", err);
      return res.status(500).json({
        error: "Erro ao atualizar avatar.",
      });
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
          const oldPath = path.resolve(
            __dirname,
            "../../uploads/avatars",
            oldFile
          );

          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
      } catch {}
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao remover avatar:", err);
    return res.status(500).json({
      error: "Erro ao remover avatar.",
    });
  }
});
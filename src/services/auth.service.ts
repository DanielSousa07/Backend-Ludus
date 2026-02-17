import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export async function login(emailOrPhone: string, senha: string) {
  const cleanInput = (emailOrPhone || "").trim().toLowerCase();
  const onlyNumbers = (emailOrPhone || "").replace(/\D/g, "");

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: cleanInput },
        ...(onlyNumbers ? [{ phone: onlyNumbers }] : []),
      ],
    },
  });

  if (!user || !user.senhaHash) {
    throw new Error("Usuário ou senha inválidos");
  }

  const senhaValida = await bcrypt.compare(senha, user.senhaHash);
  if (!senhaValida) {
    throw new Error("Usuário ou senha inválidos");
  }

  // ✅ userId em sub para bater com ensureAuthenticated
  const token = jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET || "secret_fallback",
    {
      subject: user.id,
      expiresIn: "7d",
    }
  );

  return {
    token,
    user: {
      id: user.id,
      nome: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      phoneVerified: user.phoneVerified,
    },
  };
}

import { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";
import { prisma } from "../lib/prisma";

interface IPayload {
  sub: string;
  role: string;
}

export async function ensureAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Token não enviado" });
  }

  const [, token] = authHeader.split(" ");

  try {
    const decoded = verify(
      token,
      process.env.JWT_SECRET || "secret_fallback"
    ) as IPayload;

    const userId = decoded.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Utilizador não encontrado" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        error: "Sua conta precisa ser verificada por e-mail.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }


    req.user = {
      id: user.id,
      role: user.role,
    };

    return next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
}

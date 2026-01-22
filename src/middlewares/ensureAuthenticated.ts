import { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";

interface IPayload {
  id: string;
  role: string;
}

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: "Token não enviado" });
    }

    const [, token] = authHeader.split(" ");

    try {
        // Valida o token usando a sua chave secreta
        const { id, role } = verify(token, process.env.JWT_SECRET || "secret_fallback") as IPayload;

        // Injeta os dados no Request (o TS aceitará devido ao express.d.ts que criamos)
        req.user = {
            id,
            role
        };

        return next();
    } catch (err) {
        return res.status(401).json({ error: "Token inválido" });
    }
}
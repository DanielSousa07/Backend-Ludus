
import { Request, Response, NextFunction } from "express";

export function ensureAdmin(req: Request, res: Response, next: NextFunction) {
    
    const { role } = req.user

    if (role === "ADMIN") {
        return next();
    }

    return res.status(403).json({ error: "Acesso negado. Apenas administradores." });
}
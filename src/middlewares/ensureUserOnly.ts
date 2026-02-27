
import { Request, Response, NextFunction } from "express";

export function ensureUserOnly(req: Request, res: Response, next: NextFunction) {

  if (req.user?.role === "ADMIN") {
    return res.status(403).json({
      error: "Admins não podem realizar esta ação.",
      code: "ADMIN_ACTION_BLOCKED",
    });
  }

  return next();
}
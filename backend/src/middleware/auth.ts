import { Request, Response, NextFunction } from "express";
import { ADMIN_TOKEN } from "../routes/auth.js";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Ignora verificação para rota de login e health check
  if (req.path === "/api/auth/login" || req.path === "/health" || req.path === "/api/health") {
    return next();
  }

  // Socket.io handshake requests are handled separately or bypassed for now, 
  // but Express middleware might catch polling requests if not careful.
  // Express usually sees them as /socket.io/...
  if (req.path.startsWith("/socket.io/")) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
    res.status(401).json({ ok: false, error: "Acesso Negado: Token de autenticação inválido ou ausente." });
    return;
  }

  next();
}

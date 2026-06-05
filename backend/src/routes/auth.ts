import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";

const router = Router();

// Senha mestra do sistema. Configure via variável ADMIN_PASSWORD no .env
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "jarvis";

// Token gerado dinamicamente ao iniciar o servidor (não é mais estático)
// Isso garante que cada reinicialização invalida sessões antigas
export const ADMIN_TOKEN = randomBytes(32).toString("hex");

router.post("/login", (req: Request, res: Response): void => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true, token: ADMIN_TOKEN });
  } else {
    res.status(401).json({ ok: false, error: "Credenciais inválidas" });
  }
});

export default router;

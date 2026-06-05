import { Router } from "express";
import type { Request, Response } from "express";
import {
  getWhatsAppConfig,
  getWhatsAppStatus,
  resetWhatsAppSession,
  saveWhatsAppConfig,
  startWhatsApp,
  stopWhatsApp,
} from "../services/whatsapp.js";

const router = Router();

router.get("/status", async (_req: Request, res: Response): Promise<void> => {
  res.json({
    ok: true,
    success: true,
    whatsapp: getWhatsAppStatus(),
  });
});

router.get("/config", async (_req: Request, res: Response): Promise<void> => {
  res.json({
    ok: true,
    success: true,
    config: getWhatsAppConfig(),
  });
});

router.post("/config", async (req: Request, res: Response): Promise<void> => {
  try {
    const allowedJid = String(req.body?.allowedJid || "").trim();

    const config = await saveWhatsAppConfig({
      allowedJid,
    });

    res.json({
      ok: true,
      success: true,
      message: "Configuração do WhatsApp salva.",
      config,
    });
  } catch (error: any) {
    console.error("Erro ao salvar configuração do WhatsApp:", error?.message || error);

    res.status(400).json({
      ok: false,
      success: false,
      error: "Erro ao salvar configuração do WhatsApp.",
      details: error?.message || String(error),
    });
  }
});

router.post("/start", async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await startWhatsApp();

    res.json({
      ok: true,
      success: true,
      message: "Inicialização do WhatsApp solicitada.",
      whatsapp: status,
    });
  } catch (error: any) {
    console.error("Erro ao iniciar WhatsApp:", error?.message || error);

    res.status(500).json({
      ok: false,
      success: false,
      error: "Erro ao iniciar WhatsApp.",
      details: error?.message || String(error),
    });
  }
});

router.post("/stop", async (_req: Request, res: Response): Promise<void> => {
  try {
    await stopWhatsApp();

    res.json({
      ok: true,
      success: true,
      message: "WhatsApp parado.",
      whatsapp: getWhatsAppStatus(),
    });
  } catch (error: any) {
    console.error("Erro ao parar WhatsApp:", error?.message || error);

    res.status(500).json({
      ok: false,
      success: false,
      error: "Erro ao parar WhatsApp.",
      details: error?.message || String(error),
    });
  }
});

router.post("/reset", async (req: Request, res: Response): Promise<void> => {
  try {
    const startAfterReset = req.body?.startAfterReset !== false;

    const status = await resetWhatsAppSession({
      startAfterReset,
    });

    res.json({
      ok: true,
      success: true,
      message: startAfterReset
        ? "Sessão resetada. Gerando novo QR Code."
        : "Sessão resetada.",
      whatsapp: status,
    });
  } catch (error: any) {
    console.error("Erro ao resetar sessão do WhatsApp:", error?.message || error);

    res.status(500).json({
      ok: false,
      success: false,
      error: "Erro ao resetar sessão do WhatsApp.",
      details: error?.message || String(error),
    });
  }
});

export default router;
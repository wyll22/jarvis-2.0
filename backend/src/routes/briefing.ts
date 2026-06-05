import { Router } from "express";
import type { Request, Response } from "express";
import { sendDailyBriefing } from "../services/dailyBriefing.js";

const router = Router();

// POST /api/briefing/test — dispara o briefing manualmente para testar
router.post("/test", async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await sendDailyBriefing();

    if (result.sent) {
      res.json({
        ok: true,
        message: "Briefing enviado com sucesso pelo WhatsApp.",
      });
    } else {
      res.json({
        ok: false,
        message: "Briefing não enviado.",
        reason: result.reason,
      });
    }
  } catch (error: any) {
    console.error("Erro ao testar briefing:", error?.message || error);

    res.status(500).json({
      ok: false,
      error: "Erro ao enviar briefing.",
      details: error?.message || String(error),
    });
  }
});

export default router;

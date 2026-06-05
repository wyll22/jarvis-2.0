import { Router } from "express";
import type { Request, Response } from "express";
import { generateJavisAudio } from "../services/ttsBrain.js";
import path from "path";
import fs from "fs/promises";
import os from "os";

const router = Router();

/**
 * Valida que um caminho de áudio gerado está dentro do diretório temporário do sistema.
 * Previne Path Traversal caso o audioPath seja manipulado.
 */
function isSafeTempPath(audioPath: string): boolean {
  const resolved = path.resolve(audioPath);
  const tempDir = os.tmpdir();
  return resolved.startsWith(tempDir) && resolved.endsWith('.mp3');
}

// POST /api/tts/generate — retorna áudio MP3 como stream (para o painel web)
router.post("/generate", async (req: Request, res: Response): Promise<void> => {
  try {
    const text = String(req.body?.text || "J.A.R.V.I.S. operacional.").trim();

    if (!text) {
      res.status(400).json({ ok: false, error: "Texto vazio." });
      return;
    }

    const audioPath = await generateJavisAudio(text);

    if (!isSafeTempPath(audioPath)) {
      res.status(500).json({ ok: false, error: "Erro interno ao gerar áudio." });
      return;
    }

    const audioBuffer = await fs.readFile(audioPath);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audioBuffer.length),
      "Cache-Control": "no-cache",
    });

    res.send(audioBuffer);

    // Limpa o arquivo temporário após enviar
    fs.unlink(audioPath).catch(() => {});
  } catch (error: any) {
    console.error("Erro no TTS /generate:", error?.message || error);
    res.status(500).json({ ok: false, error: "Erro ao gerar áudio." });
  }
});

router.post("/test", async (req: Request, res: Response): Promise<void> => {
  try {
    const text = String(
      req.body?.text || "Pronto, Senhor. JAVIS está online e pronto para responder por voz."
    ).trim();

    const audioPath = await generateJavisAudio(text);

    // Não expõe o caminho absoluto do servidor — retorna apenas confirmação
    res.json({
      ok: true,
      success: true,
      message: "Áudio gerado com sucesso.",
    });

    // Limpa o arquivo temporário (era apenas um teste)
    fs.unlink(audioPath).catch(() => {});
  } catch (error: any) {
    console.error("Erro ao gerar áudio TTS:", error?.message || error);
    res.status(500).json({
      ok: false,
      success: false,
      error: "Erro ao gerar áudio TTS.",
    });
  }
});

router.post("/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const text = String(
      req.body?.text || "Pronto, Senhor. JAVIS está online e pronto para responder por voz."
    ).trim();

    const audioPath = await generateJavisAudio(text);

    if (!isSafeTempPath(audioPath)) {
      res.status(500).json({ ok: false, error: "Erro interno ao gerar áudio." });
      return;
    }

    res.sendFile(path.resolve(audioPath), (err) => {
      // Limpa o arquivo temporário após enviar (ou se houve erro)
      fs.unlink(audioPath).catch(() => {});
      if (err && !res.headersSent) {
        res.status(500).json({ ok: false, error: "Erro ao enviar áudio." });
      }
    });
  } catch (error: any) {
    console.error("Erro ao baixar áudio TTS:", error?.message || error);
    res.status(500).json({
      ok: false,
      success: false,
      error: "Erro ao baixar áudio TTS.",
    });
  }
});

export default router;
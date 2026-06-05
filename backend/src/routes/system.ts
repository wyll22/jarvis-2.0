import { Router } from "express";
import type { Request, Response } from "express";
import { resetWhatsAppSession } from "../services/whatsapp.js";
import { supabase } from "../lib/supabase.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../../");
const envPath = path.join(backendRoot, ".env");

const router = Router();

// =============================================
// GET /api/system/config — Retorna as configs atuais (sem expor valores sensíveis por completo)
// =============================================
router.get("/config", async (_req: Request, res: Response): Promise<void> => {
  try {
    const envContent = await fs.readFile(envPath, "utf-8");
    const config: Record<string, string> = {};

    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      const value = trimmed.substring(eqIndex + 1).trim();

      // Mascarar chaves sensíveis para exibição
      if (key.includes("KEY") || key.includes("SECRET")) {
        config[key] = value ? `${value.substring(0, 8)}...${value.slice(-4)}` : "";
      } else {
        config[key] = value;
      }
    }

    res.json({ ok: true, config });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || "Erro ao ler configurações." });
  }
});

// =============================================
// POST /api/system/config — Salva novas configs no .env
// =============================================
router.post("/config", async (req: Request, res: Response): Promise<void> => {
  try {
    const newConfig = req.body as Record<string, string>;

    if (!newConfig || Object.keys(newConfig).length === 0) {
      res.status(400).json({ ok: false, error: "Nenhuma configuração enviada." });
      return;
    }

    // LISTA DE CHAVES PERMITIDAS (ALLOWLIST) PARA PREVENIR INJEÇÃO E CORRUPÇÃO
    const ALLOWED_KEYS = [
      "VITE_API_URL", "ADMIN_PASSWORD", "SUPABASE_URL", "SUPABASE_ANON_KEY",
      "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY",
      "SERPER_API_KEY", "TAVILY_API_KEY", "BRAVE_API_KEY", "ALLOWED_JID"
    ];

    const safeConfig: Record<string, string> = {};
    for (const [key, value] of Object.entries(newConfig)) {
      // Ignora chaves não permitidas ou valores que vieram mascarados do frontend (não foram editados)
      if (ALLOWED_KEYS.includes(key) && !value.includes("...")) {
        safeConfig[key] = value;
      }
    }

    if (Object.keys(safeConfig).length === 0) {
      res.json({ ok: true, message: "Nenhuma alteração válida para salvar." });
      return;
    }

    // Ler o .env atual
    let envContent = "";
    try {
      envContent = await fs.readFile(envPath, "utf-8");
    } catch {
      // Se não existir, começa vazio
    }

    // Construir mapa do .env atual preservando comentários e ordem
    const lines = envContent.split("\n");
    const updatedKeys = new Set<string>();

    const updatedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) return line;

      const key = trimmed.substring(0, eqIndex).trim();

      if (key in safeConfig) {
        updatedKeys.add(key);
        return `${key}=${safeConfig[key]}`;
      }

      return line;
    });

    // Adicionar chaves novas que não existiam no .env
    for (const [key, value] of Object.entries(safeConfig)) {
      if (!updatedKeys.has(key)) {
        updatedLines.push(`${key}=${value}`);
      }
    }

    await fs.writeFile(envPath, updatedLines.join("\n"), "utf-8");

    // Atualizar process.env em tempo real
    for (const [key, value] of Object.entries(safeConfig)) {
      process.env[key] = value;
    }

    console.log("Configurações do sistema atualizadas via painel:", Object.keys(safeConfig));

    res.json({
      ok: true,
      message: "Configurações salvas com sucesso. Reinicie o backend para aplicar todas as mudanças.",
      updatedKeys: Object.keys(safeConfig),
    });
  } catch (error: any) {
    console.error("Erro ao salvar configurações:", error);
    res.status(500).json({ ok: false, error: error?.message || "Erro ao salvar configurações." });
  }
});

// =============================================
// POST /api/system/reset — DESATIVADO (SAAS MULTI-TENANT)
// =============================================
router.post("/reset", async (_req: Request, res: Response): Promise<void> => {
  res.status(403).json({ 
    ok: false, 
    error: "O Reset Global está desativado no ambiente SaaS. Para apagar dados, use a opção de excluir clientes individualmente no painel de Gestão de Clientes." 
  });
});

export default router;

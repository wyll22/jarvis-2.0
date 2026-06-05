import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase.js";

const router = Router();

router.get("/clients", async (_req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    
    console.log(`[API] /clients retornou ${data?.length || 0} clientes.`);

    res.json({ ok: true, data });
  } catch (error: any) {
    console.error("Erro ao buscar clientes:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.put("/clients/:id/status", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "inactive", "suspended", "trial"].includes(status)) {
      res.status(400).json({ ok: false, error: "Status inválido" });
      return;
    }

    // Se estiver ativando, limpa trial_ends_at — o cliente vira um cliente real
    const updatePayload: Record<string, unknown> = { status };
    if (status === "active") {
      updatePayload.trial_ends_at = null;
    }

    const { data, error } = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ ok: true, data });
  } catch (error: any) {
    console.error("Erro ao atualizar cliente:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Rota de upgrade explícita: converte trial bloqueado em cliente ativo permanente
router.put("/clients/:id/upgrade", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("clients")
      .update({ status: "active", trial_ends_at: null, plan: "basic" })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ ok: true, data, message: "Cliente convertido para plano ativo com sucesso." });
  } catch (error: any) {
    console.error("Erro ao fazer upgrade do cliente:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.put("/clients/:id/name", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      res.status(400).json({ ok: false, error: "Nome inválido" });
      return;
    }

    const { data, error } = await supabase
      .from("clients")
      .update({ name: name.trim() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ ok: true, data });
  } catch (error: any) {
    console.error("Erro ao renomear cliente:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.delete("/clients/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // 1. Apaga tudo que pertence ao cliente em cascata manual (se não tiver cascade nativo)
    const tables = ['contacts', 'appointments', 'projects', 'todos', 'finances', 'memories', 'conversations'];
    for (const t of tables) {
      await supabase.from(t).delete().eq('client_id', id);
    }

    // 2. Apaga o próprio cliente
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw error;

    res.json({ ok: true, message: "Cliente e todos os seus dados foram apagados." });
  } catch (error: any) {
    console.error("Erro ao excluir cliente:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;

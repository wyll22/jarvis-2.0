import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase.js";
import { getWhatsAppSocket } from "../services/whatsapp.js";
import { invalidateAdminCache } from "../lib/adminClient.js";

const router = Router();

router.post("/register-demo", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, phone_number, plan, trialHours } = req.body;

    if (!phone_number) {
      res.status(400).json({ ok: false, error: "Número de telefone é obrigatório." });
      return;
    }

    const digits = String(phone_number).replace(/\D/g, "");
    if (digits.length < 10) {
      res.status(400).json({ ok: false, error: "Número de telefone inválido." });
      return;
    }

    let whatsapp_jid = `${digits}@s.whatsapp.net`;
    
    const sock = getWhatsAppSocket();
    if (sock) {
      // 1. Tenta o JID original
      let [result] = await sock.onWhatsApp(whatsapp_jid);
      
      // 2. Se falhar e for número BR com 9 dígito, tenta sem o 9 (WhatsApp legacy accounts)
      if (!result?.exists && digits.length === 13 && digits.startsWith("55") && digits[4] === "9") {
        const without9 = digits.substring(0, 4) + digits.substring(5);
        const [resultFallback] = await sock.onWhatsApp(`${without9}@s.whatsapp.net`);
        if (resultFallback?.exists) {
          whatsapp_jid = resultFallback.jid;
        }
      } else if (result?.exists) {
        whatsapp_jid = result.jid;
      }
    }

    let targetStatus = "active";
    let targetPlan = "enterprise";
    let trialEndsAt = null;

    if (plan === "trial") {
      targetPlan = "basic"; // O banco apenas permite 'basic', 'pro' e 'enterprise'
      const hours = Number(trialHours) || 24;
      trialEndsAt = new Date(Date.now() + hours * 3600000).toISOString();
    }

    // Insere ou atualiza o cliente no Supabase
    const { data: client, error } = await supabase
      .from("clients")
      .upsert(
        {
          name: name || "Cliente",
          phone_number: whatsapp_jid.split("@")[0],
          whatsapp_jid,
          status: targetStatus,
          plan: targetPlan,
          trial_ends_at: trialEndsAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "whatsapp_jid" }
      )
      .select()
      .single();

    if (error) throw error;

    // Invalida cache do admin para que as rotas re-resolvam se necessário
    invalidateAdminCache();

    // Se o socket estiver conectado, manda mensagem de boas vindas
    if (sock) {
      const isFemale = name && (name.toLowerCase().endsWith("a") || name.toLowerCase().includes("victoria") || name.toLowerCase().includes("maria"));
      const title = isFemale ? "Senhora" : "Senhor";
      const firstName = name ? name.trim().split(" ")[0] : "";
      
      let welcomeMsg = "";

      const disclaimer = "\n\n*O J.A.R.V.I.S. é uma inteligência artificial e pode cometer erros. Recomenda-se verificar informações importantes.*";

      if (plan === "trial") {
        const hours = Number(trialHours) || 24;
        welcomeMsg = `Saudações, ${title} ${firstName}. Eu sou o J.A.R.V.I.S., seu assistente executivo de inteligência artificial.\n\nFui instruído a iniciar o seu período de testes, que terá a duração exata de ${hours} horas a partir deste momento.\n\nDurante esta demonstração, o ${title} poderá atestar minhas capacidades. Sinta-se à vontade para me pedir para:\n• Agendar e listar compromissos.\n• Registrar e analisar seu fluxo financeiro.\n• Salvar memórias ou contatos importantes.\n• Acompanhar projetos.\n\nAguardarei suas instruções para começarmos.${disclaimer}`;
      } else {
        welcomeMsg = `Saudações, ${title} ${firstName}. Eu sou o J.A.R.V.I.S., seu novo assistente executivo de inteligência artificial.\n\nSua integração ao meu sistema foi concluída com êxito. Fui desenvolvido para organizar sua rotina de forma impecável, proativa e extremamente segura.\n\nA partir de agora, sou oficialmente responsável por otimizar sua agenda, gerenciar seu fluxo financeiro, organizar seus projetos e manter seu banco de memórias acessível a qualquer momento.\n\nSinta-se à vontade para me dar sua primeira instrução.${disclaimer}`;
      }
        
      try {
        await sock.sendMessage(whatsapp_jid, { text: welcomeMsg });
        console.log(`[Onboarding] Mensagem de boas vindas enviada para ${whatsapp_jid}`);

        // Salva a mensagem no banco para aparecer no histórico do Chat do Admin
        await supabase.from("conversations").insert([{
          client_id: client.id,
          session_id: whatsapp_jid,
          role: "assistant",
          content: welcomeMsg
        }]);

        // Notifica o Admin
        const adminJid = process.env.ALLOWED_JID;
        if (adminJid) {
          const adminMsg = `Senhor, acabei de registrar um novo cliente na base de dados.\n\n👤 Nome: ${name}\n📱 Número: ${whatsapp_jid.split("@")[0]}\n🏷️ Plano: ${plan.toUpperCase()}\n\nA mensagem de boas-vindas foi disparada com sucesso.`;
          try {
            await sock.sendMessage(adminJid, { text: adminMsg });
          } catch (e) {
            console.error("Erro ao notificar admin:", e);
          }
        }
      } catch (err) {
        console.error(`[Onboarding] Erro ao enviar mensagem para ${whatsapp_jid}:`, err);
      }
    }

    res.json({
      ok: true,
      message: "Cliente registrado com sucesso.",
      client
    });
  } catch (error: any) {
    console.error("Erro no onboarding:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/message", async (req: Request, res: Response): Promise<void> => {
  try {
    const { jid, text } = req.body;
    const sock = getWhatsAppSocket();
    if (!sock) {
      res.status(500).json({ ok: false, error: "WhatsApp não conectado" });
      return;
    }
    await sock.sendMessage(jid, { text });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;

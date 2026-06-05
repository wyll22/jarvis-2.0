import cron from "node-cron";
import { supabase } from "../lib/supabase.js";
import { getWhatsAppSocket, getWhatsAppStatus } from "./whatsapp.js";

// ─── Trial Expiration Scheduler ────────────────────────────────────────────────
//
// Roda a cada hora e verifica clientes cujo trial_ends_at já passou.
// Quando encontra um vencido:
//  1. Muda status → 'suspended'  (dados PRESERVADOS — nunca apaga automaticamente)
//  2. Envia notificação via WhatsApp avisando o cliente
//
// Fluxo de reativação (cliente decide contratar):
//  → Admin clica "ATIVAR" no painel
//  → Rota PUT /clients/:id/status limpa trial_ends_at e seta status = 'active'
//  → Cliente volta com todos os dados intactos
//
// Fluxo de limpeza (cliente não quer mais):
//  → Admin clica "EXCLUIR" no painel → apaga em cascata (como sempre)
// ───────────────────────────────────────────────────────────────────────────────

async function expireTrialClients(): Promise<void> {
  const now = new Date().toISOString();

  // Busca todos os clientes com trial_ends_at no passado que ainda estão ativos
  const { data: expiredClients, error } = await supabase
    .from("clients")
    .select("id, name, phone_number, whatsapp_jid, trial_ends_at")
    .eq("status", "active")
    .not("trial_ends_at", "is", null)
    .lt("trial_ends_at", now);

  if (error) {
    console.error("[Trial] Erro ao buscar trials expirados:", error.message);
    return;
  }

  if (!expiredClients || expiredClients.length === 0) {
    return; // Nenhum trial vencido no momento
  }

  console.log(`[Trial] ${expiredClients.length} trial(s) expirado(s) encontrado(s). Bloqueando...`);

  for (const client of expiredClients) {
    // 1. Bloqueia o cliente (dados preservados)
    const { error: updateError } = await supabase
      .from("clients")
      .update({ status: "suspended" })
      .eq("id", client.id);

    if (updateError) {
      console.error(`[Trial] Erro ao bloquear cliente ${client.id}:`, updateError.message);
      continue;
    }

    console.log(`[Trial] ✅ Cliente bloqueado: ${client.name} (${client.id.slice(0, 8)}...)`);

    // 2. Notifica o cliente via WhatsApp (se conectado)
    const waStatus = getWhatsAppStatus();
    const sock = getWhatsAppSocket();

    if (waStatus.status === "connected" && sock) {
      const jid = client.whatsapp_jid || (client.phone_number ? `${client.phone_number.replace(/\D/g, "")}@s.whatsapp.net` : null);

      if (jid) {
        const firstName = String(client.name || "").split(" ")[0] || "Cliente";

        const message =
          `Prezado(a) *${firstName}*, seu período de avaliação do *J.A.R.V.I.S.* foi encerrado.\n\n` +
          `Todos os seus dados foram preservados e estarão disponíveis imediatamente caso decida continuar com o serviço.\n\n` +
          `Para reativar o acesso, entre em contato com o administrador.\n\n` +
          `_J.A.R.V.I.S. — Just A Rather Very Intelligent System_`;

        try {
          await sock.sendMessage(jid, { text: message });
          console.log(`[Trial] 📱 Notificação enviada para ${firstName} (${jid})`);
        } catch (sendErr: any) {
          console.warn(`[Trial] Falha ao notificar ${firstName}:`, sendErr?.message);
        }
      }
    }
  }
}

export function startTrialExpirationScheduler(): void {
  // Roda na hora exata de cada hora (0 * * * *)
  cron.schedule("0 * * * *", () => {
    expireTrialClients().catch((err) => {
      console.error("[Trial] Erro no cron de expiração:", err);
    });
  }, { timezone: "America/Sao_Paulo" });

  // Roda também no startup para capturar eventuais trials que venceram enquanto o servidor estava off
  expireTrialClients().catch((err) => {
    console.error("[Trial] Erro na verificação inicial:", err);
  });

  console.log("[Trial] ✅ Scheduler de expiração de Trial iniciado (verifica a cada hora).");
}

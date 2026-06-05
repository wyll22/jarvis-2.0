import cron from "node-cron";
import { supabase } from "../lib/supabase.js";
import { getWhatsAppSocket, getWhatsAppStatus } from "./whatsapp.js";
import { generateJavisAudio } from "./ttsBrain.js";
import { spawn } from "child_process";
import fs from "fs/promises";

const TIMEZONE = "America/Sao_Paulo";

// Set em memória para evitar alertas duplicados durante a sessão atual.
// MELHORIA: ao verificar, também consulta o campo alerted_at no banco,
// garantindo que reinicializações do servidor não causem alertas duplicados.
const alertedAppointments = new Set<string>();

function isAlertEnabled(): boolean {
  return process.env.APPOINTMENT_ALERTS_ENABLED !== "false"; // Ativado por padrão
}

function getAllowedJid(): string | null {
  return process.env.JAVIS_ALLOWED_JID?.trim() || null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function getDatePartsInBrazil(date: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  let hour = parts.find((p) => p.type === "hour")?.value || "00";
  if (hour === "24") hour = "00";

  return {
    year: parts.find((p) => p.type === "year")?.value || "1970",
    month: parts.find((p) => p.type === "month")?.value || "01",
    day: parts.find((p) => p.type === "day")?.value || "01",
    hour,
    minute: parts.find((p) => p.type === "minute")?.value || "00",
  };
}

function parseAppointmentDate(row: any): string | null {
  const rawDate = row.scheduled_at || row.date;
  if (!rawDate) return null;

  const text = String(rawDate);

  if (text.includes("T")) {
    const date = new Date(text);

    if (!Number.isNaN(date.getTime())) {
      const parts = getDatePartsInBrazil(date);
      return `${parts.year}-${parts.month}-${parts.day}`;
    }
  }

  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);
  return isoMatch ? isoMatch[0] : null;
}

function parseAppointmentTime(row: any): string | null {
  const rawTime = row.scheduled_at || row.time;
  if (!rawTime) return null;

  const text = String(rawTime);

  if (text.includes("T")) {
    const date = new Date(text);

    if (!Number.isNaN(date.getTime())) {
      const parts = getDatePartsInBrazil(date);
      return `${parts.hour}:${parts.minute}`;
    }
  }

  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return `${pad(hour)}:${pad(minute)}`;
}

export async function checkAndSendAlerts(): Promise<void> {
  if (!isAlertEnabled()) return;

  const status = getWhatsAppStatus();
  if (status.status !== "connected") return;

  const sock = getWhatsAppSocket();
  if (!sock) return;

  // Calcula qual é o horário atual para calcular a diferença
  const now = new Date();

  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .or(`status.is.null,status.neq.cancelado,status.neq.cancelled,status.neq.done,status.neq.completed`);

    if (error || !data) return;

    for (const row of data) {
      const id = String(row.id);
      // Verifica primeiro no Set em memória (mais rápido)
      if (alertedAppointments.has(id)) continue;
      // Verifica também no banco: se alerted_at já foi preenchido, não reenvia
      if (row.alerted_at) {
        alertedAppointments.add(id); // Sincroniza o Set com o banco
        continue;
      }

      const statusVal = String(row.status || "").toLowerCase();
      if (
        ["cancelado", "cancelled", "canceled", "done", "completed"].includes(
          statusVal
        )
      ) {
        continue;
      }

      // Janela de alerta: entre 28 e 32 minutos no futuro (tolerância de ±2 min)
      const apptDate = parseAppointmentDate(row);
      const apptTime = parseAppointmentTime(row);

      if (!apptDate || !apptTime) continue;

      // Reconstrói a data/hora do compromisso em BRT
      const [ah, am] = apptTime.split(":").map(Number);
      const [ay, amo, ad] = apptDate.split("-").map(Number);
      // Cria o timestamp do compromisso como UTC (o banco pode estar em UTC)
      const apptTimestamp = new Date(ay, amo - 1, ad, ah, am, 0).getTime();
      const diffMs = apptTimestamp - now.getTime();
      const diffMin = diffMs / 60000;

      // Alerta se estiver entre 28 e 32 minutos no futuro
      if (diffMin >= 28 && diffMin <= 32) {
        // Busca o JID do cliente dono do compromisso
        let jid = null;
        if (row.client_id) {
          const { data: clientData } = await supabase.from("clients").select("whatsapp_jid").eq("id", row.client_id).single();
          if (clientData?.whatsapp_jid) jid = clientData.whatsapp_jid;
        }
        
        // Se não achar, usa o fallback do admin (legado)
        if (!jid) {
          jid = process.env.JAVIS_ALLOWED_JID?.trim();
        }
        
        if (!jid) continue;

        const title = row.title || row.name || row.description || "Compromisso";

        // Texto visual (pode ter emoji para WhatsApp)
        const textMessage = `🔔 Com licença, Senhor.\nLembrete: em exatos 30 minutos o senhor tem um compromisso na agenda: *${title}*.`;

        // Texto limpo para o Antônio falar
        const audioMessage = `Com licença, Senhor. Lembrete: em exatos 30 minutos o senhor tem um compromisso na agenda: ${title}.`;

        console.log(`JAVIS Alertas: Enviando lembrete para compromisso '${title}' (${apptTime})`);

        // 1. Texto
        await sock.sendMessage(jid, { text: textMessage });

        // 2. Áudio (OGG Opus — formato nativo do WhatsApp PTT)
        try {
          await sock.sendPresenceUpdate("recording", jid);
          const mp3Path = await generateJavisAudio(audioMessage);

          const oggPath = mp3Path.replace(/\.mp3$/, ".ogg");
          await new Promise<void>((resolve, reject) => {
            const ff = spawn("ffmpeg", ["-y", "-i", mp3Path, "-c:a", "libopus", "-b:a", "48k", "-ar", "48000", "-ac", "1", oggPath], { shell: false });
            ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${code}`))));
            ff.on("error", reject);
          });

          const audioBuffer = await fs.readFile(oggPath);
          await sock.sendMessage(jid, { audio: audioBuffer, mimetype: "audio/ogg; codecs=opus", ptt: true });
          await sock.sendPresenceUpdate("paused", jid);

          fs.unlink(mp3Path).catch(() => {});
          fs.unlink(oggPath).catch(() => {});
        } catch (audioErr: any) {
          console.warn("JAVIS Alertas: Áudio do lembrete falhou:", audioErr?.message);
        }

        // Marca como enviado no Set em memória
        alertedAppointments.add(id);
        // Persiste no banco para sobreviver a reinicializações do servidor
        try {
          await supabase
            .from("appointments")
            .update({ alerted_at: new Date().toISOString() })
            .eq("id", id);
        } catch (e: any) {
          console.warn("JAVIS Alertas: Falha ao persistir alerted_at:", e?.message);
        }
      }
    }
  } catch (error) {
    console.error("JAVIS Alertas: Erro ao verificar compromissos:", error);
  }
}

export function startAppointmentAlertScheduler(): void {
  if (!isAlertEnabled()) {
    console.log("JAVIS Alertas: Desativado.");
    return;
  }

  // Roda a cada minuto para checar se tem compromisso nos próximos 30 minutos
  cron.schedule("* * * * *", () => {
    checkAndSendAlerts().catch((error) => {
      console.error("JAVIS Alertas: Erro no cron:", error);
    });
  });

  console.log("JAVIS Alertas: ✅ Agendador iniciado (verifica a cada minuto).");
}

import cron from "node-cron";
import { supabase } from "../lib/supabase.js";
import { getWhatsAppSocket, getWhatsAppStatus } from "./whatsapp.js";
import { generateJavisAudio } from "./ttsBrain.js";
import { spawn } from "child_process";
import fs from "fs/promises";

const TIMEZONE = "America/Sao_Paulo";

// ─── Config ───────────────────────────────────────────────

function isBriefingEnabled(): boolean {
  return process.env.DAILY_BRIEFING_ENABLED === "true";
}

function getBriefingTime(): { hour: number; minute: number } {
  const raw = process.env.DAILY_BRIEFING_TIME?.trim() || "07:00";
  const [h, m] = raw.split(":");

  return {
    hour: Number(h) || 7,
    minute: Number(m) || 0,
  };
}

// ─── Helpers de data ──────────────────────────────────────

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

function getTodayIso(): string {
  const parts = getDatePartsInBrazil(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(isoDate: string, days: number): string {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split("-");
  const year = Number(yearRaw || new Date().getFullYear());
  const month = Number(monthRaw || 1);
  const day = Number(dayRaw || 1);

  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));

  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

function formatDatePtBr(isoDate: string): string {
  const [year = "0000", month = "00", day = "00"] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function getWeekdayName(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  const weekdays = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];

  return weekdays[date.getUTCDay()] || "";
}

// ─── Parsing de compromissos ──────────────────────────────

type ParsedAppointment = {
  title: string;
  date: string;
  time: string | null;
};

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

function normalizeAppointment(row: any): ParsedAppointment | null {
  const status = String(row.status || "").toLowerCase();

  if (
    ["cancelado", "cancelled", "canceled", "done", "completed"].includes(status)
  ) {
    return null;
  }

  const date = parseAppointmentDate(row);
  if (!date) return null;

  return {
    title: row.title || row.name || row.description || "Compromisso",
    date,
    time: parseAppointmentTime(row),
  };
}

async function fetchAppointmentsForDate(
  targetDate: string,
  clientId: string
): Promise<ParsedAppointment[]> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("client_id", clientId)
    .order("scheduled_at", { ascending: true });

  if (error || !data) return [];

  return data
    .map(normalizeAppointment)
    .filter(
      (item): item is ParsedAppointment =>
        item !== null && item.date === targetDate
    )
    .sort((a, b) => {
      const aKey = a.time || "00:00";
      const bKey = b.time || "00:00";
      return aKey.localeCompare(bKey);
    });
}

// ─── Projetos ─────────────────────────────────────────────

type ProjectSummary = {
  name: string;
  goal: string | null;
  currentWeight: number | null;
  targetWeight: number | null;
  remaining: number | null;
  progressPercent: number;
};

function numberPt(value: number, decimals = 1): string {
  return Number(value)
    .toFixed(decimals)
    .replace(".", ",")
    .replace(/,0+$/, "");
}

async function fetchProjectSummaries(clientId: string): Promise<ProjectSummary[]> {
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "active");

  if (pErr || !projects?.length) return [];

  const { data: measurements, error: mErr } = await supabase
    .from("project_measurements")
    .select("*")
    .in("project_id", projects.map((p: any) => p.id))
    .order("measured_at", { ascending: true });

  if (mErr) return [];

  return projects.map((project: any) => {
    const projectMeasurements = (measurements || []).filter(
      (m: any) => m.project_id === project.id
    );

    const weights = projectMeasurements
      .filter((m: any) => m.metric_name === "peso")
      .sort((a: any, b: any) =>
        String(a.measured_at || a.created_at || "").localeCompare(
          String(b.measured_at || b.created_at || "")
        )
      );

    const targetWeightMeasurement = [...projectMeasurements]
      .filter((m: any) => m.metric_name === "meta_peso")
      .pop();

    const firstWeight = weights[0];
    const currentWeight = weights[weights.length - 1];

    let progressPercent = 0;
    let remaining: number | null = null;

    if (firstWeight && currentWeight && targetWeightMeasurement) {
      const initial = Number(firstWeight.value);
      const current = Number(currentWeight.value);
      const target = Number(targetWeightMeasurement.value);
      const totalToLose = initial - target;
      const alreadyLost = initial - current;

      if (totalToLose > 0) {
        progressPercent = Math.max(
          0,
          Math.min(100, Math.round((alreadyLost / totalToLose) * 100))
        );
      }

      remaining = current - target;
    }

    return {
      name: project.name,
      goal: project.goal || null,
      currentWeight: currentWeight ? Number(currentWeight.value) : null,
      targetWeight: targetWeightMeasurement
        ? Number(targetWeightMeasurement.value)
        : null,
      remaining,
      progressPercent,
    };
  });
}

// ─── Finanças ─────────────────────────────────────────────

function currencyPt(value: number): string {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchFinancialSummary(clientId: string): Promise<{ entradas: number; saidas: number; saldo: number } | null> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `${year}-${month}`;

  const { data, error } = await supabase
    .from("finances")
    .select("*")
    .eq("client_id", clientId);

  if (error || !data) return null;

  const monthData = data.filter((row: any) => {
    const d = row.date || row.created_at || "";
    return d.startsWith(prefix);
  });

  if (monthData.length === 0) return null;

  let entradas = 0;
  let saidas = 0;

  for (const row of monthData) {
    const val = Number(row.amount || 0);
    if (row.type === "entrada") entradas += val;
    if (row.type === "saida") saidas += val;
  }

  return { entradas, saidas, saldo: entradas - saidas };
}

// ─── Montagem da mensagem ─────────────────────────────────

function formatAppointmentLine(item: ParsedAppointment): string {
  const time = item.time ? `${item.time}` : "sem horário";
  return `• ${time} — ${item.title}`;
}

function formatProjectLine(project: ProjectSummary): string {
  let line = `• ${project.name}`;

  if (
    project.currentWeight !== null &&
    project.targetWeight !== null &&
    project.remaining !== null
  ) {
    line += `: ${numberPt(project.currentWeight)}kg → meta ${numberPt(
      project.targetWeight
    )}kg`;

    if (project.remaining > 0) {
      line += ` (faltam ${numberPt(project.remaining)}kg — ${
        project.progressPercent
      }%)`;
    } else if (project.remaining === 0) {
      line += ` (META ATINGIDA! 🎯)`;
    } else {
      line += ` (superou a meta em ${numberPt(
        Math.abs(project.remaining)
      )}kg! 🎯)`;
    }
  } else if (project.goal) {
    line += `: ${project.goal}`;
  }

  return line;
}

async function buildBriefingMessage(clientId: string, clientName?: string): Promise<{ textMessage: string; audioText: string } | null> {
  const today = getTodayIso();
  const tomorrow = addDays(today, 1);
  const weekday = getWeekdayName(today);

  const [todayAppointments, tomorrowAppointments, projects, finances] =
    await Promise.all([
      fetchAppointmentsForDate(today, clientId),
      fetchAppointmentsForDate(tomorrow, clientId),
      fetchProjectSummaries(clientId),
      fetchFinancialSummary(clientId),
    ]);

  // Se não tem absolutamente nada, ainda envia? Vamos enviar um bom dia curto.
  
  const lines: string[] = [];

  // Header
  const firstWordName = clientName ? clientName.split(" ")[0] : "";
  const greetingName = firstWordName ? ` ${firstWordName}` : "";

  lines.push(
    `☀️ Bom dia${greetingName}. Briefing de ${weekday}, ${formatDatePtBr(today)}:\n`
  );

  // Agenda de hoje
  lines.push("📅 *AGENDA DE HOJE*");

  if (todayAppointments.length === 0) {
    lines.push("Nenhum compromisso para hoje.");
  } else {
    for (const item of todayAppointments) {
      lines.push(formatAppointmentLine(item));
    }
  }

  // Agenda de amanhã
  lines.push("");
  lines.push("📅 *AMANHÃ*");

  if (tomorrowAppointments.length === 0) {
    lines.push("Nenhum compromisso para amanhã.");
  } else {
    for (const item of tomorrowAppointments) {
      lines.push(formatAppointmentLine(item));
    }
  }

  // Finanças
  if (finances) {
    lines.push("");
    lines.push("💰 *RESUMO FINANCEIRO (MÊS)*");
    lines.push(`• Entradas: R$ ${currencyPt(finances.entradas)}`);
    lines.push(`• Saídas: R$ ${currencyPt(finances.saidas)}`);
    
    if (finances.saldo > 0) {
      lines.push(`• Balanço: Positivo em R$ ${currencyPt(finances.saldo)}`);
    } else if (finances.saldo < 0) {
      lines.push(`• Balanço: Negativo em R$ ${currencyPt(Math.abs(finances.saldo))}`);
    } else {
      lines.push(`• Balanço: R$ 0,00`);
    }
  }

  // Projetos
  if (projects.length > 0) {
    lines.push("");
    lines.push("📊 *PROJETOS ATIVOS*");

    for (const project of projects) {
      lines.push(formatProjectLine(project));
    }
  }
  lines.push("");
  lines.push("Sistemas operacionais. Tenha um excelente dia.");

  // Texto com markdown para leitura visual no WhatsApp
  const textMessage = lines.join("\n");

  // Versão limpa para áudio (sem emojis, sem asteriscos)
  const audioText = lines
    .join("\n")
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { textMessage, audioText };
}

// ─── Envio ────────────────────────────────────────────────

export async function sendDailyBriefing(): Promise<{
  sent: boolean;
  reason?: string;
}> {
  if (!isBriefingEnabled()) {
    return { sent: false, reason: "Briefing desativado." };
  }

  const status = getWhatsAppStatus();

  if (status.status !== "connected") {
    console.log(
      "JAVIS Briefing: WhatsApp não conectado. Briefing não enviado."
    );
    return { sent: false, reason: "WhatsApp não conectado." };
  }

  const sock = getWhatsAppSocket();

  if (!sock) {
    console.log("JAVIS Briefing: Socket não disponível.");
    return { sent: false, reason: "Socket indisponível." };
  }

  try {
    // Buscar todos os clientes ativos para o Multi-Tenant
    const { data: clients, error } = await supabase.from('clients').select('*').eq('status', 'active');
    
    if (error || !clients) {
      console.log("JAVIS Briefing: Erro ao buscar clientes ativos.");
      return { sent: false, reason: "Erro no banco de dados." };
    }

    console.log(`JAVIS Briefing: Iniciando envio para ${clients.length} clientes ativos...`);

    for (const client of clients) {
      const jid = client.whatsapp_jid;
      if (!jid) continue;

      try {
        const payload = await buildBriefingMessage(client.id, client.name);
        if (!payload) continue;

        // 1. Envia o texto do briefing
        await sock.sendMessage(jid, { text: payload.textMessage });
        console.log(`JAVIS Briefing: Texto enviado para ${client.name || jid}.`);

        // 2. Gera e envia o áudio do briefing (convertido para OGG Opus)
        try {
          await sock.sendPresenceUpdate("recording", jid);
          const mp3Path = await generateJavisAudio(payload.audioText);

          // Converte para OGG Opus (formato nativo do WhatsApp PTT)
          const oggPath = mp3Path.replace(/\.mp3$/, ".ogg");
          await new Promise<void>((resolve, reject) => {
            const ff = spawn("ffmpeg", ["-y", "-i", mp3Path, "-c:a", "libopus", "-b:a", "48k", "-ar", "48000", "-ac", "1", oggPath], { shell: false });
            ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${code}`))));
            ff.on("error", reject);
          });

          const audioBuffer = await fs.readFile(oggPath);
          await sock.sendMessage(jid, { audio: audioBuffer, mimetype: "audio/ogg; codecs=opus", ptt: true });
          await sock.sendPresenceUpdate("paused", jid);

          // Limpa temp
          fs.unlink(mp3Path).catch(() => {});
          fs.unlink(oggPath).catch(() => {});

          console.log(`JAVIS Briefing: ✅ Áudio OGG enviado para ${client.name || jid}.`);
        } catch (audioError: any) {
          console.warn(`JAVIS Briefing: Áudio falhou para ${client.name || jid}:`, audioError?.message);
        }
        
      } catch (clientErr: any) {
        console.error(`JAVIS Briefing: Falha ao enviar para ${client.name || jid}:`, clientErr?.message);
      }
    }

    console.log("JAVIS Briefing: ✅ Processo Multi-Tenant concluído.");
    return { sent: true };
  } catch (error: any) {
    console.error(
      "JAVIS Briefing: Erro fatal ao executar loop de envio:",
      error?.message || error
    );
    return { sent: false, reason: error?.message || "Erro desconhecido." };
  }
}

// ─── Scheduler (cron) ────────────────────────────────────

export function startDailyBriefingScheduler(): void {
  if (!isBriefingEnabled()) {
    console.log(
      "JAVIS Briefing: Desativado (DAILY_BRIEFING_ENABLED ≠ true)."
    );
    return;
  }

  const { hour, minute } = getBriefingTime();
  const cronExpression = `${minute} ${hour} * * *`;

  if (!cron.validate(cronExpression)) {
    console.error(
      `JAVIS Briefing: Expressão cron inválida: ${cronExpression}`
    );
    return;
  }

  cron.schedule(
    cronExpression,
    () => {
      sendDailyBriefing().catch((error) => {
        console.error("JAVIS Briefing: Erro no scheduler:", error);
      });
    },
    {
      timezone: TIMEZONE,
    }
  );

  console.log(
    `JAVIS Briefing: ✅ Agendado para ${pad(hour)}:${pad(
      minute
    )} (${TIMEZONE}) [Multi-Tenant].`
  );
}

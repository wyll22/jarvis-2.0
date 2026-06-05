import { Router } from "express";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabase.js";
import * as GeminiService from "../services/gemini.js";

const router = Router();

const TIMEZONE = "America/Sao_Paulo";

type PendingAppointment = {
  title?: string;
  date?: string;
  time?: string;
  notes?: string;
  createdAt: number;
};

type AppointmentView = {
  title: string;
  date: string;
  time?: string;
  raw: any;
};

const pendingAppointments = new Map<string, PendingAppointment>();

function sendReply(
  res: Response,
  reply: string,
  intent = "chat",
  extra: Record<string, any> = {}
): void {
  res.json({
    ok: true,
    success: true,
    reply,
    response: reply,
    message: reply,
    text: reply,
    content: reply,
    data: {
      reply,
      response: reply,
      message: reply,
      text: reply,
      content: reply,
    },
    result: {
      reply,
      response: reply,
      message: reply,
      text: reply,
      content: reply,
    },
    intent,
    ...extra,
  });
}

function normalizeText(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function getTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value || "1970";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";

  return `${year}-${month}-${day}`;
}

function getNowTime(): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";

  return `${hour}:${minute}`;
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

function getSessionKey(req: Request): string {
  const body = req.body || {};

  return String(
    body.sessionId ||
      body.conversationId ||
      body.contactId ||
      body.contact_id ||
      body.phone ||
      body.userId ||
      req.ip ||
      "default"
  );
}

function cleanupPendingAppointments(): void {
  const maxAgeMs = 30 * 60 * 1000;
  const now = Date.now();

  for (const [key, value] of pendingAppointments.entries()) {
    if (now - value.createdAt > maxAgeMs) {
      pendingAppointments.delete(key);
    }
  }
}

function extractDate(text: string): string | undefined {
  const normalized = normalizeText(text);
  const today = getTodayIso();

  if (normalized.includes("depois de amanha")) {
    return addDays(today, 2);
  }

  if (/\bamanha\b/.test(normalized)) {
    return addDays(today, 1);
  }

  if (/\bhoje\b/.test(normalized)) {
    return today;
  }

  const numericDate = normalized.match(
    /\b(?:dia\s*)?(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/
  );

  if (numericDate) {
    const day = Number(numericDate[1]);
    const month = Number(numericDate[2]);
    let year = numericDate[3]
      ? Number(numericDate[3])
      : Number(today.slice(0, 4));

    if (year < 100) year += 2000;

    let iso = `${year}-${pad(month)}-${pad(day)}`;

    if (!numericDate[3] && iso < today) {
      iso = `${year + 1}-${pad(month)}-${pad(day)}`;
    }

    return iso;
  }

  const months: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };

  const writtenDate = normalized.match(
    /\b(?:dia\s*)?(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{2,4}))?\b/
  );

  if (writtenDate) {
    const day = Number(writtenDate[1]);
    const month = months[writtenDate[2]];

    if (!month) return undefined;

    let year = writtenDate[3]
      ? Number(writtenDate[3])
      : Number(today.slice(0, 4));

    if (year < 100) year += 2000;

    let iso = `${year}-${pad(month)}-${pad(day)}`;

    if (!writtenDate[3] && iso < today) {
      iso = `${year + 1}-${pad(month)}-${pad(day)}`;
    }

    return iso;
  }

  const weekdays: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    "segunda-feira": 1,
    terca: 2,
    "terca-feira": 2,
    quarta: 3,
    "quarta-feira": 3,
    quinta: 4,
    "quinta-feira": 4,
    sexta: 5,
    "sexta-feira": 5,
    sabado: 6,
  };

  for (const [weekdayName, weekdayNumber] of Object.entries(weekdays)) {
    const regex = new RegExp(`\\b(?:proxima?\\s+)?${weekdayName}\\b`, "i");

    if (regex.test(normalized)) {
      const [yearRaw, monthRaw, dayRaw] = today.split("-");

      const year = Number(yearRaw);
      const month = Number(monthRaw);
      const day = Number(dayRaw);

      const currentDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const currentWeekday = currentDate.getUTCDay();

      let diff = (weekdayNumber - currentWeekday + 7) % 7;

      if (diff === 0) diff = 7;

      return addDays(today, diff);
    }
  }

  return undefined;
}

function extractTime(text: string): string | undefined {
  const normalized = normalizeText(text);

  const match =
    normalized.match(
      /\b(?:as|para as|pras|por volta das|por volta de)\s*(\d{1,2})(?:[:h](\d{2}))?\b/
    ) ||
    normalized.match(/\b(\d{1,2})[:h](\d{2})\b/) ||
    normalized.match(/\b(\d{1,2})\s*horas?\b/);

  if (!match) return undefined;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;

  const index = match.index || 0;
  const nearbyText = normalized.slice(index, index + 60);

  if (hour >= 1 && hour <= 11 && /(tarde|noite)/.test(nearbyText)) {
    hour += 12;
  }

  if (hour === 12 && /(manha|madrugada)/.test(nearbyText)) {
    hour = 0;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }

  return `${pad(hour)}:${pad(minute)}`;
}

function extractTitle(text: string): string | undefined {
  let title = String(text || "");

  title = title.replace(
    /\b(quero|preciso|pode|por favor|favor|gostaria de)\b/gi,
    ""
  );

  title = title.replace(
    /\b(agendar|agende|agenda|marcar|marque|criar|crie|adicionar|adicione|colocar|coloque|registrar|registre)\b/gi,
    ""
  );

  title = title.replace(
    /\b(para hoje|hoje|amanhã|amanha|depois de amanhã|depois de amanha)\b/gi,
    ""
  );

  title = title.replace(
    /\b(?:próxima?|proxima?)?\s*(domingo|segunda-feira|segunda|terça-feira|terca-feira|terça|terca|quarta-feira|quarta|quinta-feira|quinta|sexta-feira|sexta|sábado|sabado)\b/gi,
    ""
  );

  title = title.replace(
    /\b(?:dia\s*)?\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g,
    ""
  );

  title = title.replace(
    /\b(?:dia\s*)?\d{1,2}\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+\d{2,4})?\b/gi,
    ""
  );

  title = title.replace(
    /\b(?:às|as|para as|pras|por volta das|por volta de)\s*\d{1,2}(?:[:h]\d{0,2})?\b/gi,
    ""
  );

  title = title.replace(/\b\d{1,2}[:h]\d{2}\b/g, "");

  title = title.replace(/\s+/g, " ").trim();
  title = title.replace(/^[,.;:\-\s]+|[,.;:\-\s]+$/g, "");

  const useless = ["compromisso", "um compromisso", "uma agenda", "agenda"];

  if (!title || title.length < 3) return undefined;
  if (useless.includes(normalizeText(title))) return undefined;

  return title.charAt(0).toUpperCase() + title.slice(1);
}

function isCreateAppointmentIntent(text: string): boolean {
  const normalized = normalizeText(text);

  return (
    /\b(agendar|agende|marcar|marque|criar agenda|adicionar agenda|colocar na agenda|registrar compromisso)\b/.test(
      normalized
    ) ||
    (/\b(compromisso|reuniao|consulta|visita|agenda)\b/.test(normalized) &&
      /\b(hoje|amanha|depois de amanha|as|para as|\d{1,2}[:h]\d{0,2})\b/.test(
        normalized
      ))
  );
}

function isAgendaQuery(text: string): boolean {
  const normalized = normalizeText(text);

  if (
    /\b(proximo compromisso|proxima agenda|qual meu proximo|meu proximo compromisso)\b/.test(
      normalized
    )
  ) {
    return true;
  }

  return (
    /\b(agenda|compromisso|compromissos|marcado|tenho|tem)\b/.test(
      normalized
    ) && /\b(hoje|amanha|depois de amanha)\b/.test(normalized)
  );
}

function isMemoryCommand(text: string): boolean {
  const normalized = normalizeText(text);

  return /\b(lembre|memorize|salve na memoria|guarde na memoria|guardar na memoria)\b/.test(
    normalized
  );
}

function extractMemoryContent(text: string): string {
  return String(text || "")
    .replace(
      /\b(lembre que|memorize que|salve na memória que|salve na memoria que|guarde na memória que|guarde na memoria que)\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function saveMemory(content: string): Promise<any> {
  const candidates: any[] = [
    { content },
    { text: content },
    { memory: content },
    { description: content },
  ];

  let lastError: any = null;

  for (const payload of candidates) {
    const { data, error } = await supabase
      .from("memories")
      .insert(payload)
      .select()
      .single();

    if (!error) return data;

    lastError = error;
  }

  throw lastError;
}

async function saveAppointment(input: {
  title: string;
  date: string;
  time: string;
  notes?: string;
}): Promise<any> {
  const candidates: any[] = [
    {
      title: input.title,
      date: input.date,
      time: input.time,
      notes: input.notes || null,
      status: "scheduled",
    },
    {
      title: input.title,
      date: input.date,
      time: input.time,
      description: input.notes || null,
    },
    {
      title: input.title,
      appointment_date: input.date,
      appointment_time: input.time,
      notes: input.notes || null,
      status: "scheduled",
    },
    {
      title: input.title,
      appointment_date: input.date,
      appointment_time: input.time,
      description: input.notes || null,
    },
    {
      title: input.title,
      date: input.date,
      time: input.time,
    },
    {
      title: input.title,
      appointment_date: input.date,
      appointment_time: input.time,
    },
  ];

  let lastError: any = null;

  for (const payload of candidates) {
    const { data, error } = await supabase
      .from("appointments")
      .insert(payload)
      .select()
      .single();

    if (!error) return data;

    lastError = error;
  }

  throw lastError;
}

async function fetchAppointments(): Promise<AppointmentView[]> {
  const { data, error } = await supabase.from("appointments").select("*");

  if (error) {
    throw error;
  }

  return ((data || []).map(normalizeAppointmentRow).filter(Boolean) ||
    []) as AppointmentView[];
}

function normalizeAppointmentRow(row: any): AppointmentView | null {
  if (!row) return null;

  const status = normalizeText(String(row.status || ""));

  if (["cancelado", "cancelled", "canceled"].includes(status)) {
    return null;
  }

  const title =
    row.title ||
    row.name ||
    row.subject ||
    row.description ||
    row.notes ||
    "Compromisso";

  const rawDate =
    row.date ||
    row.appointment_date ||
    row.scheduled_date ||
    row.day ||
    row.start_date ||
    row.start_at ||
    row.datetime;

  const rawTime =
    row.time ||
    row.appointment_time ||
    row.scheduled_time ||
    row.hour ||
    row.start_time;

  const date = parseRowDate(rawDate);
  const time = parseRowTime(rawTime || rawDate);

  if (!date) return null;

  return {
    title: String(title),
    date,
    time,
    raw: row,
  };
}

function parseRowDate(value: any): string | undefined {
  if (!value) return undefined;

  const text = String(value);

  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}/);

  if (isoMatch) return isoMatch[0];

  const brMatch = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);

  if (brMatch) {
    let year = Number(brMatch[3]);

    if (year < 100) year += 2000;

    return `${year}-${pad(Number(brMatch[2]))}-${pad(Number(brMatch[1]))}`;
  }

  return undefined;
}

function parseRowTime(value: any): string | undefined {
  if (!value) return undefined;

  const text = String(value);

  const match =
    text.match(/\b(\d{1,2}):(\d{2})\b/) ||
    text.match(/\b(\d{1,2})h(\d{2})?\b/);

  if (!match) return undefined;

  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }

  return `${pad(hour)}:${pad(minute)}`;
}

function sortAppointments(items: AppointmentView[]): AppointmentView[] {
  return [...items].sort((a, b) => {
    const aKey = `${a.date} ${a.time || "00:00"}`;
    const bKey = `${b.date} ${b.time || "00:00"}`;

    return aKey.localeCompare(bKey);
  });
}

function formatAppointmentLine(item: AppointmentView): string {
  const time = item.time ? `às ${item.time}` : "sem horário definido";

  return `• ${time} — ${item.title}`;
}

async function listAppointmentsForDate(
  date: string,
  label: string
): Promise<string> {
  const appointments = await fetchAppointments();

  const filtered = sortAppointments(
    appointments.filter((item) => item.date === date)
  );

  if (filtered.length === 0) {
    return `Senhor, não encontrei nenhum compromisso para ${label}.`;
  }

  return `Senhor, estes são os compromissos para ${label}:\n\n${filtered
    .map(formatAppointmentLine)
    .join("\n")}`;
}

async function getNextAppointmentReply(): Promise<string> {
  const today = getTodayIso();
  const nowTime = getNowTime();

  const appointments = await fetchAppointments();

  const futureAppointments = sortAppointments(
    appointments.filter((item) => {
      if (item.date > today) return true;
      if (item.date < today) return false;

      if (!item.time) return true;

      return item.time >= nowTime;
    })
  );

  const next = futureAppointments[0];

  if (!next) {
    return "Senhor, não encontrei nenhum próximo compromisso na agenda.";
  }

  const date = next.date === today ? "hoje" : formatDatePtBr(next.date);
  const time = next.time ? ` às ${next.time}` : "";

  return `Senhor, seu próximo compromisso é "${next.title}" em ${date}${time}.`;
}

function getMissingAppointmentQuestion(input: PendingAppointment): string | null {
  if (!input.title && !input.date && !input.time) {
    return "Claro, Senhor. Qual compromisso deseja agendar, para qual dia e qual horário?";
  }

  if (!input.title) {
    return "Certo, Senhor. Qual é o nome ou finalidade desse compromisso?";
  }

  if (!input.date && !input.time) {
    return `Certo, Senhor. Para qual dia e horário deseja agendar "${input.title}"?`;
  }

  if (!input.date) {
    return `Certo, Senhor. Para qual dia deseja agendar "${input.title}"?`;
  }

  if (!input.time) {
    return `Certo, Senhor. Qual horário deseja para "${input.title}" em ${formatDatePtBr(
      input.date
    )}?`;
  }

  return null;
}

async function handleAppointmentCreation(
  req: Request,
  message: string
): Promise<string> {
  const sessionKey = getSessionKey(req);
  const existing = pendingAppointments.get(sessionKey);

  const extracted: PendingAppointment = {
    title: extractTitle(message),
    date: extractDate(message),
    time: extractTime(message),
    createdAt: Date.now(),
  };

  const merged: PendingAppointment = {
    ...(existing || {}),
    createdAt: Date.now(),
  };

  if (extracted.title !== undefined) merged.title = extracted.title;
  if (extracted.date !== undefined) merged.date = extracted.date;
  if (extracted.time !== undefined) merged.time = extracted.time;

  const missingQuestion = getMissingAppointmentQuestion(merged);

  if (missingQuestion) {
    pendingAppointments.set(sessionKey, merged);

    return missingQuestion;
  }

  const title = merged.title as string;
  const date = merged.date as string;
  const time = merged.time as string;

  await saveAppointment({
    title,
    date,
    time,
    notes: merged.notes,
  });

  pendingAppointments.delete(sessionKey);

  return `Pronto, Senhor. Agendei "${title}" para ${formatDatePtBr(
    date
  )} às ${time}.`;
}

async function callGemini(prompt: string): Promise<string> {
  const service: any = GeminiService;

  const possibleFunctionNames = [
    "generateResponse",
    "generateGeminiResponse",
    "generateJavisResponse",
    "generateAIResponse",
    "generateText",
    "askGemini",
    "sendToGemini",
    "runGemini",
    "chatWithGemini",
    "default",
  ];

  for (const functionName of possibleFunctionNames) {
    if (typeof service[functionName] === "function") {
      const result = await service[functionName](prompt);

      if (typeof result === "string") return result;
      if (result?.reply) return String(result.reply);
      if (result?.response) return String(result.response);
      if (result?.message) return String(result.message);
      if (result?.text) return String(result.text);
      if (result?.content) return String(result.content);

      return JSON.stringify(result);
    }
  }

  return "Senhor, o Gemini está conectado no projeto, mas não consegui identificar a função exportada em backend/src/services/gemini.ts.";
}

async function getMemoryContext(): Promise<string> {
  const { data, error } = await supabase.from("memories").select("*").limit(10);

  if (error || !data?.length) return "";

  return data
    .map(
      (item: any) =>
        item.content || item.text || item.memory || item.description || ""
    )
    .filter(Boolean)
    .map((item: string) => `- ${item}`)
    .join("\n");
}

async function getAgendaContext(): Promise<string> {
  try {
    const today = getTodayIso();
    const tomorrow = addDays(today, 1);

    const appointments = await fetchAppointments();

    const todayItems = sortAppointments(
      appointments.filter((item) => item.date === today)
    );

    const tomorrowItems = sortAppointments(
      appointments.filter((item) => item.date === tomorrow)
    );

    const lines: string[] = [];

    if (todayItems.length) {
      lines.push(
        `Agenda de hoje:\n${todayItems.map(formatAppointmentLine).join("\n")}`
      );
    }

    if (tomorrowItems.length) {
      lines.push(
        `Agenda de amanhã:\n${tomorrowItems
          .map(formatAppointmentLine)
          .join("\n")}`
      );
    }

    return lines.join("\n\n");
  } catch {
    return "";
  }
}

router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const message = String(
      req.body?.message || req.body?.text || req.body?.prompt || ""
    ).trim();

    if (!message) {
      res.status(400).json({
        ok: false,
        success: false,
        error: "Mensagem vazia.",
      });

      return;
    }

    // Migrado para jarvisCore — motor único de inteligência
    const { processJavisCoreMessage } = await import("../services/jarvisCore.js");

    // Resolve o clientId do admin automaticamente quando o painel não envia um explícito
    let clientId = req.body?.clientId;
    if (!clientId) {
      const { getAdminClientId } = await import("../lib/adminClient.js");
      clientId = await getAdminClientId();
    }

    const result = await processJavisCoreMessage({
      message,
      sessionId: getSessionKey(req),
      source: "panel",
      clientId,
    });

    sendReply(res, result.reply, undefined);

    return;
  } catch (error: any) {
    console.error("Erro na rota /chat:", error);

    res.status(500).json({
      ok: false,
      success: false,
      error: "Erro interno no chat.",
      details: error?.message || String(error),
    });

    return;
  }
});

export default router;
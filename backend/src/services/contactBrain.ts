import { supabase } from "../lib/supabase.js";
import { generateJavisReply } from "./gemini.js";

type ContactIntent =
  | "save_contact"
  | "find_contact"
  | "list_contacts"
  | "not_contact";

type ContactAnalysis = {
  intent: ContactIntent;
  name: string | null;
  phone: string | null;
  notes: string | null;
  confidence: number;
};

type ContactRow = {
  id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ContactBrainInput = {
  message: string;
  sessionId?: string;
  source?: "whatsapp" | "panel";
  clientId?: string;   // multi-tenant: client_id do Supabase
};

type ContactBrainOutput = {
  handled: boolean;
  reply: string;
};

type PendingContactFlow = {
  name: string | null;
  phone: string | null;
  notes: string | null;
  createdAt: number;
};

const pendingContactFlows = new Map<string, PendingContactFlow>();

const PENDING_FLOW_TTL_MS = 10 * 60 * 1000;

const GENERIC_NAME_WORDS = new Set([
  "loja",
  "empresa",
  "contato",
  "telefone",
  "numero",
  "número",
  "zap",
  "whatsapp",
  "cliente",
  "fornecedor",
  "pessoa",
  "fulano",
  "ciclano",
]);

const STOP_WORDS = new Set([
  "o",
  "a",
  "os",
  "as",
  "um",
  "uma",
  "do",
  "da",
  "de",
  "dos",
  "das",
  "e",
  "eh",
  "é",
  "me",
  "meu",
  "minha",
  "por",
  "favor",
  "pra",
  "para",
  "com",
  "qual",
  "cade",
  "cadê",
  "numero",
  "número",
  "telefone",
  "contato",
  "zap",
  "whatsapp",
  "loja",
  "empresa",
]);

function normalizeText(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function removePhoneFromText(text: string): string {
  return String(text || "").replace(
    /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s.]?\d{4}/g,
    " "
  );
}

function cleanPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const digits = String(phone).replace(/\D/g, "");

  if (digits.length < 8) return null;

  if (digits.startsWith("55")) return `+${digits}`;

  if (digits.length >= 10 && digits.length <= 11) {
    return `+55${digits}`;
  }

  return `+${digits}`;
}

function titleCaseName(name: string): string {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();

      if (["da", "de", "do", "das", "dos", "e"].includes(lower)) {
        return lower;
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ")
    .trim();
}

function cleanName(name: string | null | undefined): string | null {
  if (!name) return null;

  let cleaned = String(name)
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();

  cleaned = removePhoneFromText(cleaned);

  cleaned = cleaned
    .replace(
      /\b(contato|telefone|numero|número|zap|whatsapp|cliente|fornecedor|pessoa)\b/gi,
      " "
    )
    .replace(/^\s*(da|de|do|das|dos)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const normalized = normalizeText(cleaned);

  if (!cleaned) return null;

  if (GENERIC_NAME_WORDS.has(normalized)) {
    return null;
  }

  if (cleaned.length < 2) return null;

  return titleCaseName(cleaned);
}

function isGenericName(name: string | null | undefined): boolean {
  if (!name) return true;

  const normalized = normalizeText(name);

  return !normalized || GENERIC_NAME_WORDS.has(normalized);
}

function extractJson(text: string): any | null {
  const raw = String(text || "").trim();

  try {
    return JSON.parse(raw);
  } catch {
    // continua
  }

  const match = raw.match(/\{[\s\S]*\}/);

  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function extractPhoneByRegex(message: string): string | null {
  const match = String(message || "").match(
    /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s.]?\d{4}/
  );

  if (!match) return null;

  return cleanPhone(match[0]);
}

function sanitizePossibleName(value: string): string | null {
  let cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();

  cleaned = removePhoneFromText(cleaned);

  cleaned = cleaned
    .replace(
      /\b(salva|salvar|guarda|guardar|anota|anotar|cadastre|cadastra|adiciona|adicionar|registra|registrar|qual|cade|cadê|me manda|manda|buscar|busca|procura|procurar)\b/gi,
      " "
    )
    .replace(
      /\b(contato|telefone|numero|número|zap|whatsapp)\b/gi,
      " "
    )
    .replace(/\b(da|de|do|das|dos)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleanName(cleaned);
}

function extractBusinessName(message: string): string | null {
  const text = String(message || "").trim();

  const patterns = [
    /(?:loja|empresa|agropecuaria|agropecuária|mercado|oficina|clinica|clínica|restaurante|distribuidora|fazenda|chacara|chácara)\s+([a-zA-ZÀ-ÿ0-9\s]{2,90}?)(?:,|\.|;|:| telefone| número| numero| contato| zap| whatsapp| é| e|\d|$)/i,
    /(?:contato|telefone|numero|número|zap|whatsapp)\s+(?:da|do|de)\s+(?:loja|empresa)?\s*([a-zA-ZÀ-ÿ0-9\s]{2,90}?)(?:,|\.|;|:| telefone| número| numero| contato| zap| whatsapp| é| e|\d|$)/i,
    /(?:salva|salvar|guarda|guardar|anota|anotar|cadastre|cadastra|adiciona|adicionar|registra|registrar)\s+(?:o\s+)?(?:contato\s+)?(?:da|do|de)?\s*(?:loja|empresa)?\s*([a-zA-ZÀ-ÿ0-9\s]{2,90}?)(?:,|\.|;|:| telefone| número| numero| contato| zap| whatsapp| é| e|\d|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      const name = sanitizePossibleName(match[1]);

      if (name && !isGenericName(name)) {
        return name;
      }
    }
  }

  return null;
}

function extractNameByHeuristic(message: string): string | null {
  const text = String(message || "").trim();

  const businessName = extractBusinessName(text);

  if (businessName) return businessName;

  const patterns = [
    /(?:contato|telefone|numero|número|zap|whatsapp)\s+(?:do|da|de)\s+([a-zA-ZÀ-ÿ0-9\s]{2,80})/i,
    /(?:salva|salvar|guarda|guardar|anota|anotar|cadastre|cadastra|adiciona|adicionar|registra|registrar)\s+(?:o\s+)?(?:contato\s+)?(?:do|da|de)?\s*([a-zA-ZÀ-ÿ0-9\s]{2,80})/i,
    /(?:o|a)\s+([a-zA-ZÀ-ÿ0-9\s]{2,80})\s+(?:é|e|eh)\s+(?:o\s+)?(?:contato|telefone|numero|número|zap|whatsapp)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      const name = sanitizePossibleName(match[1]);

      if (name && !isGenericName(name)) {
        return name;
      }
    }
  }

  return null;
}

function looksLikeContactMessage(message: string): boolean {
  const normalized = normalizeText(message);

  if (extractPhoneByRegex(message)) return true;

  return /\b(contato|contatos|telefone|numero|número|zap|whatsapp|agenda de contatos|base de contatos|salva|salvar|guarda|guardar|anota|anotar|cadastre|cadastra|adiciona|adicionar|registra|registrar|me manda o contato|me passa o contato)\b/.test(
    normalized
  );
}

function quickContactAnalysis(message: string): ContactAnalysis | null {
  const normalized = normalizeText(message);
  const phone = extractPhoneByRegex(message);
  const name = extractNameByHeuristic(message);

  const wantsSave =
    /\b(salva|salvar|guarda|guardar|anota|anotar|cadastre|cadastra|adiciona|adicionar|registra|registrar)\b/.test(
      normalized
    ) ||
    (/\b(telefone|numero|número|zap|whatsapp|contato)\b/.test(normalized) &&
      /\b(e|é|eh)\b/.test(normalized) &&
      Boolean(phone));

  const wantsFind =
    /\b(qual|cade|cadê|me manda|manda|buscar|busca|procura|procurar|me passa|passa)\b/.test(
      normalized
    ) &&
    /\b(contato|telefone|numero|número|zap|whatsapp)\b/.test(normalized) &&
    !phone;

  const wantsList =
    /\b(lista|listar|mostra|mostrar|quais|todos)\b/.test(normalized) &&
    /\b(contatos|agenda de contatos|base de contatos)\b/.test(normalized);

  if (wantsList) {
    return {
      intent: "list_contacts",
      name: null,
      phone: null,
      notes: null,
      confidence: 0.92,
    };
  }

  if (wantsSave && (phone || name)) {
    return {
      intent: "save_contact",
      name,
      phone,
      notes: null,
      confidence: name || phone ? 0.78 : 0.6,
    };
  }

  if (wantsFind) {
    return {
      intent: "find_contact",
      name,
      phone: null,
      notes: null,
      confidence: name ? 0.78 : 0.62,
    };
  }

  return null;
}

async function analyzeContactIntentWithAI(message: string): Promise<ContactAnalysis> {
  const prompt = `
Você é o ContactBrain do JAVIS.

Sua tarefa é entender mensagens naturais, inclusive áudio transcrito com erros, e responder SOMENTE em JSON válido, sem markdown.

Intenções possíveis:
- "save_contact": usuário quer salvar, anotar, cadastrar ou atualizar um contato.
- "find_contact": usuário quer consultar telefone, número, WhatsApp, contato ou informação de uma pessoa/empresa.
- "list_contacts": usuário quer listar/ver todos os contatos.
- "not_contact": mensagem não tem relação com contatos.

Campos:
- name: nome real da pessoa/empresa.
- phone: telefone/WhatsApp, se existir.
- notes: observação útil, se existir.
- confidence: número de 0 a 1.

Regras importantes:
1. Entenda português informal, erros de digitação e áudio transcrito.
2. Nunca use como nome palavras genéricas sozinhas: "loja", "empresa", "contato", "telefone", "número", "zap", "whatsapp".
3. Se a mensagem falar "loja Campo Verde Agropecuária", o name deve ser "Campo Verde Agropecuária", nunca "Loja".
4. Se a mensagem falar "salva o contato da loja Campo Verde Agropecuária, número 61998440188", retorne save_contact, name "Campo Verde Agropecuária", phone "+5561998440188".
5. Se a mensagem falar "qual o número da loja Campo Verde?", retorne find_contact, name "Campo Verde".
6. Se a mensagem falar "o telefone do Pedro é 61999999999", retorne save_contact.
7. Se a mensagem falar "qual o telefone do Pedro?", retorne find_contact.
8. Se faltar telefone em save_contact, deixe phone null.
9. Se faltar nome em find_contact, deixe name null.
10. Não invente telefone, nome ou observação.
11. Responda apenas JSON válido.

Mensagem:
${message}

Formato obrigatório:
{
  "intent": "save_contact",
  "name": "Pedro",
  "phone": "+5561999999999",
  "notes": null,
  "confidence": 0.95
}
`.trim();

  const aiReply = await generateJavisReply(prompt, "lite");
  const parsed = extractJson(aiReply);

  const intent = parsed?.intent as ContactIntent;

  if (!["save_contact", "find_contact", "list_contacts", "not_contact"].includes(intent)) {
    return {
      intent: "not_contact",
      name: null,
      phone: null,
      notes: null,
      confidence: 0,
    };
  }

  const cleanedName = cleanName(parsed?.name || null);
  const heuristicName = extractNameByHeuristic(message);

  const finalName =
    cleanedName && !isGenericName(cleanedName)
      ? cleanedName
      : heuristicName && !isGenericName(heuristicName)
        ? heuristicName
        : null;

  return {
    intent,
    name: finalName,
    phone: cleanPhone(parsed?.phone || extractPhoneByRegex(message) || null),
    notes: parsed?.notes ? String(parsed.notes).trim() : null,
    confidence: Number(parsed?.confidence || 0),
  };
}

async function analyzeContactIntent(message: string): Promise<ContactAnalysis> {
  const quick = quickContactAnalysis(message);

  if (!looksLikeContactMessage(message) && !quick) {
    return {
      intent: "not_contact",
      name: null,
      phone: null,
      notes: null,
      confidence: 0,
    };
  }

  try {
    const ai = await analyzeContactIntentWithAI(message);

    if (ai.intent !== "not_contact" && ai.confidence >= 0.55) {
      return ai;
    }
  } catch (error) {
    console.error("Erro ao analisar contato com IA:", error);
  }

  return (
    quick || {
      intent: "not_contact",
      name: null,
      phone: null,
      notes: null,
      confidence: 0,
    }
  );
}

function contactMatchesQuery(contact: ContactRow, query: string): boolean {
  const normalizedQuery = normalizeText(query);
  const normalizedName = normalizeText(contact.name || "");
  const normalizedNotes = normalizeText(contact.notes || "");
  const phoneDigits = String(contact.phone || "").replace(/\D/g, "");
  const queryDigits = String(query || "").replace(/\D/g, "");

  if (!normalizedQuery) return false;

  if (queryDigits && phoneDigits.includes(queryDigits)) return true;

  if (normalizedName.includes(normalizedQuery)) return true;
  if (normalizedQuery.includes(normalizedName) && normalizedName.length >= 3) return true;
  if (normalizedNotes.includes(normalizedQuery)) return true;

  const words = normalizedQuery
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));

  if (!words.length) return false;

  return words.every(
    (word) => normalizedName.includes(word) || normalizedNotes.includes(word)
  );
}

async function listContacts(clientId?: string): Promise<ContactRow[]> {
  if (!clientId) {
    console.warn("[contactBrain] listContacts chamado sem clientId — busca global (legado)");
  }
  let q = supabase.from("contacts").select("*").order("name", { ascending: true });
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q.limit(100);
  if (error) throw error;
  return (data || []) as ContactRow[];
}

async function findContactsByName(name: string, clientId?: string): Promise<ContactRow[]> {
  const cleanedName = cleanName(name) || String(name || "").trim();
  if (!cleanedName) return [];
  const allContacts = await listContacts(clientId);
  return allContacts.filter((contact) => contactMatchesQuery(contact, cleanedName)).slice(0, 10);
}

async function findContactByPhone(phone: string, clientId?: string): Promise<ContactRow | null> {
  const cleanedPhone = cleanPhone(phone);
  if (!cleanedPhone) return null;
  let q = supabase.from("contacts").select("*").eq("phone", cleanedPhone).limit(1);
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data || null) as ContactRow | null;
}

async function saveContact(analysis: ContactAnalysis, clientId?: string): Promise<ContactRow> {
  if (!clientId) {
    console.warn("[contactBrain] saveContact chamado sem clientId — salvando sem vinculação (legado)");
  }
  const name = cleanName(analysis.name);
  const phone = cleanPhone(analysis.phone);
  const notes = analysis.notes?.trim() || null;

  if (!name) throw new Error("Nome do contato não identificado.");
  if (!phone && !notes) throw new Error("Telefone ou observação do contato não identificado.");

  const existingByPhone = phone ? await findContactByPhone(phone, clientId) : null;

  if (existingByPhone) {
    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (!isGenericName(name)) updatePayload.name = name;
    if (phone) updatePayload.phone = phone;
    if (notes) updatePayload.notes = notes;
    const { data, error } = await supabase.from("contacts").update(updatePayload).eq("id", existingByPhone.id).select("*").single();
    if (error) throw error;
    return data as ContactRow;
  }

  const existing = await findContactsByName(name, clientId);
  const exact = existing.find((item) => normalizeText(item.name) === normalizeText(name));

  if (exact) {
    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (phone) updatePayload.phone = phone;
    if (notes) updatePayload.notes = notes;
    const { data, error } = await supabase.from("contacts").update(updatePayload).eq("id", exact.id).select("*").single();
    if (error) throw error;
    return data as ContactRow;
  }

  const insertPayload: Record<string, any> = { name };
  if (phone) insertPayload.phone = phone;
  if (notes) insertPayload.notes = notes;
  if (clientId) insertPayload.client_id = clientId;

  const { data, error } = await supabase.from("contacts").insert([insertPayload]).select("*").single();
  if (error) throw error;
  return data as ContactRow;
}

function formatContact(contact: ContactRow): string {
  const lines = [`${contact.name}`];

  if (contact.phone) {
    lines.push(`Telefone: ${contact.phone}`);
  }

  if (contact.notes) {
    lines.push(`Obs.: ${contact.notes}`);
  }

  return lines.join("\n");
}

function formatContactList(contacts: ContactRow[]): string {
  if (!contacts.length) {
    return "Senhor, sua base de contatos está vazia.";
  }

  return `Senhor, encontrei estes contatos:\n\n${contacts
    .slice(0, 30)
    .map(
      (contact, index) =>
        `${index + 1}. ${contact.name}${contact.phone ? ` — ${contact.phone}` : ""}`
    )
    .join("\n")}`;
}

function getFlowKey(input: ContactBrainInput): string {
  return input.sessionId || input.source || "default";
}

function getPendingFlow(input: ContactBrainInput): PendingContactFlow | null {
  const key = getFlowKey(input);
  const flow = pendingContactFlows.get(key);

  if (!flow) return null;

  if (Date.now() - flow.createdAt > PENDING_FLOW_TTL_MS) {
    pendingContactFlows.delete(key);
    return null;
  }

  return flow;
}

function setPendingFlow(input: ContactBrainInput, flow: PendingContactFlow): void {
  pendingContactFlows.set(getFlowKey(input), flow);
}

function clearPendingFlow(input: ContactBrainInput): void {
  pendingContactFlows.delete(getFlowKey(input));
}

function isCancelMessage(message: string): boolean {
  const normalized = normalizeText(message);

  return /\b(cancela|cancelar|deixa pra la|deixa pra lá|esquece|para|pare)\b/.test(
    normalized
  );
}

async function processPendingContactFlow(
  input: ContactBrainInput,
  flow: PendingContactFlow
): Promise<ContactBrainOutput> {
  const message = String(input.message || "").trim();

  if (isCancelMessage(message)) {
    clearPendingFlow(input);

    return {
      handled: true,
      reply: "Certo, Senhor. Cancelei o cadastro desse contato.",
    };
  }

  const analysis = await analyzeContactIntent(message);
  const phone = analysis.phone || extractPhoneByRegex(message);
  const name = analysis.name || extractNameByHeuristic(message);
  const notes =
    analysis.notes ||
    (!phone && !name && message.length > 2 ? message : null);

  const updatedFlow: PendingContactFlow = {
    ...flow,
    name: flow.name || name || null,
    phone: flow.phone || phone || null,
    notes: flow.notes || notes || null,
    createdAt: flow.createdAt,
  };

  if (!updatedFlow.name) {
    setPendingFlow(input, updatedFlow);

    return {
      handled: true,
      reply: "Senhor, qual é o nome da pessoa ou empresa desse contato?",
    };
  }

  if (!updatedFlow.phone && !updatedFlow.notes) {
    setPendingFlow(input, updatedFlow);

    return {
      handled: true,
      reply: `Senhor, qual é o telefone ou observação que devo salvar para ${updatedFlow.name}?`,
    };
  }

  const saved = await saveContact({
    intent: "save_contact",
    name: updatedFlow.name,
    phone: updatedFlow.phone,
    notes: updatedFlow.notes,
    confidence: 1,
  });

  clearPendingFlow(input);

  return {
    handled: true,
    reply: `Contato salvo, Senhor.\n\n${formatContact(saved)}`,
  };
}

export async function getContactsContext(clientId?: string): Promise<string> {
  if (!clientId) {
    console.warn("[contactBrain] getContactsContext chamado sem clientId — busca global (legado)");
  }
  try {
    const contacts = await listContacts(clientId);
    if (!contacts.length) return "Nenhum contato cadastrado.";
    return contacts.slice(0, 20).map((contact) => {
      return `- ${contact.name}${contact.phone ? `: ${contact.phone}` : ""}${
        contact.notes ? ` (${contact.notes})` : ""
      }`;
    }).join("\n");
  } catch (error) {
    console.error("Erro ao montar contexto de contatos:", error);
    return "Não foi possível carregar contatos.";
  }
}

export async function processContactMessage(
  input: ContactBrainInput
): Promise<ContactBrainOutput> {
  const message = String(input.message || "").trim();
  const clientId = input.clientId;

  if (!clientId) {
    console.warn("[contactBrain] processContactMessage chamado sem clientId");
  }

  if (!message) return { handled: false, reply: "" };

  const pendingFlow = getPendingFlow(input);

  if (pendingFlow) {
    return processPendingContactFlow(input, pendingFlow);
  }

  if (!looksLikeContactMessage(message)) {
    return {
      handled: false,
      reply: "",
    };
  }

  const analysis = await analyzeContactIntent(message);

  console.log("ContactBrain análise:", analysis);

  if (analysis.intent === "not_contact" || analysis.confidence < 0.55) {
    return {
      handled: false,
      reply: "",
    };
  }

  if (analysis.intent === "list_contacts") {
    const contacts = await listContacts(clientId);
    return { handled: true, reply: formatContactList(contacts) };
  }

  if (analysis.intent === "save_contact") {
    if (!analysis.name) {
      setPendingFlow(input, {
        name: null,
        phone: analysis.phone,
        notes: analysis.notes,
        createdAt: Date.now(),
      });

      return {
        handled: true,
        reply:
          "Senhor, entendi que deseja salvar um contato. Qual é o nome da pessoa ou empresa?",
      };
    }

    if (!analysis.phone && !analysis.notes) {
      setPendingFlow(input, {
        name: analysis.name,
        phone: null,
        notes: null,
        createdAt: Date.now(),
      });

      return {
        handled: true,
        reply: `Senhor, qual é o telefone ou observação que devo salvar para ${analysis.name}?`,
      };
    }

    const saved = await saveContact(analysis, clientId);
    return { handled: true, reply: `Contato salvo, Senhor.\n\n${formatContact(saved)}` };
  }

  if (analysis.intent === "find_contact") {
    if (!analysis.name) {
      return {
        handled: true,
        reply: "Senhor, qual contato deseja consultar?",
      };
    }

    const contacts = await findContactsByName(analysis.name, clientId);

    if (!contacts.length) {
      return {
        handled: true,
        reply: `Senhor, não encontrei nenhum contato chamado ${analysis.name}.`,
      };
    }

    if (contacts.length === 1) {
      return {
        handled: true,
        reply: `Senhor, encontrei este contato:\n\n${formatContact(contacts[0])}`,
      };
    }

    return {
      handled: true,
      reply: `Senhor, encontrei mais de um contato parecido:\n\n${contacts
        .map((contact, index) => `${index + 1}. ${formatContact(contact)}`)
        .join("\n\n")}`,
    };
  }

  return {
    handled: false,
    reply: "",
  };
}
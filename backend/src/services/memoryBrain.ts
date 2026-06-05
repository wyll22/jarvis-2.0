import { supabase } from "../lib/supabase.js";
import { generateJavisReply } from "./gemini.js";

type MemoryIntent =
  | "save_memory"
  | "find_memory"
  | "list_memories"
  | "delete_memory"
  | "not_memory";

type MemoryAnalysis = {
  intent: MemoryIntent;
  shouldSave: boolean;
  content: string | null;
  query: string | null;
  category: string | null;
  importance: number;
  confidence: number;
};

type MemoryRow = {
  id: string;
  content: string;
  category?: string | null;
  importance?: number | null;
  source?: string | null;
  created_at?: string;
  updated_at?: string;
};

type MemoryBrainInput = {
  message: string;
  sessionId?: string;
  source?: "whatsapp" | "panel";
  clientId?: string;   // multi-tenant: client_id do Supabase
};

type MemoryBrainOutput = {
  handled: boolean;
  reply: string;
};

const MEMORY_MIN_CONFIDENCE = 0.65;

function normalizeText(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cleanMemoryContent(content: string | null | undefined): string | null {
  if (!content) return null;

  const cleaned = String(content)
    .replace(/\s+/g, " ")
    .replace(/^lembra que\s+/i, "")
    .replace(/^lembrar que\s+/i, "")
    .replace(/^memoriza que\s+/i, "")
    .replace(/^memorizar que\s+/i, "")
    .replace(/^salva na memoria que\s+/i, "")
    .replace(/^salva na memória que\s+/i, "")
    .replace(/^guarda na memoria que\s+/i, "")
    .replace(/^guarda na memória que\s+/i, "")
    .replace(/^guarda que\s+/i, "")
    .replace(/^anota que\s+/i, "")
    .replace(/^salva isso\s*/i, "")
    .replace(/^guarda isso\s*/i, "")
    .replace(/^anota isso\s*/i, "")
    .trim();

  if (!cleaned) return null;
  if (cleaned.length < 5) return null;

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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

function isExplicitSaveMemoryMessage(message: string): boolean {
  const normalized = normalizeText(message);

  return /\b(lembra que|lembrar que|memoriza que|memorizar que|salva na memoria que|salva na memória que|guarda na memoria que|guarda na memória que|guarda que|anota que|salva isso|guarda isso|anota isso)\b/.test(
    normalized
  );
}

function isMemoryQuestion(message: string): boolean {
  const normalized = normalizeText(message);

  if (isExplicitSaveMemoryMessage(message)) {
    return false;
  }

  return (
    /\b(voce lembra|você lembra|o que voce sabe|o que você sabe|o que eu gosto|qual e meu|qual é meu|qual meu|meu time|meu carro|meu celular|meu telefone|minha loja|minha empresa|minha meta|minhas preferencias|minhas preferências|minhas memorias|minhas memórias)\b/.test(
      normalized
    ) ||
    (/\b(qual|quais|oque|o que|me fala|me diga|sabe|lembra)\b/.test(
      normalized
    ) &&
      /\b(memoria|memória|lembra|lembranca|lembrança|preferencia|preferência|time|coracao|coração|carro|celular|telefone|iphone|meta|gosto|loja|empresa)\b/.test(
        normalized
      ))
  );
}

function isListMemoryMessage(message: string): boolean {
  const normalized = normalizeText(message);

  return (
    /\b(lista|listar|mostra|mostrar|quais|todas|todos)\b/.test(normalized) &&
    /\b(memoria|memória|memorias|memórias|lembrancas|lembranças)\b/.test(
      normalized
    )
  );
}

function isDeleteMemoryMessage(message: string): boolean {
  const normalized = normalizeText(message);

  return (
    /\b(apaga|apagar|remove|remover|deleta|deletar|esquece|esquecer)\b/.test(
      normalized
    ) &&
    /\b(memoria|memória|lembranca|lembrança|isso|que)\b/.test(normalized)
  );
}

function isPotentialLongTermMemory(message: string): boolean {
  const normalized = normalizeText(message);

  if (!normalized) return false;

  if (isExplicitSaveMemoryMessage(message)) return true;

  const patterns = [
    /\b(eu gosto de|eu gosto do|eu gosto da|gosto de|gosto do|gosto da)\b/,
    /\b(eu nao gosto de|eu não gosto de|nao gosto de|não gosto de)\b/,
    /\b(prefiro|minha preferencia|minha preferência)\b/,
    /\b(meu carro e|meu carro é|minha moto e|minha moto é)\b/,
    /\b(meu celular e|meu celular é|meu telefone e|meu telefone é)\b/,
    /\b(meu time e|meu time é|meu time do coracao e|meu time do coração é|torco para|torço para)\b/,
    /\b(minha loja e|minha loja é|minha empresa e|minha empresa é)\b/,
    /\b(meu objetivo e|meu objetivo é|minha meta e|minha meta é)\b/,
    /\b(eu trabalho com|trabalho com|minha profissao e|minha profissão é)\b/,
    /\b(tenho um|tenho uma|eu tenho um|eu tenho uma)\b/,
    /\b(meu nome e|meu nome é)\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function getFallbackExplicitMemoryContent(message: string): string | null {
  const raw = cleanMemoryContent(message);

  if (!raw) return null;

  const normalized = normalizeText(raw);

  if (/\bmeu carro e\b/.test(normalized)) {
    const value = raw.replace(/^meu carro (e|é)\s+/i, "").trim();
    return value ? `O carro do Senhor é ${value}.` : raw;
  }

  if (/\bminha moto e\b/.test(normalized)) {
    const value = raw.replace(/^minha moto (e|é)\s+/i, "").trim();
    return value ? `A moto do Senhor é ${value}.` : raw;
  }

  if (/\bmeu celular e\b|\bmeu telefone e\b/.test(normalized)) {
    const value = raw
      .replace(/^meu celular (e|é)\s+/i, "")
      .replace(/^meu telefone (e|é)\s+/i, "")
      .trim();

    return value ? `O celular do Senhor é ${value}.` : raw;
  }

  if (/\btenho um iphone\b|\beu tenho um iphone\b/.test(normalized)) {
    const value = raw
      .replace(/^eu tenho um\s+/i, "")
      .replace(/^tenho um\s+/i, "")
      .trim();

    return value ? `O Senhor tem um ${value}.` : raw;
  }

  if (/\bmeu time e\b|\bmeu time do coracao e\b|\btorco para\b/.test(normalized)) {
    const value = raw
      .replace(/^meu time do coração (e|é)\s+/i, "")
      .replace(/^meu time do coracao (e|é)\s+/i, "")
      .replace(/^meu time (e|é)\s+/i, "")
      .replace(/^eu torço para\s+/i, "")
      .replace(/^eu torco para\s+/i, "")
      .replace(/^torço para\s+/i, "")
      .replace(/^torco para\s+/i, "")
      .trim();

    return value ? `O time do coração do Senhor é ${value}.` : raw;
  }

  if (/\bminha loja e\b/.test(normalized)) {
    const value = raw.replace(/^minha loja (e|é)\s+/i, "").trim();
    return value ? `A loja do Senhor é ${value}.` : raw;
  }

  if (/\bminha empresa e\b/.test(normalized)) {
    const value = raw.replace(/^minha empresa (e|é)\s+/i, "").trim();
    return value ? `A empresa do Senhor é ${value}.` : raw;
  }

  if (/\bgosto de\b|\beu gosto de\b/.test(normalized)) {
    const value = raw
      .replace(/^eu gosto de\s+/i, "")
      .replace(/^gosto de\s+/i, "")
      .trim();

    return value ? `O Senhor gosta de ${value}.` : raw;
  }

  if (
    /\bnao gosto de\b|\bnão gosto de\b|\beu nao gosto de\b|\beu não gosto de\b/.test(
      normalized
    )
  ) {
    const value = raw
      .replace(/^eu não gosto de\s+/i, "")
      .replace(/^eu nao gosto de\s+/i, "")
      .replace(/^não gosto de\s+/i, "")
      .replace(/^nao gosto de\s+/i, "")
      .trim();

    return value ? `O Senhor não gosta de ${value}.` : raw;
  }

  return raw;
}

function quickMemoryAnalysis(message: string): MemoryAnalysis | null {
  if (isListMemoryMessage(message)) {
    return {
      intent: "list_memories",
      shouldSave: false,
      content: null,
      query: null,
      category: null,
      importance: 5,
      confidence: 0.9,
    };
  }

  if (isDeleteMemoryMessage(message)) {
    return {
      intent: "delete_memory",
      shouldSave: false,
      content: null,
      query: message,
      category: null,
      importance: 5,
      confidence: 0.75,
    };
  }

  if (isExplicitSaveMemoryMessage(message)) {
    const content = getFallbackExplicitMemoryContent(message);

    return {
      intent: "save_memory",
      shouldSave: Boolean(content),
      content,
      query: null,
      category: "perfil",
      importance: 7,
      confidence: content ? 0.95 : 0.55,
    };
  }

  if (isMemoryQuestion(message)) {
    return {
      intent: "find_memory",
      shouldSave: false,
      content: null,
      query: message,
      category: null,
      importance: 5,
      confidence: 0.9,
    };
  }

  if (isPotentialLongTermMemory(message)) {
    return {
      intent: "save_memory",
      shouldSave: true,
      content: getFallbackExplicitMemoryContent(message),
      query: null,
      category: "perfil",
      importance: 6,
      confidence: 0.68,
    };
  }

  return null;
}

async function analyzeMemoryWithAI(message: string): Promise<MemoryAnalysis> {
  const prompt = `
Você é o MemoryBrain do JAVIS.

Sua tarefa é decidir se uma mensagem contém algo útil para memória de longo prazo do assistente.

Responda SOMENTE em JSON válido, sem markdown.

Intenções possíveis:
- "save_memory": quando deve salvar uma informação duradoura.
- "find_memory": quando o usuário pergunta algo que pode estar na memória.
- "list_memories": quando o usuário quer listar memórias.
- "delete_memory": quando o usuário quer apagar/esquecer uma memória.
- "not_memory": quando não tem relação com memória.

Regras críticas:
1. Se a mensagem começar com ou contiver "lembra que", "salva na memória que", "guarda que" ou "anota que", a intenção SEMPRE é "save_memory".
2. "Lembra que meu carro é um Tiggo 8" deve virar save_memory, nunca find_memory.
3. "Você lembra qual é meu carro?" deve virar find_memory.
4. "Qual é meu carro?" deve virar find_memory.
5. "Qual é meu time do coração" deve virar find_memory com query "time do coração".
6. "Qual é meu celular" deve virar find_memory com query "celular".
7. Não salve notícia, clima, cotação, resultado de jogo, pergunta passageira ou comando operacional.
8. Não invente dados.
9. Não use query genérica como "perfil" quando o usuário perguntou algo específico.

Salve apenas informações úteis e duradouras:
- preferências do usuário
- dados pessoais úteis
- trabalho, loja, empresa, rotina
- objetivos/metas
- carro, celular, time, gostos, estilo de resposta
- informações que o JAVIS deve lembrar depois

Exemplos:
"lembra que meu carro é um Tiggo 8" -> save_memory, content "O carro do Senhor é um Tiggo 8."
"eu gosto de café sem açúcar" -> save_memory, content "O Senhor gosta de café sem açúcar."
"meu carro é um Tiggo 8" -> save_memory, content "O carro do Senhor é um Tiggo 8."
"meu time do coração é o Botafogo" -> save_memory, content "O time do coração do Senhor é o Botafogo."
"tenho um iPhone 15 Pro Max" -> save_memory, content "O Senhor tem um iPhone 15 Pro Max."
"qual a cotação do dólar hoje?" -> not_memory
"qual é meu carro?" -> find_memory, query "carro"
"qual é meu celular?" -> find_memory, query "celular"
"qual é meu time do coração" -> find_memory, query "time do coração"
"lista minhas memórias" -> list_memories
"esquece que eu gosto de café" -> delete_memory

Mensagem:
${message}

Formato obrigatório:
{
  "intent": "find_memory",
  "shouldSave": false,
  "content": null,
  "query": "carro",
  "category": null,
  "importance": 5,
  "confidence": 0.95
}
`.trim();

  const aiReply = await generateJavisReply(prompt, "lite");
  const parsed = extractJson(aiReply);

  const intent = parsed?.intent as MemoryIntent;

  if (
    ![
      "save_memory",
      "find_memory",
      "list_memories",
      "delete_memory",
      "not_memory",
    ].includes(intent)
  ) {
    return {
      intent: "not_memory",
      shouldSave: false,
      content: null,
      query: null,
      category: null,
      importance: 0,
      confidence: 0,
    };
  }

  return {
    intent,
    shouldSave: Boolean(parsed?.shouldSave),
    content: cleanMemoryContent(parsed?.content || null),
    query: parsed?.query ? String(parsed.query).trim() : null,
    category: parsed?.category ? String(parsed.category).trim() : null,
    importance: Math.max(1, Math.min(10, Number(parsed?.importance || 5))),
    confidence: Math.max(0, Math.min(1, Number(parsed?.confidence || 0))),
  };
}

async function analyzeMemory(message: string): Promise<MemoryAnalysis> {
  const quick = quickMemoryAnalysis(message);

  if (quick?.intent === "save_memory" && isExplicitSaveMemoryMessage(message)) {
    try {
      const ai = await analyzeMemoryWithAI(message);

      return {
        intent: "save_memory",
        shouldSave: true,
        content: ai.content || quick.content,
        query: null,
        category: ai.category || quick.category || "perfil",
        importance: Math.max(ai.importance || 0, quick.importance || 7),
        confidence: Math.max(ai.confidence || 0, quick.confidence || 0.95),
      };
    } catch (error) {
      console.error("Erro ao melhorar memória explícita com IA:", error);
      return quick;
    }
  }

  if (!quick && !isPotentialLongTermMemory(message) && !isMemoryQuestion(message)) {
    return {
      intent: "not_memory",
      shouldSave: false,
      content: null,
      query: null,
      category: null,
      importance: 0,
      confidence: 0,
    };
  }

  try {
    const ai = await analyzeMemoryWithAI(message);

    if (isExplicitSaveMemoryMessage(message)) {
      return {
        intent: "save_memory",
        shouldSave: true,
        content: ai.content || quick?.content || getFallbackExplicitMemoryContent(message),
        query: null,
        category: ai.category || quick?.category || "perfil",
        importance: Math.max(ai.importance || 0, quick?.importance || 7),
        confidence: Math.max(ai.confidence || 0, quick?.confidence || 0.95),
      };
    }

    if (quick?.intent === "find_memory") {
      return {
        ...quick,
        query: ai.query || quick.query || message,
        confidence: Math.max(ai.confidence || 0, quick.confidence || 0.9),
      };
    }

    if (ai.confidence >= MEMORY_MIN_CONFIDENCE || ai.intent !== "not_memory") {
      return ai;
    }
  } catch (error) {
    console.error("Erro ao analisar memória com IA:", error);
  }

  return (
    quick || {
      intent: "not_memory",
      shouldSave: false,
      content: null,
      query: null,
      category: null,
      importance: 0,
      confidence: 0,
    }
  );
}

async function listMemories(clientId?: string): Promise<MemoryRow[]> {
  if (!clientId) {
    console.warn("[memoryBrain] listMemories chamado sem clientId — busca global (legado)");
  }
  let q = supabase
    .from("memories")
    .select("*")
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q.limit(100);
  if (error) throw error;
  return (data || []) as MemoryRow[];
}

function getMemoryTopicTerms(query: string): string[] {
  const normalized = normalizeText(query);

  if (/\b(carro|veiculo|veículo|automovel|automóvel)\b/.test(normalized)) {
    return ["carro", "veiculo", "automovel", "tiggo", "chery"];
  }

  if (/\b(celular|telefone|iphone|smartphone|aparelho)\b/.test(normalized)) {
    return ["celular", "telefone", "iphone", "smartphone", "aparelho"];
  }

  if (/\b(time|torco|torço|futebol|coracao|coração)\b/.test(normalized)) {
    return ["time", "torco", "futebol", "coracao", "botafogo"];
  }

  if (/\b(cafe|café|bebida|gosto|preferencia|preferência)\b/.test(normalized)) {
    return ["cafe", "bebida", "gosto", "prefere", "gosta", "preferencia"];
  }

  if (/\b(loja|empresa|trabalho|negocio|negócio)\b/.test(normalized)) {
    return ["loja", "empresa", "trabalho", "negocio"];
  }

  if (/\b(peso|meta|emagrecer|emagrecimento)\b/.test(normalized)) {
    return ["peso", "meta", "emagrecer", "emagrecimento"];
  }

  return [];
}

function getUsefulQueryWords(query: string): string[] {
  const stopWords = new Set([
    "qual",
    "quais",
    "meu",
    "minha",
    "meus",
    "minhas",
    "voce",
    "você",
    "sabe",
    "lembra",
    "memoria",
    "memória",
    "sobre",
    "que",
    "de",
    "do",
    "da",
    "dos",
    "das",
    "e",
    "é",
    "o",
    "a",
    "um",
    "uma",
    "pra",
    "para",
    "me",
    "fala",
    "diga",
  ]);

  return normalizeText(query)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopWords.has(word));
}

function memoryScore(memory: MemoryRow, query: string): number {
  const normalizedContent = normalizeText(memory.content || "");
  const topicTerms = getMemoryTopicTerms(query);

  let score = 0;

  if (topicTerms.length) {
    for (const term of topicTerms) {
      const normalizedTerm = normalizeText(term);

      if (normalizedContent.includes(normalizedTerm)) {
        score += 10;
      }
    }

    return score;
  }

  const words = getUsefulQueryWords(query);

  for (const word of words) {
    if (normalizedContent.includes(word)) {
      score += 3;
    }
  }

  return score;
}

function memoryMatchesQuery(memory: MemoryRow, query: string): boolean {
  return memoryScore(memory, query) > 0;
}

async function findMemories(query: string, clientId?: string): Promise<MemoryRow[]> {
  const memories = await listMemories(clientId);

  return memories
    .map((memory) => ({
      memory,
      score: memoryScore(memory, query),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.memory);
}

async function saveMemory(
  content: string,
  category: string | null,
  importance: number,
  source: string,
  clientId?: string
): Promise<MemoryRow> {
  if (!clientId) {
    console.warn("[memoryBrain] saveMemory chamado sem clientId — salvando sem vinculação (legado)");
  }
  const cleanedContent = cleanMemoryContent(content);

  if (!cleanedContent) {
    throw new Error("Conteúdo de memória vazio.");
  }

  const memories = await listMemories(clientId);
  const normalizedNew = normalizeText(cleanedContent);

  const existing = memories.find((memory) => {
    const normalizedExisting = normalizeText(memory.content || "");
    return (
      normalizedExisting === normalizedNew ||
      normalizedExisting.includes(normalizedNew) ||
      normalizedNew.includes(normalizedExisting)
    );
  });

  if (existing) {
    const { data, error } = await supabase
      .from("memories")
      .update({
        content: cleanedContent,
        category: category || existing.category || "geral",
        importance: Math.max(Number(existing.importance || 5), importance),
        source,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as MemoryRow;
  }

  const insertPayload: Record<string, unknown> = {
    content: cleanedContent,
    category: category || "geral",
    importance,
    source,
  };
  if (clientId) insertPayload.client_id = clientId;

  const { data, error } = await supabase
    .from("memories")
    .insert([insertPayload])
    .select("*")
    .single();
  if (error) throw error;
  return data as MemoryRow;
}

async function deleteMatchingMemories(query: string, clientId?: string): Promise<number> {
  const memories = await findMemories(query, clientId);

  if (!memories.length) return 0;

  const ids = memories.map((memory) => memory.id);
  const { error } = await supabase.from("memories").delete().in("id", ids);
  if (error) throw error;
  return ids.length;
}

function formatMemory(memory: MemoryRow): string {
  const category = memory.category ? ` [${memory.category}]` : "";

  return `- ${memory.content}${category}`;
}

function formatMemoryList(memories: MemoryRow[]): string {
  if (!memories.length) {
    return "Senhor, ainda não tenho memórias salvas.";
  }

  return `Senhor, estas são as memórias salvas:\n\n${memories
    .slice(0, 30)
    .map((memory) => formatMemory(memory))
    .join("\n")}`;
}

function resolveMemorySearchQuery(analysis: MemoryAnalysis, originalMessage: string): string {
  const originalHasTopic = getMemoryTopicTerms(originalMessage).length > 0;

  if (originalHasTopic) {
    return originalMessage;
  }

  const query = String(analysis.query || "").trim();
  const normalizedQuery = normalizeText(query);

  const genericQueries = new Set([
    "",
    "perfil",
    "geral",
    "memoria",
    "memória",
    "minhas memorias",
    "minhas memórias",
    "lembranca",
    "lembrança",
  ]);

  if (genericQueries.has(normalizedQuery)) {
    return originalMessage;
  }

  return query || originalMessage;
}

export async function getMemoryContext(clientId?: string): Promise<string> {
  if (!clientId) {
    console.warn("[memoryBrain] getMemoryContext chamado sem clientId — busca global (legado)");
  }
  try {
    const memories = await listMemories(clientId);
    if (!memories.length) return "Nenhuma memória relevante encontrada.";
    return memories.slice(0, 20).map((memory) => formatMemory(memory)).join("\n");
  } catch (error) {
    console.error("Erro ao montar contexto de memória:", error);
    return "Não foi possível carregar memórias.";
  }
}

export async function processMemoryMessage(
  input: MemoryBrainInput
): Promise<MemoryBrainOutput> {
  const message = String(input.message || "").trim();
  const clientId = input.clientId;

  if (!clientId) {
    console.warn("[memoryBrain] processMemoryMessage chamado sem clientId");
  }

  if (!message) return { handled: false, reply: "" };

  const analysis = await analyzeMemory(message);

  console.log("MemoryBrain análise:", analysis);

  if (analysis.intent === "not_memory" || analysis.confidence < 0.55) {
    return {
      handled: false,
      reply: "",
    };
  }

  if (analysis.intent === "list_memories") {
    const memories = await listMemories(clientId);
    return { handled: true, reply: formatMemoryList(memories) };
  }

  if (analysis.intent === "find_memory") {
    const query = resolveMemorySearchQuery(analysis, message);
    const memories = await findMemories(query, clientId);
    if (!memories.length) {
      return { handled: true, reply: "Senhor, não encontrei essa informação na memória." };
    }
    return {
      handled: true,
      reply: `Senhor, encontrei na memória:\n\n${memories.map((m) => formatMemory(m)).join("\n")}`,
    };
  }

  if (analysis.intent === "delete_memory") {
    const query = resolveMemorySearchQuery(analysis, message);
    const deletedCount = await deleteMatchingMemories(query, clientId);
    if (!deletedCount) {
      return { handled: true, reply: "Senhor, não encontrei nenhuma memória correspondente para apagar." };
    }
    return { handled: true, reply: `Certo, Senhor. Apaguei ${deletedCount} memória(s) correspondente(s).` };
  }

  if (analysis.intent === "save_memory") {
    if (!analysis.shouldSave || !analysis.content) {
      return {
        handled: false,
        reply: "",
      };
    }

    const saved = await saveMemory(
      analysis.content,
      analysis.category || "geral",
      analysis.importance || 5,
      input.source || "whatsapp",
      clientId
    );

    if (isExplicitSaveMemoryMessage(message)) {
      return {
        handled: true,
        reply: `Memória salva, Senhor.\n\n${formatMemory(saved)}`,
      };
    }

    return {
      handled: false,
      reply: "",
    };
  }

  return {
    handled: false,
    reply: "",
  };
}
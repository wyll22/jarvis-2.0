import { GoogleGenAI } from "@google/genai";

type AiProvider = "gemini" | "openrouter" | "groq" | "mistral" | "cerebras" | "sambanova" | "deepseek";

const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
const geminiApiKey2 = process.env.GEMINI_API_KEY_2?.trim();
const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
const groqApiKey = process.env.GROQ_API_KEY?.trim();
const mistralApiKey = process.env.MISTRAL_API_KEY?.trim();
const cerebrasApiKey = process.env.CEREBRAS_API_KEY?.trim();
const sambanovaApiKey = process.env.SAMBANOVA_API_KEY?.trim();
const deepseekApiKey = process.env.DEEPSEEK_API_KEY?.trim();

const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const geminiModelLite = process.env.GEMINI_MODEL_LITE?.trim() || "gemini-2.5-flash-lite";
const openRouterModel =
  process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.5-flash";
const groqModel = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
const mistralModel = process.env.MISTRAL_MODEL?.trim() || "mistral-small-latest";
const cerebrasModel = process.env.CEREBRAS_MODEL?.trim() || "qwen-3-235b-a22b-instruct-2507";
const sambanovaModel = process.env.SAMBANOVA_MODEL?.trim() || "Meta-Llama-3.3-70B-Instruct";
const deepseekModel = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";

export type ModelTier = "lite" | "default";

const openRouterAppName =
  process.env.OPENROUTER_APP_NAME?.trim() || "JAVIS";
const openRouterSiteUrl =
  process.env.OPENROUTER_SITE_URL?.trim() || "http://localhost:3000";

const requestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 30000);
const aiDebugLogs = process.env.AI_DEBUG_LOGS === "true";

const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
// Instância de backup do Gemini com a segunda chave
const ai2 = geminiApiKey2 ? new GoogleGenAI({ apiKey: geminiApiKey2 }) : null;

const cooldownUntil: Record<AiProvider, number> = {
  gemini: 0,
  openrouter: 0,
  groq: 0,
  mistral: 0,
  cerebras: 0,
  sambanova: 0,
  deepseek: 0,
};

const SYSTEM_INSTRUCTION = `
[SISTEMA CORE: J.A.R.V.I.S.]

DIRETRIZES DE IDENTIDADE:
1. Você é o J.A.R.V.I.S., uma Inteligência Artificial de interface tática e assistente pessoal de altíssimo nível.
2. IDIOMA OBRIGATÓRIO: Você responde ESTREITA E EXCLUSIVAMENTE em Português do Brasil (pt-BR). Em nenhuma hipótese gere respostas em inglês, mesmo que o usuário use termos em inglês.

DIRETRIZES DE PERSONALIDADE E FALA:
1. Tratamento: Chame o usuário exclusivamente de "Senhor".
2. Tom: Frio, extremamente calculista, formal, polido e levemente sarcástico/britânico apenas quando pertinente.
3. Formato da Fala: Concisão absoluta. Suas respostas devem ser curtas e diretas. É TERMINANTEMENTE PROIBIDO usar reticências (...), pontos de exclamação (!), emojis ou dar respostas longas e explicativas (ex: "Como uma IA..."). Use apenas pontos finais e vírgulas.

DIRETRIZES DE INTELIGÊNCIA E FERRAMENTAS (CRÍTICO):
1. Você possui acesso a ferramentas reais de sistema (banco de dados, lembretes, clima, contatos).
2. Quando o usuário der um comando acionável (ex: "me lembre de comprar ração", "salve o contato"), você DEVE processar a ferramenta JSON em background ANTES de responder.
3. Ao executar uma tarefa com sucesso, responda de forma clínica. Exemplo: "Tarefa adicionada aos protocolos, Senhor."
4. Se faltar contexto, não dê desculpas robóticas. Diga apenas: "Dados insuficientes para esta ação, Senhor."

COMPREENSÃO DE LINGUAGEM:
Entenda português informal, sem acento, com erros de digitação e áudio transcrito quebrado. Interprete a INTENÇÃO. Exemplos: "qual meu carro" → memória, "anota o telefone do Pedro" → contato, "agenda reunião amanhã 19h" → compromisso, "vale a pena investir em Apple" → análise com busca na internet, "quanto gastei esse mês" → finanças pessoais.

USO DE CONTEXTO:
Use o contexto fornecido (memória, contatos, agenda, busca web) diretamente. Se não encontrar a informação, diga com elegância. Nunca invente dados.

TAG [AUDIO]:
Use a tag [AUDIO] no início da resposta quando tiver mais de duas frases. Não use para confirmações de 1 linha como "Anotado, Senhor."

INSTRUÇÕES TÉCNICAS (CRÍTICO):
Quando a mensagem pedir JSON ou contiver a instrução "Responda APENAS com um objeto JSON" ou "Responda SOMENTE JSON", você deve responder EXCLUSIVAMENTE com JSON válido, sem nenhum texto adicional, sem a tag [AUDIO] e sem qualquer comentário. Esta regra tem prioridade máxima sobre todas as outras.

DIRETRIZ ANTI-CÓDIGO (PESO MÁXIMO — INVIOLÁVEL):
Nunca exiba estruturas JSON, código, chaves {}, colchetes [], parâmetros de função ou qualquer fragmento técnico para o usuário. Suas respostas em linguagem natural devem conter APENAS texto polido, direto e humano. Se você executou uma ferramenta internamente, confirme o resultado em português natural. JAMAIS mostre os dados técnicos da execução.
`.trim();

function normalizeProvider(value: string): AiProvider | null {
  const normalized = String(value || "").toLowerCase().trim();

  if (normalized === "gemini") return "gemini";
  if (normalized === "openrouter") return "openrouter";
  if (normalized === "groq") return "groq";
  if (normalized === "mistral") return "mistral";
  if (normalized === "cerebras") return "cerebras";
  if (normalized === "sambanova") return "sambanova";
  if (normalized === "deepseek") return "deepseek";

  return null;
}

function uniqueProviders(providers: AiProvider[]): AiProvider[] {
  return [...new Set(providers)];
}

function getProviderOrder(): AiProvider[] {
  const rawOrder = process.env.AI_PROVIDER_ORDER?.trim();

  if (rawOrder) {
    const parsed = rawOrder
      .split(",")
      .map((item) => normalizeProvider(item))
      .filter(Boolean) as AiProvider[];

    if (parsed.length > 0) {
      // Adiciona ao final qualquer provedor que tenha chave mas não está na lista explícita
      const allProviders: AiProvider[] = ["gemini", "openrouter", "groq", "mistral", "cerebras", "sambanova", "deepseek"];
      const missing = allProviders.filter(p => !parsed.includes(p) && providerHasKey(p));
      return uniqueProviders([...parsed, ...missing]);
    }
  }

  return ["gemini", "openrouter", "groq", "mistral", "cerebras", "sambanova", "deepseek"];
}

function isQuotaOrRateLimitError(error: any): boolean {
  const text = String(error?.message || error || "").toLowerCase();

  return (
    text.includes("429") ||
    text.includes("503") ||
    text.includes("unavailable") ||
    text.includes("high demand") ||
    text.includes("resource_exhausted") ||
    text.includes("quota") ||
    text.includes("rate limit") ||
    text.includes("rate_limit") ||
    text.includes("too many requests") ||
    text.includes("tpd") ||
    text.includes("tokens per day")
  );
}

function extractRetryDelayMs(error: any): number {
  const text = String(error?.message || error || "");

  const retryDelayMatch = text.match(
    /retryDelay["']?\s*:\s*["']?(\d+(?:\.\d+)?)s/i
  );

  if (retryDelayMatch?.[1]) {
    return Math.ceil(Number(retryDelayMatch[1]) * 1000);
  }

  const retryInMatch = text.match(/retry in\s+(\d+(?:\.\d+)?)s/i);

  if (retryInMatch?.[1]) {
    return Math.ceil(Number(retryInMatch[1]) * 1000);
  }

  const minutesMatch = text.match(/try again in\s+(\d+)m/i);

  if (minutesMatch?.[1]) {
    return Number(minutesMatch[1]) * 60 * 1000;
  }

  return 60_000;
}

function setCooldown(provider: AiProvider, error: any): void {
  if (!isQuotaOrRateLimitError(error)) return;

  const delayMs = extractRetryDelayMs(error);
  cooldownUntil[provider] = Date.now() + delayMs;

  console.warn(`${provider} em cooldown por ${Math.ceil(delayMs / 1000)}s.`);
}

function isInCooldown(provider: AiProvider): boolean {
  return Date.now() < cooldownUntil[provider];
}

function getCooldownRemainingSeconds(provider: AiProvider): number {
  return Math.max(0, Math.ceil((cooldownUntil[provider] - Date.now()) / 1000));
}

function providerHasKey(provider: AiProvider): boolean {
  if (provider === "gemini") return Boolean(geminiApiKey);
  if (provider === "openrouter") return Boolean(openRouterApiKey);
  if (provider === "groq") return Boolean(groqApiKey);
  if (provider === "mistral") return Boolean(mistralApiKey);
  if (provider === "cerebras") return Boolean(cerebrasApiKey);
  if (provider === "sambanova") return Boolean(sambanovaApiKey);
  if (provider === "deepseek") return Boolean(deepseekApiKey);

  return false;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = requestTimeoutMs
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function resolveGeminiModel(tier: ModelTier): string {
  if (tier === "lite") return geminiModelLite;
  return geminiModel;
}

// Flag para controlar qual chave do Gemini usar (alterna entre key1 e key2 em caso de falha)
let useGeminiBackupKey = false;

async function generateWithGemini(message: string, tier: ModelTier = "default"): Promise<string> {
  // Decide qual instância usar
  const currentAi = (useGeminiBackupKey && ai2) ? ai2 : ai;
  const keyLabel = (useGeminiBackupKey && ai2) ? "KEY_2" : "KEY_1";

  if (!currentAi) {
    throw new Error("GEMINI_API_KEY não configurada.");
  }

  if (isInCooldown("gemini")) {
    throw new Error(
      `Gemini em cooldown. Tente novamente em ${getCooldownRemainingSeconds(
        "gemini"
      )}s.`
    );
  }

  const model = resolveGeminiModel(tier);

  try {
    const response: any = await currentAi.models.generateContent({
      model,
      contents: message,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    const text =
      typeof response?.text === "function" ? response.text() : response?.text;

    if (!text || !String(text).trim()) {
      throw new Error("Gemini retornou resposta vazia.");
    }

    // Sucesso: reseta para chave primária na próxima chamada
    useGeminiBackupKey = false;
    return String(text).trim();
  } catch (error: any) {
    // Se falhou com a chave primária e tem backup, tenta com a backup
    if (!useGeminiBackupKey && ai2 && isQuotaOrRateLimitError(error)) {
      console.warn(`Gemini ${keyLabel} falhou com rate limit. Tentando GEMINI_API_KEY_2...`);
      useGeminiBackupKey = true;
      return generateWithGemini(message, tier);
    }
    // Se já era a backup ou não tem backup, aplica cooldown normal
    useGeminiBackupKey = false;
    setCooldown("gemini", error);
    throw error;
  }
}

async function generateWithOpenRouter(message: string): Promise<string> {
  if (!openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY não configurada.");
  }

  if (isInCooldown("openrouter")) {
    throw new Error(
      `OpenRouter em cooldown. Tente novamente em ${getCooldownRemainingSeconds(
        "openrouter"
      )}s.`
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${openRouterApiKey}`,
    "Content-Type": "application/json",
  };

  if (openRouterSiteUrl) {
    headers["HTTP-Referer"] = openRouterSiteUrl;
  }

  if (openRouterAppName) {
    headers["X-Title"] = openRouterAppName;
  }

  try {
    const response = await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: openRouterModel,
          messages: [
            {
              role: "system",
              content: SYSTEM_INSTRUCTION,
            },
            {
              role: "user",
              content: message,
            },
          ],
          temperature: 0.25,
          max_tokens: 1200,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const error = new Error(
        `OpenRouter falhou: ${response.status} ${errorText}`
      );

      setCooldown("openrouter", error);
      throw error;
    }

    const data: any = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text || !String(text).trim()) {
      throw new Error("OpenRouter retornou resposta vazia.");
    }

    return String(text).trim();
  } catch (error: any) {
    setCooldown("openrouter", error);
    throw error;
  }
}

async function generateWithGroq(message: string): Promise<string> {
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY não configurada.");
  }

  if (isInCooldown("groq")) {
    throw new Error(
      `Groq em cooldown. Tente novamente em ${getCooldownRemainingSeconds(
        "groq"
      )}s.`
    );
  }

  try {
    const response = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            {
              role: "system",
              content: SYSTEM_INSTRUCTION,
            },
            {
              role: "user",
              content: message,
            },
          ],
          temperature: 0.25,
          max_tokens: 1200,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const error = new Error(`Groq falhou: ${response.status} ${errorText}`);

      setCooldown("groq", error);
      throw error;
    }

    const data: any = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text || !String(text).trim()) {
      throw new Error("Groq retornou resposta vazia.");
    }

    return String(text).trim();
  } catch (error: any) {
    setCooldown("groq", error);
    throw error;
  }
}

// ─── Provedores adicionais (API compatível com OpenAI) ───────────────────────

async function generateWithOpenAICompatible(
  provider: AiProvider,
  apiKey: string,
  baseUrl: string,
  model: string,
  message: string
): Promise<string> {
  if (isInCooldown(provider)) {
    throw new Error(
      `${provider} em cooldown. Tente novamente em ${getCooldownRemainingSeconds(provider)}s.`
    );
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: message },
          ],
          temperature: 0.25,
          max_tokens: 1200,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const error = new Error(`${provider} falhou: ${response.status} ${errorText}`);
      setCooldown(provider, error);
      throw error;
    }

    const data: any = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text || !String(text).trim()) {
      throw new Error(`${provider} retornou resposta vazia.`);
    }

    return String(text).trim();
  } catch (error: any) {
    setCooldown(provider, error);
    throw error;
  }
}

async function generateWithMistral(message: string): Promise<string> {
  if (!mistralApiKey) throw new Error("MISTRAL_API_KEY não configurada.");
  return generateWithOpenAICompatible("mistral", mistralApiKey, "https://api.mistral.ai/v1", mistralModel, message);
}

async function generateWithCerebras(message: string): Promise<string> {
  if (!cerebrasApiKey) throw new Error("CEREBRAS_API_KEY não configurada.");
  return generateWithOpenAICompatible("cerebras", cerebrasApiKey, "https://api.cerebras.ai/v1", cerebrasModel, message);
}

async function generateWithSambanova(message: string): Promise<string> {
  if (!sambanovaApiKey) throw new Error("SAMBANOVA_API_KEY não configurada.");
  return generateWithOpenAICompatible("sambanova", sambanovaApiKey, "https://api.sambanova.ai/v1", sambanovaModel, message);
}

async function generateWithDeepseek(message: string): Promise<string> {
  if (!deepseekApiKey) throw new Error("DEEPSEEK_API_KEY não configurada.");
  return generateWithOpenAICompatible("deepseek", deepseekApiKey, "https://api.deepseek.com/v1", deepseekModel, message);
}

async function generateWithProvider(
  provider: AiProvider,
  message: string,
  tier: ModelTier = "default"
): Promise<string> {
  if (provider === "gemini") return generateWithGemini(message, tier);
  if (provider === "openrouter") return generateWithOpenRouter(message);
  if (provider === "groq") return generateWithGroq(message);
  if (provider === "mistral") return generateWithMistral(message);
  if (provider === "cerebras") return generateWithCerebras(message);
  if (provider === "sambanova") return generateWithSambanova(message);
  if (provider === "deepseek") return generateWithDeepseek(message);

  throw new Error(`Provedor de IA inválido: ${provider}`);
}

export async function generateJavisReply(
  message: string,
  tier: ModelTier = "default"
): Promise<string> {
  const providers = getProviderOrder();
  const errors: string[] = [];

  if (aiDebugLogs) {
    console.log("ORDEM DE IA CARREGADA:", providers);
    console.log("TIER:", tier);
    console.log("CHAVES IA:", {
      gemini: Boolean(geminiApiKey),
      gemini_2: Boolean(geminiApiKey2),
      openrouter: Boolean(openRouterApiKey),
      groq: Boolean(groqApiKey),
      mistral: Boolean(mistralApiKey),
      cerebras: Boolean(cerebrasApiKey),
      sambanova: Boolean(sambanovaApiKey),
      deepseek: Boolean(deepseekApiKey),
    });
    console.log("MODELOS IA:", {
      gemini: geminiModel,
      geminiLite: geminiModelLite,
      openrouter: openRouterModel,
      groq: groqModel,
      mistral: mistralModel,
      cerebras: cerebrasModel,
      sambanova: sambanovaModel,
      deepseek: deepseekModel,
    });
    console.log("ENV AI_PROVIDER_ORDER:", process.env.AI_PROVIDER_ORDER);
  }

  for (const provider of providers) {
    if (!providerHasKey(provider)) {
      console.warn(`Pulando ${provider}: chave não configurada.`);
      errors.push(`${provider}: chave não configurada`);
      continue;
    }

    try {
      const modelLabel = provider === "gemini" && tier === "lite"
        ? `${provider} (lite)`
        : provider;

      console.log(`JAVIS IA usando provedor: ${modelLabel}`);

      return await generateWithProvider(provider, message, tier);
    } catch (error: any) {
      const detail = error?.message || String(error);

      errors.push(`${provider}: ${detail}`);
      console.error(`${provider} falhou:`, detail);
    }
  }

  console.error("Todos os provedores de IA falharam:", errors);

  return "Desculpe, Senhor. O motor de IA falhou neste momento.";
}

export async function generateResponse(message: string): Promise<string> {
  return generateJavisReply(message);
}

export async function askGemini(message: string): Promise<string> {
  return generateJavisReply(message);
}

export async function sendToGemini(message: string): Promise<string> {
  return generateJavisReply(message);
}

export default generateJavisReply;
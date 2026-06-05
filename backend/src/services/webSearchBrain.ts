import { generateJavisReply } from "./gemini.js";

type WebSearchProvider = "serper" | "tavily" | "brave";

type WebSearchItem = {
  title: string;
  url?: string;
  snippet?: string;
  source?: WebSearchProvider;
};

type WebSearchResult = {
  provider: WebSearchProvider;
  query: string;
  answer?: string;
  results: WebSearchItem[];
};

type WebSearchBrainInput = {
  message: string;
  source?: "panel" | "whatsapp";
};

type WebSearchBrainOutput = {
  handled: boolean;
  reply: string;
  provider?: WebSearchProvider;
  results?: WebSearchItem[];
};

const DEFAULT_TIMEOUT_MS = 12000;

function normalizeText(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isWebSearchEnabled(): boolean {
  return process.env.WEB_SEARCH_ENABLED === "true";
}

function isSportsOrScoreQuery(message: string): boolean {
  const normalized = normalizeText(message);

  const hasSportsIntent =
    /\b(resultado|placar|ultimo jogo|proximo jogo|proxima partida|proximo confronto|jogo de ontem|quem ganhou|partida|campeonato|tabela|classificacao|calendario|agenda de jogos|quando joga|quando e o jogo|quando vai jogar|qual o jogo|qual e o jogo)\b/.test(
      normalized
    );

  const hasTeamOrSport =
    /\b(botafogo|flamengo|vasco|fluminense|palmeiras|corinthians|sao paulo|santos|gremio|internacional|brasileirao|libertadores|copa do brasil|sul-americana|sul americana|futebol)\b/.test(
      normalized
    );

  return hasSportsIntent && hasTeamOrSport;
}

function isCurrentInfoQuery(message: string): boolean {
  const normalized = normalizeText(message);

  return /\b(hoje|agora|atual|atualmente|ultimo|ultima|noticia|noticias|resultado|placar|preco|cotacao|dolar|euro|clima|previsao do tempo|quem ganhou|quando vai ser|quando vai jogar|proximo jogo|proxima partida|lancamento)\b/.test(
    normalized
  );
}

function isInvestmentQuery(message: string): boolean {
  const normalized = normalizeText(message);

  const hasInvestmentIntent =
    /\b(vale a pena|e bom investir|devo investir|me recomenda|analise|analisa|resumo sobre|perspectiva|tendencia|potencial de|riscos de|rentabilidade)\b/.test(normalized);

  const hasMarketTarget =
    /\b(acoes|acao|bolsa|mercado|investimento|ativo|fundo|etf|stock|cripto|bitcoin|ethereum|nft|renda fixa|renda variavel|tesouro|cdb|lci|lca|debenture|apple|google|microsoft|amazon|tesla|meta|nvidia|petrobras|vale|itau|bradesco|nubank|ambev|ibovespa|nasdaq|s&p|dow jones)\b/.test(normalized);

  return hasInvestmentIntent && hasMarketTarget;
}

function isAnalysisQuery(message: string): boolean {
  const normalized = normalizeText(message);

  // Perguntas de análise geral que precisam de informação atualizada
  return /\b(me (explica|resume|conta|fala sobre|analisa)|o que (e|sao|e que e)|como (funciona|e|esta)|quais (sao|foram|estao)|por que|quando (foi|e|sera)|quem e|historia de|fatos sobre|dados sobre)\b/.test(normalized) &&
    /\b(empresa|mercado|produto|servico|tecnologia|startup|setor|industria|economia|politica|ciencia|saude|esporte|cultura|arte|musica|filme|serie|livro|pessoa|celebridade|evento)\b/.test(normalized);
}

function shouldUseWebSearch(message: string): boolean {
  const normalized = normalizeText(message);

  if (!normalized) return false;

  if (isSportsOrScoreQuery(message)) return true;
  if (isCurrentInfoQuery(message)) return true;
  if (isInvestmentQuery(message)) return true;
  if (isAnalysisQuery(message)) return true;

  return false;
}

function getProviderOrder(message: string): WebSearchProvider[] {
  if (isSportsOrScoreQuery(message)) {
    return ["serper", "tavily", "brave"];
  }

  const primary = process.env.WEB_SEARCH_PRIMARY?.trim() as WebSearchProvider;
  const fallback1 = process.env.WEB_SEARCH_FALLBACK_1?.trim() as WebSearchProvider;
  const fallback2 = process.env.WEB_SEARCH_FALLBACK_2?.trim() as WebSearchProvider;

  const configured = [primary, fallback1, fallback2].filter((item) =>
    ["serper", "tavily", "brave"].includes(item)
  ) as WebSearchProvider[];

  if (configured.length > 0) {
    return [...new Set(configured)];
  }

  return ["serper", "tavily", "brave"];
}

function shortText(value: unknown, max = 900): string {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (clean.length <= max) return clean;

  return `${clean.slice(0, max)}...`;
}

function hasApiKey(provider: WebSearchProvider): boolean {
  if (provider === "serper") return Boolean(process.env.SERPER_API_KEY?.trim());
  if (provider === "tavily") return Boolean(process.env.TAVILY_API_KEY?.trim());
  if (provider === "brave") return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());

  return false;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
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

async function readJson(response: Response): Promise<any> {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

async function searchSerper(query: string): Promise<WebSearchResult> {
  const apiKey = process.env.SERPER_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("SERPER_API_KEY não configurada.");
  }

  const response = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      q: query,
      gl: "br",
      hl: "pt-br",
      num: 7,
    }),
  });

  const json = await readJson(response);

  if (!response.ok) {
    throw new Error(JSON.stringify(json));
  }

  const results: WebSearchItem[] = (json.organic || []).map((item: any) => ({
    title: item.title || "Sem título",
    url: item.link,
    snippet: item.snippet || "",
    source: "serper",
  }));

  const answer =
    json.answerBox?.answer ||
    json.answerBox?.snippet ||
    json.knowledgeGraph?.description ||
    results[0]?.snippet ||
    "";

  return {
    provider: "serper",
    query,
    answer,
    results,
  };
}

async function searchTavily(query: string): Promise<WebSearchResult> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("TAVILY_API_KEY não configurada.");
  }

  const response = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: 7,
    }),
  });

  const json = await readJson(response);

  if (!response.ok) {
    throw new Error(JSON.stringify(json));
  }

  const results: WebSearchItem[] = (json.results || []).map((item: any) => ({
    title: item.title || "Sem título",
    url: item.url,
    snippet: item.content || item.snippet || "",
    source: "tavily",
  }));

  return {
    provider: "tavily",
    query,
    answer: json.answer || results[0]?.snippet || "",
    results,
  };
}

async function searchBrave(query: string): Promise<WebSearchResult> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY não configurada.");
  }

  const params = new URLSearchParams({
    q: query,
    country: "BR",
    search_lang: "pt-br",
    count: "7",
    safesearch: "moderate",
  });

  const response = await fetchWithTimeout(
    `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
    }
  );

  const json = await readJson(response);

  if (!response.ok) {
    throw new Error(JSON.stringify(json));
  }

  const results: WebSearchItem[] = (json.web?.results || []).map((item: any) => ({
    title: item.title || "Sem título",
    url: item.url,
    snippet: item.description || "",
    source: "brave",
  }));

  return {
    provider: "brave",
    query,
    answer: results[0]?.snippet || "",
    results,
  };
}

async function searchWithProvider(
  provider: WebSearchProvider,
  query: string
): Promise<WebSearchResult> {
  if (provider === "serper") return searchSerper(query);
  if (provider === "tavily") return searchTavily(query);
  if (provider === "brave") return searchBrave(query);

  throw new Error(`Provider inválido: ${provider}`);
}

function buildSourceList(results: WebSearchItem[]): string {
  return results
    .slice(0, 5)
    .map((item, index) => {
      return `${index + 1}. ${item.title}
URL: ${item.url || "sem URL"}
Resumo: ${shortText(item.snippet, 700)}`;
    })
    .join("\n\n");
}

function buildFallbackWebReply(message: string, search: WebSearchResult): string {
  const firstResults = search.results.slice(0, 3);

  if (!firstResults.length && !search.answer) {
    return "Senhor, consultei a internet, mas não encontrei uma informação confiável para responder agora.";
  }

  const normalized = normalizeText(message);

  const intro =
    normalized.includes("proximo jogo") ||
    normalized.includes("proxima partida") ||
    normalized.includes("quando vai jogar")
      ? "Senhor, encontrei estas informações sobre o próximo jogo:"
      : "Senhor, encontrei estas informações na internet:";

  const directAnswer = search.answer
    ? `\n\n${shortText(search.answer, 500)}`
    : "";

  const sources = firstResults
    .map((item, index) => {
      const title = item.title || "Fonte sem título";
      const snippet = item.snippet
        ? shortText(item.snippet, 350)
        : "Sem resumo disponível.";

      return `${index + 1}. ${title}
${snippet}`;
    })
    .join("\n\n");

  const sourceNames = firstResults
    .map((item) => item.title?.split("|")[0]?.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  return `${intro}${directAnswer}

${sources}

Fontes: ${sourceNames || "resultados da busca"}.`;
}

async function synthesizeWebAnswer(
  message: string,
  search: WebSearchResult
): Promise<string> {
  const sources = buildSourceList(search.results);

  const prompt = `
Você é JAVIS, assistente pessoal do usuário.

Responda em português do Brasil, de forma direta e natural.
Use APENAS os resultados de busca abaixo para responder.
Se os resultados forem contraditórios, diga que há divergência e explique o dado mais provável.
Se não houver informação suficiente, diga que não conseguiu confirmar com segurança.
Não invente placar, data, preço ou notícia.

Pergunta do usuário:
${message}

Provedor usado:
${search.provider}

Resposta direta/contexto do provedor:
${search.answer || "Sem resposta direta."}

Resultados encontrados:
${sources || "Nenhum resultado encontrado."}

No final, cite 2 ou 3 fontes pelo nome do site, sem colocar links longos.
`.trim();

  const reply = await generateJavisReply(prompt);

  if (
    !reply ||
    reply.includes("O motor de IA falhou") ||
    reply.includes("motor de IA falhou") ||
    reply.includes("Desculpe, Senhor")
  ) {
    return buildFallbackWebReply(message, search);
  }

  return reply;
}

/**
 * Executa a busca web diretamente para uma query, sem filtro de intent.
 * Usada quando o LLM já decidiu acionar a tool buscar_na_internet via Function Calling.
 */
export async function processWebSearchDirect(
  query: string
): Promise<WebSearchBrainOutput> {
  if (!query?.trim()) {
    return { handled: false, reply: "" };
  }

  const providers = getProviderOrder(query);
  const errors: string[] = [];

  console.log(`\x1b[36m[WebSearch:Direct] Buscando: "${query.slice(0, 60)}" — cadeia: [${providers.join(" → ")}]\x1b[0m`);

  for (const provider of providers) {
    if (!hasApiKey(provider)) {
      errors.push(`${provider}: chave não configurada`);
      continue;
    }

    try {
      const search = await searchWithProvider(provider, query);

      if (!search.results.length && !search.answer) {
        errors.push(`${provider}: sem resultados`);
        continue;
      }

      console.log(`\x1b[32m[WebSearch:Direct] Sucesso via ${provider.toUpperCase()}\x1b[0m`);
      const reply = await synthesizeWebAnswer(query, search);

      return { handled: true, reply, provider: search.provider, results: search.results };
    } catch (error: any) {
      const detail = error?.message || String(error);
      console.error(`\x1b[31m[WebSearch:Direct] ${provider} falhou: ${detail.slice(0, 120)}\x1b[0m`);
      errors.push(`${provider}: ${detail}`);
    }
  }

  return {
    handled: true,
    reply: "Senhor, tentei consultar a internet, mas nenhum provedor respondeu corretamente. Tente novamente em instantes.",
    provider: undefined,
    results: [],
  };
}

export async function processWebSearchMessage(
  input: WebSearchBrainInput
): Promise<WebSearchBrainOutput> {
  const message = String(input.message || "").trim();

  if (!message) {
    return {
      handled: false,
      reply: "",
    };
  }

  if (!isWebSearchEnabled()) {
    return {
      handled: false,
      reply: "",
    };
  }

  if (!shouldUseWebSearch(message)) {
    return {
      handled: false,
      reply: "",
    };
  }

  const providers = getProviderOrder(message);
  const errors: string[] = [];
  let primaryProvider = true;

  console.log(`\x1b[36m[WebSearch] Iniciando busca — cadeia: [${providers.join(" → ")}]\x1b[0m`);

  for (const provider of providers) {
    if (!primaryProvider) {
      console.warn(`\x1b[33m[Fallback] ⚡ WebSearch alternando para: ${provider.toUpperCase()}...\x1b[0m`);
    }
    primaryProvider = false;

    if (!hasApiKey(provider)) {
      console.warn(`[WebSearch] ${provider}: chave não configurada — pulando.`);
      errors.push(`${provider}: chave não configurada`);
      continue;
    }

    try {
      const search = await searchWithProvider(provider, message);

      if (!search.results.length && !search.answer) {
        console.warn(`[WebSearch] ${provider}: sem resultados — tentando próximo.`);
        errors.push(`${provider}: sem resultados`);
        continue;
      }

      console.log(`\x1b[32m[WebSearch] Sucesso via ${provider.toUpperCase()}\x1b[0m`);
      const reply = await synthesizeWebAnswer(message, search);

      return {
        handled: true,
        reply,
        provider: search.provider,
        results: search.results,
      };
    } catch (error: any) {
      const detail = error?.message || String(error);
      console.error(`\x1b[31m[Fallback] WebSearch ${provider} falhou: ${detail.slice(0, 120)}\x1b[0m`);
      errors.push(`${provider}: ${detail}`);
    }
  }

  console.error("\x1b[31m[WebSearch] Todos os provedores falharam:\x1b[0m", errors);

  return {
    handled: true,
    reply:
      "Senhor, tentei consultar a internet agora, mas nenhum provedor de busca respondeu corretamente. Tente novamente em instantes.",
    provider: undefined,
    results: [],
  };
}
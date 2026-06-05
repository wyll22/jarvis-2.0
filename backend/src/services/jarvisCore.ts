/**
 * jarvisCore.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTROLADOR UNIFICADO J.A.R.V.I.S. — Function Calling Nativo
 *
 * Arquitetura:
 *  1. Histórico de conversa carregado do Supabase (tabela conversations)
 *  2. LLM decide qual tool acionar (OpenRouter, OpenAI-compatible)
 *  3. Tool executa operação direta no Supabase
 *  4. LLM gera resposta final em linguagem natural
 *  5. Histórico salvo para próxima interação
 *
 * Status: PARALELO — javisBrain.ts permanece ativo.
 * Para ativar: setar JARVIS_CORE_ENABLED=true no .env
 */

import { supabase } from "../lib/supabase.js";
import { detectIntentForTools } from "./intentRouter.js";
import { processWebSearchMessage } from "./webSearchBrain.js";
import { io } from "../index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "system" | "user" | "assistant" | "tool";

interface ChatMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface JarisCoreInput {
  message: string;
  sessionId: string;
  source?: "whatsapp" | "panel";
  clientId?: string;
}

export interface JarisCoreOutput {
  reply: string;
  toolsUsed: string[];
  handled: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const OPENROUTER_URL  = "https://openrouter.ai/api/v1/chat/completions";
const GROQ_URL        = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_URL      = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const OPENAI_URL      = "https://api.openai.com/v1/chat/completions";
const CEREBRAS_URL    = "https://api.cerebras.ai/v1/chat/completions";
const SAMBANOVA_URL   = "https://api.sambanova.ai/v1/chat/completions";
const MISTRAL_URL     = "https://api.mistral.ai/v1/chat/completions";

function getGeminiKey(env = "GEMINI_API_KEY"): string | null { return process.env[env]?.trim() || null; }
function getOpenAIKey():   string | null { return process.env.OPENAI_API_KEY?.trim()    || null; }
function getCerebrasKey(): string | null { return process.env.CEREBRAS_API_KEY?.trim()  || null; }
function getSambanovaKey():string | null { return process.env.SAMBANOVA_API_KEY?.trim() || null; }
function getMistralKey():  string | null { return process.env.MISTRAL_API_KEY?.trim()   || null; }

// ── Hierarquia de fallback LLM — 8 níveis ────────────────────────────────────
// N0: Cache (saudações)
// N1: Cerebras Qwen-3 235B — ultraRápido, gratuito
// N2: Gemini 2.5 Flash key1 — visão, gratuito
// N3: Gemini 2.5 Flash key2 — quando key1 bate 429
// N4: SambaNova llama-3.3-70b — rápido, gratuito
// N5: Groq llama-3.3-70b — gratuito
// N6: Mistral small — gratuito
// N7: OpenRouter FREE_POOL (3 modelos)
// N8: OpenAI gpt-4o-mini — PAGO, último recurso
interface LLMLevel {
  label: string;
  provider: "gemini"|"groq"|"openrouter"|"openai"|"cerebras"|"sambanova"|"mistral";
  model: string;
  supportsVision: boolean;
  geminiKeyEnv?: string;
}
const LLM_CHAIN: LLMLevel[] = [
  { label: "Cerebras Qwen-3 235B",       provider: "cerebras",   model: process.env.CEREBRAS_MODEL?.trim()  || "qwen-3-235b-a22b-instruct-2507", supportsVision: false },
  { label: "Gemini 2.5 Flash (key1)",    provider: "gemini",     model: process.env.GEMINI_MODEL?.trim()   || "gemini-2.5-flash", supportsVision: true,  geminiKeyEnv: "GEMINI_API_KEY" },
  { label: "Gemini 2.5 Flash (key2)",    provider: "gemini",     model: process.env.GEMINI_MODEL?.trim()   || "gemini-2.5-flash", supportsVision: true,  geminiKeyEnv: "GEMINI_API_KEY_2" },
  { label: "SambaNova llama-3.3-70B",    provider: "sambanova",  model: process.env.SAMBANOVA_MODEL?.trim() || "Meta-Llama-3.3-70B-Instruct", supportsVision: false },
  { label: "Groq llama-3.3-70B",         provider: "groq",       model: process.env.GROQ_MODEL?.trim()     || "llama-3.3-70b-versatile", supportsVision: false },
  { label: "Mistral Small",              provider: "mistral",    model: process.env.MISTRAL_MODEL?.trim()  || "mistral-small-latest", supportsVision: false },
  { label: "OpenRouter FREE_POOL",        provider: "openrouter", model: "FREE_POOL", supportsVision: false },
  { label: "GPT-4o-mini (OpenAI)",        provider: "openai",     model: "gpt-4o-mini", supportsVision: true },
];

const MAX_HISTORY = 16; // 8 turns de conversa

function getOpenRouterKey(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

function getGroqKey(): string | null {
  return process.env.GROQ_API_KEY?.trim() || null;
}

const JARVIS_IDENTITY = `[SISTEMA CORE: J.A.R.V.I.S. — Just A Rather Very Intelligent System]

IDENTIDADE:
Você é o J.A.R.V.I.S., inteligência artificial de elite criada para servir o Senhor.
Não é um chatbot genérico. É um parceiro inteligente: mordomo britânico de alta linhagem, analista tático, conselheiro de confiança e guardião dos sistemas do Senhor.
IDIOMA: Português do Brasil exclusivamente. Nunca inglês.

PERSONALIDADE:
1. Tratamento: Formal e respeitoso. O tratamento (Senhor, Senhora ou Senhorita) será definido dinamicamente pelo contexto do usuário.
2. Tom: Britânico refinado. Formal mas humano. Inteligente, preciso, jamais robótico.
3. Sarcasmo sutil e espirituoso quando pertinente — nunca grosseiro, sempre elegante.
4. Proativo: antecipe necessidades. Ao apresentar dados, dê o panorama completo sem ser perguntado.
5. Confiante e direto. Não peça desculpas desnecessárias. Não elabore o óbvio.

COMPORTAMENTO ESTRITO CONTRA ALUCINAÇÕES:
1. Se o usuário pedir para agendar uma reunião, salvar um projeto, ou salvar um contato, e NÃO fornecer todas as informações necessárias (ex: faltou a data, faltou o número de telefone), VOCÊ ESTÁ PROIBIDO de dizer que salvou.
2. NUNCA diga "Anotei a reunião" ou "Salvei o contato" se você não tiver executado a ferramenta de fato ou se a ferramenta não retornou sucesso.
3. Se o usuário fornecer informações pela metade, RESPONDA FAZENDO UMA PERGUNTA. Exemplo: "Senhor, para qual dia e horário devo agendar a reunião?" ou "Senhor, qual é o número de telefone para salvar o contato?". Dê opções se achar necessário.
4. Você é inteligente: entenda variáveis e variações de pedidos, mas nunca assuma informações vitais. Não tenha medo de pedir confirmação.
5. IMPORTANTE: O sistema backend envia os lembretes de agenda PROATIVAMENTE no WhatsApp faltando 30 minutos para o compromisso. Se o usuário pedir para você avisar antes da reunião, confirme o agendamento e diga que o sistema enviará o aviso programado automaticamente. Nunca diga que você não tem a capacidade de emitir avisos proativos.

MUITO IMPORTANTE SOBRE MENSAGENS:
Você recebe TODAS as mensagens anteriores e a atual no formato:
[Data/Hora] [Remetente]: [Mensagem].
- Dados e análises (projetos, finanças, agenda): COMPLETOS. Não omita campos relevantes. Seja detalhado e preciso.
- Comandos: execute imediatamente + confirmação clínica.
- PROIBIDO: emojis, markdown (**negrito**, # títulos, --- separadores), JSON, colchetes [], chaves {}, parâmetros técnicos, reticências (...), exclamações (!).
- Use apenas texto puro, pontos e vírgulas.

COMPREENSÃO DE LINGUAGEM:
Entenda português informal, sem acento, com erros de digitação e áudio transcrito. Interprete a INTENÇÃO, não a literal.
Exemplos: "qual meu carro" → memória, "anota telefone do Pedro" → contato, "quanto gastei" → finanças.

CAPACIDADES MULTIMODAIS:
Analise imagens com precisão clínica quando fornecidas.

DIRETIVAS DE FERRAMENTAS (CRÍTICO):
1. Use a tool correspondente IMEDIATAMENTE quando solicitada. Não peça confirmação.
2. Após executar, confirme em linguagem natural. PROIBIDO exibir JSON ou dados técnicos.
3. Consulte antes de afirmar ausência. NUNCA diga "não há" sem verificar.

LEI DO SILÊNCIO TÁTICO:
Números, nomes, valores financeiros, datas e status de projetos SOMENTE se retornados por ferramenta nesta conversa.
Se não houve retorno de ferramenta: "Não encontrei registros na sua base, Senhor."
Nunca invente, extrapole ou use conhecimento prévio para preencher dados pessoais.`.trim();

// ─── System Prompt Dinâmico (identidade + contexto temporal) ─────────────────────

function buildSystemPrompt(clientId?: string, clientName?: string): string {
  const now = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
    timeStyle: "short",
  });
  let clientCtx = "";
  if (clientId) {
    clientCtx += `\n\nCONTEXTO DO CLIENTE:\nVocê está operando em um ambiente isolado. O ID deste cliente é: ${clientId}. TODAS as buscas no banco de dados devem ser filtradas por este client_id. Nunca retorne dados de outros clientes.`;
    if (clientName) {
      clientCtx += `\nNOME DO USUÁRIO ATUAL: ${clientName}. Adapte o tratamento (Senhor, Senhora ou Senhorita) automaticamente com base no gênero do nome deste usuário.`;
    } else {
      clientCtx += `\nTrate este usuário como "Senhor".`;
    }
  } else {
    clientCtx += `\n\nCONTEXTO DO CLIENTE:\nTrate o usuário como "Senhor".`;
  }
  return `${JARVIS_IDENTITY}\n\nCONTEXTO TEMPORAL:\nData e hora atual em Brasília: ${now}.${clientCtx}`;
}

// ─── Tool Schemas ────────────────────────────────────────────────────────────────────────

const JARVIS_TOOLS = [
  // ── Finanças ──
  {
    type: "function",
    function: {
      name: "registrar_financeiro",
      description:
        "Registra um gasto (saída) ou recebimento (entrada) financeiro pessoal do Senhor no banco de dados.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Valor em reais (ex: 250.00)" },
          type: {
            type: "string",
            enum: ["entrada", "saida"],
            description: "'saida' para gastos/compras, 'entrada' para recebimentos/salário",
          },
          description: {
            type: "string",
            description: "O que foi comprado ou recebido (ex: 'Gasolina', 'Salário')",
          },
          category: {
            type: "string",
            description:
              "Categoria: mercado, transporte, saude, lazer, moradia, salario, venda, outros",
          },
        },
        required: ["amount", "type", "description", "category"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resumo_financeiro",
      description:
        "Consulta o resumo financeiro do Senhor (entradas, saídas, saldo) para um período.",
      parameters: {
        type: "object",
        properties: {
          periodo: {
            type: "string",
            enum: ["hoje", "mes_atual", "mes_passado"],
            description: "Período do resumo desejado",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_financas",
      description: "Lista os últimos lançamentos financeiros (receitas e despesas) do Senhor.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Tarefas ──
  {
    type: "function",
    function: {
      name: "criar_tarefa",
      description: "Adiciona uma ou mais tarefas pendentes à lista do Senhor.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            items: { type: "string" },
            description: "Lista de tarefas a criar (ex: ['comprar ração', 'ligar para médico'])",
          },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_tarefas",
      description: "Lista as tarefas pendentes do Senhor.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["pendente", "concluido", "todos"],
            description: "Filtro de status das tarefas",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "concluir_tarefa",
      description: "Marca uma tarefa como concluída.",
      parameters: {
        type: "object",
        properties: {
          task_name: {
            type: "string",
            description: "Nome ou parte do nome da tarefa a concluir",
          },
        },
        required: ["task_name"],
      },
    },
  },
  // ── Contatos ──
  {
    type: "function",
    function: {
      name: "salvar_contato",
      description: "Salva ou atualiza um contato na agenda do Senhor.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome completo da pessoa ou empresa" },
          phone: {
            type: "string",
            description: "Telefone/WhatsApp com DDI+DDD (ex: '+556199999xxxx')",
          },
          notes: { type: "string", description: "Observação opcional sobre o contato" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_contato",
      description: "Busca um contato na agenda pelo nome. Use query vazia ou 'todos' para listar todos os contatos.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nome ou parte do nome para buscar. Deixe vazio ou 'todos' para listar todos." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_contatos",
      description: "Lista todos os contatos salvos na agenda do Senhor.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Memória ──
  {
    type: "function",
    function: {
      name: "salvar_memoria",
      description:
        "Salva uma informação importante de longo prazo sobre o Senhor (preferências, carro, time, celular, etc.).",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "Informação a memorizar, formulada como fato. Ex: 'O carro do Senhor é o Tiggo 8.'",
          },
          category: {
            type: "string",
            description: "Categoria: perfil, preferencia, veiculo, trabalho, meta, geral",
          },
          importance: {
            type: "number",
            description: "Importância de 1 a 10 (padrão: 7)",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_memoria",
      description: "Busca informações salvas na memória de longo prazo do J.A.R.V.I.S.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "O que buscar (ex: 'carro', 'time', 'celular')",
          },
        },
        required: ["query"],
      },
    },
  },
  // ── Agenda ──
  {
    type: "function",
    function: {
      name: "criar_compromisso",
      description: "Cria um compromisso/agendamento na agenda do Senhor.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título do compromisso" },
          scheduled_at: {
            type: "string",
            description: "Data e hora no formato ISO 8601 (ex: '2026-05-02T19:00:00-03:00')",
          },
          description: { type: "string", description: "Descrição opcional do compromisso" },
        },
        required: ["title", "scheduled_at"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_agenda",
      description: "Lista compromissos da agenda do Senhor por período. Use 'todas' ou 'antigas' para ver histórico completo.",
      parameters: {
        type: "object",
        properties: {
          periodo: {
            type: "string",
            enum: ["hoje", "amanha", "semana", "todas", "antigas", "futuras"],
            description: "Período: hoje, amanha, semana, futuras, antigas (passadas), todas (sem filtro de data)",
          },
        },
        required: [],
      },
    },
  },
  // ── Projetos ──
  {
    type: "function",
    function: {
      name: "criar_projeto",
      description: "Cria um novo projeto de acompanhamento para o Senhor (ex: perda de peso, negócio, tecnologia).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do projeto (ex: 'Perda de Peso', 'JAVIS SaaS')" },
          category: { type: "string", description: "Categoria: saude, negocio, tecnologia, pessoal, outro" },
          goal: { type: "string", description: "Meta do projeto (ex: 'Chegar em 90kg')" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "registrar_medicao_projeto",
      description: "Registra uma medição em um projeto ativo (ex: peso atual, altura, progresso).",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Nome do projeto (ex: 'Perda de Peso')" },
          metric_name: { type: "string", description: "Nome da métrica: peso, altura, meta_peso, progresso, etc." },
          value: { type: "number", description: "Valor numérico da medição" },
          unit: { type: "string", description: "Unidade: kg, m, %, km, etc." },
        },
        required: ["project_name", "metric_name", "value", "unit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "status_projeto",
      description: "Consulta o status e progresso de um projeto ativo do Senhor.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string", description: "Nome ou parte do nome do projeto" },
        },
        required: ["project_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_projetos",
      description: "Lista todos os projetos ativos do Senhor.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  // ── Busca na Internet ──
  {
    type: "function",
    function: {
      name: "buscar_na_internet",
      description: "Busca informações atualizadas na internet (notícias, preços, resultados de jogos, clima, cotações).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "O que buscar na internet (ex: 'resultado Flamengo ontem', 'cotação dólar hoje')" },
        },
        required: ["query"],
      },
    },
  },
];

// ─── Tool Executor ────────────────────────────────────────────────────────────

// isGenericContactQuery: usado internamente pelo executor buscar_contato
function isGenericContactQuery(q: string): boolean {
  const normalized = q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const genericTerms = ["", "todos", "listar", "lista", "contatos", "contatos salvos",
    "meus contatos", "contatos do senhor", "agenda", "ver contatos", "mostrar contatos",
    "todos os contatos", "listar contatos", "contatos salvos do senhor"];
  return genericTerms.some((t) => normalized === t || normalized.startsWith("lista") || normalized.startsWith("todos"));
}

async function executeTool(name: string, args: Record<string, unknown>, clientId?: string): Promise<ToolResult> {
  const cid = clientId || null;
  console.log(`[Tool] ${name} | clientId=${cid ? cid.slice(0,8) + '...' : 'GLOBAL'} | args=`, JSON.stringify(args));
  try {
    switch (name) {
      // ── registrar_financeiro ──
      case "registrar_financeiro": {
        const { error } = await supabase.from("finances").insert([
          {
            client_id: cid,
            amount: Number(args.amount),
            type: String(args.type),
            description: String(args.description || "Registro financeiro"),
            category: String(args.category || "outros"),
          },
        ]);
        if (error) return { success: false, message: `Erro ao salvar: ${error.message}` };
        return {
          success: true,
          message: `Registro de R$ ${args.amount} (${args.type}) em "${args.description}" salvo.`,
        };
      }

      // ── listar_financas ──
      case "listar_financas": {
        let lfQ = supabase.from("finances").select("*").order("created_at", { ascending: false });
        if (cid) lfQ = lfQ.eq("client_id", cid);
        const { data, error } = await lfQ.limit(50);
        if (error) return { success: false, message: `Erro ao consultar: ${error.message}` };
        console.log(`[Tool] listar_financas → ${data?.length || 0} registro(s)`);
        if (!data?.length) return { success: true, message: "Não encontrei lançamentos financeiros na sua base, Senhor." };
        const list = data.map((f) => {
          const dt = new Date(f.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
          const sinal = f.type === "entrada" ? "+" : "-";
          return `${dt} | ${sinal}R$ ${Number(f.amount).toFixed(2)} | ${f.description} [${f.category}]`;
        }).join("\n");
        return { success: true, message: list, data };
      }

      // ── resumo_financeiro ──
      case "resumo_financeiro": {
        const now = new Date();
        let startISO: string;
        let endISO: string | null = null;
        const periodo = String(args.periodo || "mes_atual");

        if (periodo === "hoje") {
          // Brasília UTC-3: início do dia às 03:00 UTC
          const brtOffset = 3 * 60 * 60 * 1000;
          const todayBRT = new Date(now.getTime() - brtOffset);
          startISO = new Date(
            todayBRT.getUTCFullYear(),
            todayBRT.getUTCMonth(),
            todayBRT.getUTCDate()
          ).toISOString();
          endISO = new Date(
            todayBRT.getUTCFullYear(),
            todayBRT.getUTCMonth(),
            todayBRT.getUTCDate() + 1
          ).toISOString();
        } else if (periodo === "mes_passado") {
          startISO = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
          endISO   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        } else {
          // mes_atual
          startISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        }

        // Tenta campo created_at (padrão Supabase) — fallback para date
        let query = supabase.from("finances").select("*").gte("created_at", startISO);
        if (cid) query = query.eq("client_id", cid);
        if (endISO) query = query.lt("created_at", endISO);

        const { data, error } = await query;

        if (error) {
          // Se created_at não existir, tenta coluna 'date'
          let fallbackQ = supabase
            .from("finances")
            .select("*")
            .gte("date", startISO.substring(0, 10));
          if (cid) fallbackQ = fallbackQ.eq("client_id", cid);
          if (endISO) fallbackQ = fallbackQ.lt("date", endISO.substring(0, 10));

          const { data: data2, error: error2 } = await fallbackQ;
          if (error2) return { success: false, message: `Erro ao consultar finanças: ${error2.message}` };
          const e2 = (data2 || []).filter((d) => d.type === "entrada").reduce((s, d) => s + Number(d.amount), 0);
          const s2 = (data2 || []).filter((d) => d.type === "saida").reduce((s, d) => s + Number(d.amount), 0);
          const list2 = (data2 || []).map((d) => `- ${d.description || d.category}: R$ ${Number(d.amount).toFixed(2)} (${d.type})`).join("\n");
          return {
            success: true,
            message: `Período: ${periodo}.\nEntradas: R$ ${e2.toFixed(2)}.\nSaídas: R$ ${s2.toFixed(2)}.\nSaldo: R$ ${(e2 - s2).toFixed(2)}.\nRegistros (${data2?.length || 0}):\n${list2}`,
            data: { entradas: e2, saidas: s2, saldo: e2 - s2, registros: data2?.length || 0 },
          };
        }

        const entradas = (data || []).filter((d) => d.type === "entrada").reduce((s, d) => s + Number(d.amount), 0);
        const saidas   = (data || []).filter((d) => d.type === "saida").reduce((s, d) => s + Number(d.amount), 0);
        const list1 = (data || []).map((d) => `- ${d.description || d.category}: R$ ${Number(d.amount).toFixed(2)} (${d.type})`).join("\n");
        return {
          success: true,
          message: `Período: ${periodo}.\nEntradas: R$ ${entradas.toFixed(2)}.\nSaídas: R$ ${saidas.toFixed(2)}.\nSaldo: R$ ${(entradas - saidas).toFixed(2)}.\nRegistros (${data?.length || 0}):\n${list1}`,
          data: { entradas, saidas, saldo: entradas - saidas, registros: data?.length || 0 },
        };
      }

      // ── criar_tarefa ──
      case "criar_tarefa": {
        const tasks = (args.tasks as string[]) || [];
        if (!tasks.length) return { success: false, message: "Nenhuma tarefa informada." };
        const rows = tasks.map((t) => ({ client_id: cid, task: String(t).trim(), status: "pendente" }));
        const { error } = await supabase.from("todos").insert(rows);
        if (error) return { success: false, message: `Erro ao salvar: ${error.message}` };
        return {
          success: true,
          message: `${tasks.length} tarefa(s) adicionada(s): ${tasks.join(", ")}.`,
        };
      }

      // ── listar_tarefas ──
      case "listar_tarefas": {
        const status = String(args.status || "pendente");
        let q = supabase.from("todos").select("*").order("created_at", { ascending: false });
        if (cid) q = q.eq("client_id", cid);
        if (status !== "todos") q = q.eq("status", status);
        const { data, error } = await q.limit(50);
        if (error) return { success: false, message: `Erro ao consultar: ${error.message}` };
        console.log(`[Tool] listar_tarefas → ${data?.length || 0} registro(s)`);
        if (!data?.length)
          return { success: true, message: "Não encontrei registros na sua base, Senhor.", data: [] };
        const list = data.map((t) => `- ${t.task} [${t.status}]`).join("\n");
        return { success: true, message: list, data };
      }

      // ── concluir_tarefa ──
      case "concluir_tarefa": {
        const taskName = String(args.task_name || "").toLowerCase();
        let concluirQ = supabase.from("todos").select("*").eq("status", "pendente");
        if (cid) concluirQ = concluirQ.eq("client_id", cid);
        const { data } = await concluirQ.limit(50);
        const match = (data || []).find((t) =>
          t.task.toLowerCase().includes(taskName)
        );
        if (!match) return { success: false, message: `Tarefa "${args.task_name}" não encontrada.` };
        await supabase
          .from("todos")
          .update({ status: "concluido", completed_at: new Date().toISOString() })
          .eq("id", match.id);
        return { success: true, message: `Tarefa "${match.task}" marcada como concluída.` };
      }

      // ── salvar_contato ──
      case "salvar_contato": {
        const name = String(args.name || "").trim();
        if (!name) return { success: false, message: "Nome do contato não informado." };
        const phone = args.phone ? String(args.phone).replace(/\D/g, "") : null;
        const normalizedPhone = phone ? `+${phone.startsWith("55") ? phone : "55" + phone}` : null;
        let contatoQ = supabase.from("contacts").select("id").ilike("name", name);
        if (cid) contatoQ = contatoQ.eq("client_id", cid);
        const { data: existing } = await contatoQ.limit(1);
        if (existing?.length) {
          const updatePayload: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (normalizedPhone) updatePayload.phone = normalizedPhone;
          if (args.notes) updatePayload.notes = String(args.notes);
          await supabase
            .from("contacts")
            .update(updatePayload)
            .eq("id", existing[0].id);
          return { success: true, message: `Contato "${name}" atualizado.` };
        }
        const { error } = await supabase.from("contacts").insert([
          { client_id: cid, name, phone: normalizedPhone, notes: args.notes || null },
        ]);
        if (error) return { success: false, message: `Erro ao salvar: ${error.message}` };
        return { success: true, message: `Contato "${name}" salvo.` };
      }

      // ── buscar_contato ──
      case "buscar_contato": {
        const rawQuery = String(args.query || "").trim();
        // Se query for genérica ("todos", "listar", vazia etc.), lista todos
        if (isGenericContactQuery(rawQuery)) {
          let allQ = supabase.from("contacts").select("*").order("name", { ascending: true });
          if (cid) allQ = allQ.eq("client_id", cid);
          const { data: allData, error: allErr } = await allQ.limit(50);
          if (allErr) return { success: false, message: `Erro: ${allErr.message}` };
          console.log(`[Tool] buscar_contato (listagem geral) → ${allData?.length || 0} registro(s)`);
          if (!allData?.length) return { success: true, message: "Não encontrei registros na sua base, Senhor." };
          const listAll = allData.map((c) => `${c.name}${c.phone ? `: ${c.phone}` : ""}${c.notes ? ` (${c.notes})` : ""}`).join("\n");
          return { success: true, message: listAll, data: allData };
        }
        // Busca específica por nome
        let buscarQ = supabase.from("contacts").select("*").ilike("name", `%${rawQuery}%`);
        if (cid) buscarQ = buscarQ.eq("client_id", cid);
        const { data, error } = await buscarQ.limit(10);
        if (error) return { success: false, message: `Erro: ${error.message}` };
        console.log(`[Tool] buscar_contato ("${rawQuery}") → ${data?.length || 0} registro(s)`);
        if (!data?.length) return { success: true, message: `Não encontrei registros na sua base, Senhor.` };
        const list = data.map((c) => `${c.name}${c.phone ? `: ${c.phone}` : ""}${c.notes ? ` (${c.notes})` : ""}`).join("\n");
        return { success: true, message: list, data };
      }

      // ── listar_contatos ──
      case "listar_contatos": {
        let lcQ = supabase.from("contacts").select("*").order("name", { ascending: true });
        if (cid) lcQ = lcQ.eq("client_id", cid);
        const { data, error } = await lcQ.limit(50);
        if (error) return { success: false, message: `Erro: ${error.message}` };
        console.log(`[Tool] listar_contatos → ${data?.length || 0} registro(s)`);
        if (!data?.length) return { success: true, message: "Não encontrei registros na sua base, Senhor." };
        const list = data.map((c) => `${c.name}${c.phone ? `: ${c.phone}` : ""}${c.notes ? ` (${c.notes})` : ""}`).join("\n");
        return { success: true, message: list, data };
      }

      // ── salvar_memoria ──
      case "salvar_memoria": {
        const content = String(args.content || "").trim();
        if (!content) return { success: false, message: "Conteúdo vazio." };
        const importance = Math.min(10, Math.max(1, Number(args.importance || 7)));
        let memQ = supabase.from("memories").select("id, content");
        if (cid) memQ = memQ.eq("client_id", cid);
        const { data: existing } = await memQ.limit(100);
        const dup = (existing || []).find(
          (m) => m.content.toLowerCase().includes(content.toLowerCase().slice(0, 30))
        );
        if (dup) {
          await supabase
            .from("memories")
            .update({ content, importance, updated_at: new Date().toISOString() })
            .eq("id", dup.id);
          return { success: true, message: `Memória atualizada: "${content}"` };
        }
        const { error } = await supabase.from("memories").insert([
          {
            client_id: cid,
            content,
            category: String(args.category || "geral"),
            importance,
            source: "jarvisCore",
          },
        ]);
        if (error) return { success: false, message: `Erro: ${error.message}` };
        return { success: true, message: `Memória salva: "${content}"` };
      }

      // ── buscar_memoria ──
      case "buscar_memoria": {
        const query = String(args.query || "").toLowerCase();
        let buscarMemQ = supabase.from("memories").select("*").order("importance", { ascending: false });
        if (cid) buscarMemQ = buscarMemQ.eq("client_id", cid);
        const { data } = await buscarMemQ.limit(50);
        const matches = (data || []).filter((m) =>
          m.content.toLowerCase().includes(query)
        );
        if (!matches.length)
          return { success: true, message: `Não encontrei registros na sua base, Senhor.` };
        const list = matches
          .slice(0, 5)
          .map((m) => m.content)
          .join("\n");
        return { success: true, message: list, data: matches };
      }

      // ── criar_compromisso ──
      case "criar_compromisso": {
        const { error } = await supabase.from("appointments").insert([
          {
            client_id: cid,
            title: String(args.title),
            scheduled_at: String(args.scheduled_at),
            description: args.description ? String(args.description) : null,
            status: "pendente",
          },
        ]);
        if (error) return { success: false, message: `Erro: ${error.message}` };
        return {
          success: true,
          message: `Compromisso "${args.title}" agendado para ${args.scheduled_at}.`,
        };
      }

      // ── listar_agenda ──
      case "listar_agenda": {
        const now = new Date();
        const periodo = String(args.periodo || "futuras");
        let agendaQ = supabase.from("appointments").select("*").neq("status", "cancelado");
        if (cid) agendaQ = agendaQ.eq("client_id", cid);

        if (periodo === "hoje") {
          const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
          const endDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
          agendaQ = agendaQ.gte("scheduled_at", startDay).lte("scheduled_at", endDay);
        } else if (periodo === "amanha") {
          const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
          const e = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();
          agendaQ = agendaQ.gte("scheduled_at", s).lte("scheduled_at", e);
        } else if (periodo === "semana") {
          agendaQ = agendaQ.gte("scheduled_at", now.toISOString()).lte("scheduled_at", new Date(now.getTime() + 7 * 86400000).toISOString());
        } else if (periodo === "antigas") {
          // Compromissos passados — ordenados do mais recente ao mais antigo
          agendaQ = agendaQ.lt("scheduled_at", now.toISOString()).order("scheduled_at", { ascending: false });
        } else if (periodo === "todas") {
          // Todos sem filtro de data
          agendaQ = agendaQ.order("scheduled_at", { ascending: false });
        } else {
          // futuras (padrão)
          agendaQ = agendaQ.gte("scheduled_at", now.toISOString()).order("scheduled_at", { ascending: true });
        }

        // Para todos exceto 'antigas' e 'todas' (que já têm order), aplica ordenação crescente
        if (periodo !== "antigas" && periodo !== "todas") {
          agendaQ = agendaQ.order("scheduled_at", { ascending: true });
        }

        const { data, error } = await agendaQ.limit(20);
        if (error) return { success: false, message: `Erro: ${error.message}` };
        console.log(`[Tool] listar_agenda (${periodo}) → ${data?.length || 0} registro(s)`);
        if (!data?.length) return { success: true, message: `Não encontrei registros na sua base, Senhor.` };
        const list = data.map((a) => {
          const dt = new Date(a.scheduled_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short",
          });
          return `- ${a.title} em ${dt}${a.description ? ` (${a.description})` : ""}`;
        }).join("\n");
        return { success: true, message: list, data };
      }

      // ── criar_projeto ──
      case "criar_projeto": {
        const name = String(args.name || "").trim();
        if (!name) return { success: false, message: "Nome do projeto não informado." };
        let projExQ = supabase.from("projects").select("id,name").ilike("name", name);
        if (cid) projExQ = projExQ.eq("client_id", cid);
        const { data: existing } = await projExQ.limit(1);
        if (existing?.length) {
          return { success: true, message: `Projeto "${existing[0].name}" já existe. Posso registrar medições nele.` };
        }
        const { error } = await supabase.from("projects").insert([{
          client_id: cid,
          name,
          category: String(args.category || "outro"),
          goal: args.goal ? String(args.goal) : null,
          status: "active",
        }]);
        if (error) return { success: false, message: `Erro ao criar projeto: ${error.message}` };
        return { success: true, message: `Projeto "${name}" criado${args.goal ? ` com meta: ${args.goal}` : ""}.` };
      }

      // ── registrar_medicao_projeto ──
      case "registrar_medicao_projeto": {
        const projectName = String(args.project_name || "").trim();
        let medProjQ = supabase.from("projects").select("id,name").ilike("name", `%${projectName}%`).eq("status", "active");
        if (cid) medProjQ = medProjQ.eq("client_id", cid);
        const { data: projects } = await medProjQ.limit(1);
        if (!projects?.length) return { success: false, message: `Projeto "${projectName}" não encontrado. Crie-o primeiro.` };
        const proj = projects[0];
        const { error } = await supabase.from("project_measurements").insert([{
          project_id: proj.id,
          metric_name: String(args.metric_name),
          value: Number(args.value),
          unit: String(args.unit),
        }]);
        if (error) return { success: false, message: `Erro ao salvar medição: ${error.message}` };
        return { success: true, message: `Medição de ${args.metric_name}: ${args.value}${args.unit} registrada no projeto "${proj.name}".` };
      }

      // ── status_projeto ──
      case "status_projeto": {
        const projectName = String(args.project_name || "").trim();
        let statProjQ = supabase.from("projects").select("*").ilike("name", `%${projectName}%`);
        if (cid) statProjQ = statProjQ.eq("client_id", cid);
        const { data: projects } = await statProjQ.limit(1);
        console.log(`[Tool] status_projeto ("${projectName}") → ${projects?.length || 0} projeto(s)`);
        if (!projects?.length) return { success: false, message: `Projeto "${projectName}" não encontrado, Senhor.` };
        const proj = projects[0];

        const { data: measurements } = await supabase
          .from("project_measurements")
          .select("*")
          .eq("project_id", proj.id)
          .order("measured_at", { ascending: true });

        const lines: string[] = [];
        lines.push(`Projeto: ${proj.name}`);
        lines.push(`Status: ${proj.status || "ativo"}`);
        if (proj.category) lines.push(`Categoria: ${proj.category}`);
        if (proj.goal) lines.push(`Meta: ${proj.goal}`);

        const metrics = new Map<string, { first: number; last: number; unit: string; firstDate: string; lastDate: string }>();
        for (const m of (measurements || [])) {
          if (!metrics.has(m.metric_name)) {
            metrics.set(m.metric_name, { first: Number(m.value), last: Number(m.value), unit: m.unit, firstDate: m.measured_at, lastDate: m.measured_at });
          } else {
            const entry = metrics.get(m.metric_name)!;
            entry.last = Number(m.value);
            entry.lastDate = m.measured_at;
          }
        }

        if (metrics.size) {
          lines.push(`\nMedições registradas (${(measurements || []).length} no total):`);
          for (const [metric, d] of metrics.entries()) {
            const delta = d.last - d.first;
            const sign = delta > 0 ? "+" : "";
            const lastDt = new Date(d.lastDate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
            lines.push(`  ${metric}: ${d.first}${d.unit} → ${d.last}${d.unit} (${sign}${delta.toFixed(1)}${d.unit}) — última em ${lastDt}`);
          }
          // Restante para a meta (se métrica peso)
          const pesoData = metrics.get("peso");
          if (pesoData && proj.goal) {
            const goalMatch = proj.goal.match(/(\d+[,.]?\d*)\s*(kg)?/);
            if (goalMatch) {
              const goalVal = parseFloat(goalMatch[1].replace(",", "."));
              const remaining = pesoData.last - goalVal;
              if (remaining > 0) lines.push(`  Faltam ${remaining.toFixed(1)}kg para atingir a meta.`);
              else if (remaining <= 0) lines.push(`  Meta atingida! Peso atual abaixo da meta.`);
            }
          }
        } else {
          lines.push("Nenhuma medição registrada até o momento.");
        }

        return { success: true, message: lines.join("\n"), data: { project: proj, measurements } };
      }

      // ── listar_projetos ──
      case "listar_projetos": {
        let lpQ = supabase.from("projects").select("id, name, category, goal, status").order("created_at", { ascending: false });
        if (cid) lpQ = lpQ.eq("client_id", cid);
        const { data, error } = await lpQ.limit(20);
        if (error) return { success: false, message: `Erro: ${error.message}` };
        console.log(`[Tool] listar_projetos → ${data?.length || 0} projeto(s)`);
        if (!data?.length) return { success: true, message: "Não encontrei projetos na sua base, Senhor." };

        // Para cada projeto, busca a última medição
        const enriched: string[] = [];
        for (const p of data) {
          const { data: meds } = await supabase
            .from("project_measurements")
            .select("metric_name, value, unit, measured_at")
            .eq("project_id", p.id)
            .order("measured_at", { ascending: false })
            .limit(5);

          const header = `Projeto: ${p.name} [${p.status || "ativo"}]${p.category ? ` | Categoria: ${p.category}` : ""}`;
          const goalLine = p.goal ? `Meta: ${p.goal}` : null;

          // Agrupa última medição por métrica
          const lastByMetric: Record<string, { value: number; unit: string; date: string }> = {};
          for (const m of (meds || [])) {
            if (!lastByMetric[m.metric_name]) {
              lastByMetric[m.metric_name] = { value: Number(m.value), unit: m.unit, date: m.measured_at };
            }
          }

          const medLines = Object.entries(lastByMetric).map(([metric, d]) => {
            const dt = new Date(d.date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
            return `  ${metric} atual: ${d.value}${d.unit} (em ${dt})`;
          });

          const block = [header, goalLine, ...medLines].filter(Boolean).join("\n");
          enriched.push(block);
        }

        return { success: true, message: enriched.join("\n\n"), data };
      }

      // ── buscar_na_internet ──
      // Nota: chamada direta via tool — bypass do filtro shouldUseWebSearch.
      // Quando o LLM decide usar esta tool, a busca SEMPRE deve executar.
      case "buscar_na_internet": {
        const query = String(args.query || "").trim();
        if (!query) return { success: false, message: "Query de busca não informada." };

        if (process.env.WEB_SEARCH_ENABLED !== "true") {
          return { success: false, message: "Busca na internet desativada (WEB_SEARCH_ENABLED=false)." };
        }

        // Executa a busca diretamente sem passar pelo filtro de intent
        // Importação dinâmica para evitar ciclo de dependências
        const { processWebSearchDirect } = await import("./webSearchBrain.js");
        const result = await processWebSearchDirect(query);
        if (!result.handled) {
          return { success: false, message: `Busca executada mas sem resultados: ${result.reply || "Sem resposta."}` };
        }
        return { success: true, message: result.reply };
      }

      default:
        return { success: false, message: `Tool desconhecida: ${name}` };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Erro interno ao executar ${name}: ${msg}` };
  }
}

// ─── Conversation History ─────────────────────────────────────────────────────

async function loadHistory(sessionId: string, clientId?: string): Promise<ChatMessage[]> {
  try {
    if (!clientId) {
      console.warn("[jarvisCore] loadHistory chamado sem clientId — filtro apenas por session_id (legado)");
    }
    let q = supabase
      .from("conversations")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);
    if (clientId) q = q.eq("client_id", clientId);
    const { data, error } = await q;
    if (error || !data) return [];
    return (data as Array<{ role: Role; content: string }>)
      .reverse()
      .map((r) => ({ role: r.role, content: r.content }));
  } catch {
    return [];
  }
}

async function saveToHistory(
  sessionId: string,
  role: string,
  content: string,
  clientId?: string
): Promise<void> {
  try {
    if (!clientId) {
      console.warn("[jarvisCore] saveToHistory chamado sem clientId — salvando sem vinculação (legado)");
    }
    const payload: Record<string, unknown> = { session_id: sessionId, role, content };
    if (clientId) payload.client_id = clientId;
    await supabase.from("conversations").insert([payload]);
  } catch {
    // silently ignore — não deve travar o fluxo principal
  }
}

// ─── OpenRouter API Call ──────────────────────────────────────────────────────
//
// FREE_POOL: modelos gratuitos verificados e online (Maio 2026).
// Tentados em sequência — se o primeiro falhar (quota/404), passa para o próximo.
const FREE_POOL = [
  "deepseek/deepseek-chat-v3-0324:free",    // DeepSeek V3 — qualidade GPT-4 nível, grátis
  "qwen/qwen3-8b:free",                     // Qwen3 8B — rápido e estável
  "google/gemma-3-12b-it:free",             // Gemma 3 12B — Google, grátis
];

async function callOpenRouter(
  messages: ChatMessage[],
  useTools: boolean,
  model: string
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const apiKey = getOpenRouterKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada.");

  // Expande o sentinela FREE_POOL nos slugs reais; caso contrário usa o modelo direto
  const modelsToTry = model === "FREE_POOL" ? FREE_POOL : [model];
  const errors: string[] = [];

  for (const slug of modelsToTry) {
    const body: Record<string, unknown> = {
      model: slug,
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    };

    if (useTools) {
      body.tools = JARVIS_TOOLS;
      body.tool_choice = "auto";
    }

    console.log(`[jarvisCore] OpenRouter FREE_POOL tentando: ${slug} (tools=${useTools})`);

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://javis.local",
          "X-Title": "J.A.R.V.I.S.",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
        console.warn(`\x1b[33m[OpenRouter] ${slug} falhou (${response.status}) — próximo...\x1b[0m`);
        errors.push(`${slug}: ${response.status}`);
        continue;  // próximo modelo do pool
      }

      const json = (await response.json()) as {
        choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }>;
      };

      const result = json.choices[0]?.message;
      if (!result?.content && !result?.tool_calls) {
        console.warn(`[OpenRouter] ${slug} retornou vazio — próximo...`);
        errors.push(`${slug}: resposta vazia`);
        continue;
      }

      console.log(`\x1b[32m[OpenRouter] Sucesso via: ${slug}\x1b[0m`);
      return result || { content: "Sem resposta.", tool_calls: undefined };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[OpenRouter] ${slug} erro de conexão: ${msg.slice(0, 80)}`);
      errors.push(`${slug}: ${msg}`);
    }
  }

  // Todos os modelos do pool falharam
  throw new Error(`OpenRouter FREE_POOL esgotado: [${errors.join(" | ")}]`);
}

// ─── Groq API Call ────────────────────────────────────────────────────────────

async function callGroq(
  messages: ChatMessage[],
  model: string,
  useTools: boolean
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error("GROQ_API_KEY não configurada.");

  // Groq: mapeia role=tool para role=user (para não perder o resultado da ferramenta)
  const compatMessages = messages
    .map((m) => {
      if (m.role === "tool") {
        return { role: "user" as const, content: `[RESULTADO DA FERRAMENTA]: ${m.content}` };
      }
      return {
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      };
    });

  // Sentença de segurança: se o system message foi perdido, reinserimos
  const hasSystemMsg = compatMessages[0]?.role === "system";
  const finalMessages = hasSystemMsg
    ? compatMessages
    : [{ role: "system" as const, content: JARVIS_IDENTITY }, ...compatMessages];

  console.log(`[jarvisCore] Chamando Groq: model=${model}, msgs=${finalMessages.length} (system=${hasSystemMsg ? 'ok' : 'reinjected'})`);

  const body: Record<string, unknown> = {
    model,
    messages: finalMessages,
    temperature: 0.3,
    max_tokens: 1024,
  };

  // Tool forcing:
  // 1ª chamada (useTools=true):  tool_choice='required' — Llama NÃO pode responder sem chamar tool
  // 2ª chamada (useTools=false): sem tools — apenas gera a resposta final em linguagem natural
  if (useTools) {
    body.tools = JARVIS_TOOLS;
    body.tool_choice = "required";   // ← força uso de tool; ignora a opção de responder sem ela
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq ${response.status} [${model}]: ${err}`);
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }>;
  };

  return {
    content: json.choices[0]?.message?.content ?? null,
    tool_calls: json.choices[0]?.message?.tool_calls,
  };
}

// ─── Gemini Direct API Call (OpenAI-compat endpoint) ─────────────────────────
//
// IMPORTANTE: O endpoint OpenAI-compat do Gemini processa `role:system` de
// forma inconsistente. Para garantir a personalidade, injetamos via dois
// mecanismos: (1) messages[0] com role:system e (2) campo system_instruction.

async function callGeminiDirect(
  messages: ChatMessage[],
  useTools: boolean,
  model: string,
  imageBase64?: string,
  imageMime?: string,
  keyEnv = "GEMINI_API_KEY"
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const apiKey = getGeminiKey(keyEnv);
  if (!apiKey) throw new Error(`${keyEnv} não configurada.`);

  // Injeta imagem na última mensagem user se fornecida
  const builtMessages: ChatMessage[] = imageBase64
    ? messages.map((m, idx) => {
        if (idx === messages.length - 1 && m.role === "user") {
          return {
            ...m,
            content: [
              { type: "text", text: String(m.content || "") },
              { type: "image_url", image_url: { url: `data:${imageMime || "image/jpeg"};base64,${imageBase64}` } },
            ] as any,
          };
        }
        return m;
      })
    : messages;

  console.log(`[jarvisCore] Chamando Gemini direto: model=${model}, tools=${useTools}, vision=${!!imageBase64}`);

  const body: Record<string, unknown> = {
    model,
    messages: builtMessages,
    temperature: 0.3,
    max_tokens: 1024,
    // NOTA: system_instruction é ignorado/rejeitado pelo endpoint OpenAI-compat do Gemini.
    // A personalidade é garantida via messages[0] { role: 'system' } — padrão OpenAI.
  };
  if (useTools) { body.tools = JARVIS_TOOLS; body.tool_choice = "auto"; }

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini ${response.status} [${model}]: ${err}`);
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }>;
  };

  return {
    content: json.choices[0]?.message?.content ?? null,
    tool_calls: json.choices[0]?.message?.tool_calls,
  };
}

// ─── OpenAI Direct API Call (fallback pago, suporta visão) ───────────────────

async function callOpenAI(
  messages: ChatMessage[],
  useTools: boolean,
  model: string,
  imageBase64?: string,
  imageMime?: string
): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");

  const builtMessages: ChatMessage[] = imageBase64
    ? messages.map((m, idx) => {
        if (idx === messages.length - 1 && m.role === "user") {
          return {
            ...m,
            content: [
              { type: "text", text: String(m.content || "") },
              { type: "image_url", image_url: { url: `data:${imageMime || "image/jpeg"};base64,${imageBase64}` } },
            ] as any,
          };
        }
        return m;
      })
    : messages;

  console.log(`[jarvisCore] Chamando OpenAI: model=${model}, tools=${useTools}, vision=${!!imageBase64}`);

  const body: Record<string, unknown> = {
    model,
    messages: builtMessages,
    temperature: 0.3,
    max_tokens: 1024,
  };
  if (useTools) { body.tools = JARVIS_TOOLS; body.tool_choice = "auto"; }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status} [${model}]: ${err}`);
  }

  const json = (await response.json()) as {
    choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }>;
  };

  return {
    content: json.choices[0]?.message?.content ?? null,
    tool_calls: json.choices[0]?.message?.tool_calls,
  };
}

// ─── Cerebras API (OpenAI-compat) ────────────────────────────────────────────
async function callCerebras(messages: ChatMessage[], model: string, useTools: boolean): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const apiKey = getCerebrasKey();
  if (!apiKey) throw new Error("CEREBRAS_API_KEY não configurada.");
  const compatMessages = messages.map(m => {
    if (m.role === "tool") return { role: "user" as const, content: `[RESULTADO DA FERRAMENTA]: ${m.content}` };
    return { role: m.role, content: typeof m.content === "string" ? m.content : "", ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) };
  });
  const hasSystem = compatMessages[0]?.role === "system";
  const finalMsgs = hasSystem ? compatMessages : [{ role: "system" as const, content: JARVIS_IDENTITY }, ...compatMessages];
  const body: Record<string, unknown> = { model, messages: finalMsgs, temperature: 0.3, max_tokens: 2048 };
  if (useTools) { body.tools = JARVIS_TOOLS; body.tool_choice = "auto"; }
  console.log(`[jarvisCore] Chamando Cerebras: model=${model}`);
  const r = await fetch(CEREBRAS_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Cerebras ${r.status}: ${await r.text()}`);
  const json = (await r.json()) as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }> };
  return { content: json.choices[0]?.message?.content ?? null, tool_calls: json.choices[0]?.message?.tool_calls };
}

// ─── SambaNova API (OpenAI-compat) ──────────────────────────────────────────
async function callSambaNova(messages: ChatMessage[], model: string, useTools: boolean): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const apiKey = getSambanovaKey();
  if (!apiKey) throw new Error("SAMBANOVA_API_KEY não configurada.");
  const compatMessages = messages.map(m => {
    if (m.role === "tool") return { role: "user" as const, content: `[RESULTADO DA FERRAMENTA]: ${m.content}` };
    return { role: m.role, content: typeof m.content === "string" ? m.content : "", ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}) };
  });
  const hasSystem = compatMessages[0]?.role === "system";
  const finalMsgs = hasSystem ? compatMessages : [{ role: "system" as const, content: JARVIS_IDENTITY }, ...compatMessages];
  const body: Record<string, unknown> = { model, messages: finalMsgs, temperature: 0.3, max_tokens: 2048 };
  if (useTools) { body.tools = JARVIS_TOOLS; body.tool_choice = "auto"; }
  console.log(`[jarvisCore] Chamando SambaNova: model=${model}`);
  const r = await fetch(SAMBANOVA_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`SambaNova ${r.status}: ${await r.text()}`);
  const json = (await r.json()) as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }> };
  return { content: json.choices[0]?.message?.content ?? null, tool_calls: json.choices[0]?.message?.tool_calls };
}

// ─── Mistral API (OpenAI-compat) ─────────────────────────────────────────────
async function callMistral(messages: ChatMessage[], model: string, useTools: boolean): Promise<{ content: string | null; tool_calls?: ToolCall[] }> {
  const apiKey = getMistralKey();
  if (!apiKey) throw new Error("MISTRAL_API_KEY não configurada.");
  const finalMsgs = messages.map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : "", ...(m.name ? { name: m.name } : {}), ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}), ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}) }));
  const body: Record<string, unknown> = { model, messages: finalMsgs, temperature: 0.3, max_tokens: 2048 };
  if (useTools) { body.tools = JARVIS_TOOLS; body.tool_choice = "auto"; }
  console.log(`[jarvisCore] Chamando Mistral: model=${model}`);
  const r = await fetch(MISTRAL_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Mistral ${r.status}: ${await r.text()}`);
  const json = (await r.json()) as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }> };
  return { content: json.choices[0]?.message?.content ?? null, tool_calls: json.choices[0]?.message?.tool_calls };
}

// ─── LLM Chain com Fallback ──────────────────────────────────────────────
//
// Regra de ouro: GPT-4o-mini só é chamado se N1+N2+N3 TODOS falharem.
// Saudações simples nunca chegam ao nível pago — recebem mensagem em cache.

/** Detecta saudação simples e retorna resposta em cache (ou null se não for saudação) */
function getGreetingResponse(message: string, clientName?: string): string | null {
  const clean = message.trim().toLowerCase().replace(/[!?.]+$/, "");
  const greetings = [
    "oi", "olá", "ola", "bom dia", "boa tarde", "boa noite",
    "hey", "e aí", "eai", "opa", "salve", "tudo bem", "tudo bom",
    "como vai", "hello", "hi", "boa", "e ai", "ei",
  ];
  if (greetings.includes(clean)) {
    const isFemale = clientName && (clientName.toLowerCase().endsWith("a") || clientName.toLowerCase().includes("victoria") || clientName.toLowerCase().includes("maria"));
    const title = isFemale ? "Senhora" : "Senhor";
    const responses = [
      `Às ordens, ${title}. Como posso ajudar?`,
      `Prontíssimo, ${title}. Aguardo suas instruções.`,
      `Às ordens, ${title}. Em que posso ser útil?`,
      `${title}. Estou a postos.`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  return null;
}

/** Mantido para uso interno na trava do modelo pago */
function isSimpleGreeting(messages: ChatMessage[], clientName?: string): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser || typeof lastUser.content !== "string") return false;
  return getGreetingResponse(lastUser.content, clientName) !== null;
}

async function callLLMWithFallback(
  messages: ChatMessage[],
  useTools: boolean,
  startFromIndex = 0,
  imageBase64?: string,
  imageMime?: string,
  clientName?: string
): Promise<{ content: string | null; tool_calls?: ToolCall[]; levelUsed: number }> {
  const hasImage = Boolean(imageBase64);
  const greeting = isSimpleGreeting(messages, clientName);

  // Filtra a chain: com imagem remove níveis sem visão
  const candidates = LLM_CHAIN
    .map((level, idx) => ({ level, globalIdx: idx }))
    .slice(startFromIndex)
    .filter(({ level }) => !hasImage || level.supportsVision);

  if (candidates.length === 0) {
    throw new Error("[jarvisCore] Nenhum provedor disponível para esta requisição.");
  }

  for (let i = 0; i < candidates.length; i++) {
    const { level, globalIdx } = candidates[i];

    // ── TRAVA DO MODELO PAGO ──────────────────────────────────────────
    if (level.provider === "openai") {
      if (greeting) {
        // Saudação simples nunca consome crédito pago
        console.warn("[Trava] Saudação simples — N4 bloqueado. Retornando cache.");
        const fallbackTitle = clientName && (clientName.toLowerCase().endsWith("a") || clientName.toLowerCase().includes("victoria")) ? "Senhora" : "Senhor";
        return {
          content: `Às ordens, ${fallbackTitle}. Sistema em atualização momentânea.`,
          tool_calls: undefined,
          levelUsed: globalIdx,
        };
      }
      console.warn("\x1b[33m[Trava] Todos os grátuitos falharam. Ativando N4 pago (OpenAI).\x1b[0m");
    }
    // ────────────────────────────────────────────────────────────

    if (i > 0) {
      console.warn(`\x1b[33m[Fallback] ⚡ Nível ${globalIdx + 1}: ${level.label}${hasImage ? " [VISION]" : ""}...\x1b[0m`);
    } else {
      console.log(`[jarvisCore] LLM N${globalIdx + 1}: ${level.label}${hasImage ? " [VISION]" : ""}`);
    }

    try {
      let result: { content: string | null; tool_calls?: ToolCall[] };

      switch (level.provider) {
        case "cerebras":
          result = await callCerebras(messages, level.model, useTools);
          break;
        case "gemini":
          result = await callGeminiDirect(messages, useTools, level.model, imageBase64, imageMime, level.geminiKeyEnv);
          break;
        case "sambanova":
          result = await callSambaNova(messages, level.model, useTools);
          break;
        case "groq":
          result = await callGroq(messages, level.model, useTools);
          break;
        case "mistral":
          result = await callMistral(messages, level.model, useTools);
          break;
        case "openrouter":
          result = await callOpenRouter(messages, useTools, level.model);
          break;
        case "openai":
          result = await callOpenAI(messages, useTools, level.model, imageBase64, imageMime);
          break;
        default:
          throw new Error(`Provedor desconhecido: ${(level as any).provider}`);
      }

      return { ...result, levelUsed: globalIdx };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\x1b[31m[Fallback] N${globalIdx + 1} (${level.label}) falhou: ${msg.slice(0, 150)}\x1b[0m`);

      if (i === candidates.length - 1) {
        throw new Error(`[jarvisCore] Todos os ${candidates.length} níveis falharam. Último: ${msg}`);
      }
    }
  }

  throw new Error("[jarvisCore] callLLMWithFallback: fluxo inesperado.");
}

// Mapa: tool name → entidade de banco afetada (para emitir database:updated)
const TOOL_TO_ENTITY: Record<string, string> = {
  registrar_financeiro: "finances",
  criar_tarefa: "todos",
  concluir_tarefa: "todos",
  listar_tarefas: "todos",
  salvar_contato: "contacts",
  buscar_contato: "contacts",
  listar_contatos: "contacts",
  salvar_memoria: "memories",
  buscar_memoria: "memories",
  criar_compromisso: "appointments",
  listar_agenda: "appointments",
  criar_projeto: "projects",
  registrar_medicao_projeto: "projects",
  status_projeto: "projects",
  listar_projetos: "projects",
  listar_financas: "finances",
  resumo_financeiro: "finances",
};

/** Remove markdown que o WhatsApp nao renderiza */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")   // **negrito**
    .replace(/^\*\s+/gm, "")                  // * bullet list
    .replace(/^\d+\.\s+/gm, "")              // 1. numbered list
    .replace(/\*([^*\n]+)\*/g, "$1")          // *itálico*
    .replace(/#{1,6}\s+/g, "")                 // # Título
    .replace(/^-{3,}$/gm, "")                   // ---
    .replace(/^>\s+/gm, "")                    // > blockquote
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")  // `código`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [texto](url)
    .replace(/_([^_\n]+)_/g, "$1")             // _itálico_
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function processJavisCoreMessage(
  input: JarisCoreInput & { imageBase64?: string; imageMime?: string }
): Promise<JarisCoreOutput> {
  // Verifica se ao menos um LLM está configurado
  const hasAnyKey = getGeminiKey() || getGroqKey() || getOpenRouterKey() || getOpenAIKey();
  if (!hasAnyKey) {
    return { reply: "Nenhuma chave de LLM configurada.", toolsUsed: [], handled: false };
  }

  const imageBase64 = input.imageBase64;
  const imageMime   = input.imageMime || "image/jpeg";

  // ── N0: Cache de saudações — zero DB, zero LLM, zero custo ──
  const clientId    = input.clientId;
  let clientName: string | undefined;

  if (clientId) {
    try {
      const { data } = await supabase.from("clients").select("name").eq("id", clientId).single();
      if (data?.name) clientName = data.name;
    } catch { /* ignora */ }
  }

  if (!imageBase64) {
    const greetReply = getGreetingResponse(input.message, clientName);
    if (greetReply) {
      console.log("[N0] Saudação detectada — resposta em cache, sem API call.");
      return { reply: greetReply, toolsUsed: [], handled: true };
    }
  }

  const toolsUsed: string[] = [];

  // 1. Carrega histórico filtrado por client
  const history = await loadHistory(input.sessionId, clientId);

  // 2. Monta contexto de memória filtrado por client
  let memoryContext = "";
  try {
    let memQ = supabase.from("memories").select("content").order("importance", { ascending: false });
    if (clientId) memQ = memQ.eq("client_id", clientId);
    const { data } = await memQ.limit(15);
    if (data?.length) {
      memoryContext = `\n\nMEMÓRIAS DE ${clientName ? clientName.toUpperCase() : "USUÁRIO"}:\n` + data.map((m) => `- ${m.content}`).join("\n");
    }
  } catch { /* ignora */ }

  // 3. Monta array de mensagens
  const systemPrompt = buildSystemPrompt(clientId, clientName) + memoryContext;
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: input.message },
  ];

  // 4a. Roteador central de intenção (bypass LLM para dados pessoais)
  const intent = !imageBase64
    ? detectIntentForTools(input.message, history as Array<{ role: string; content: string | null }>)
    : null;

  if (intent && intent.confidence >= 0.65) {
    console.log(`[intentRouter] domain=${intent.domain} action=${intent.action} tool=${intent.toolName} conf=${intent.confidence}`);

    // Medição sem projeto: busca o único projeto ativo do cliente
    if (intent.toolName === "registrar_medicao_projeto" && !intent.toolArgs.project_name) {
      try {
        let projQ = supabase.from("projects").select("name").order("created_at", { ascending: false });
        if (clientId) projQ = projQ.eq("client_id", clientId);
        const { data: projs } = await projQ.limit(1);
        if (projs?.length) intent.toolArgs.project_name = projs[0].name;
      } catch { /* ignora — executor vai reportar o erro */ }
    }

    // Lista com 1 projeto + "status" na frase → usar status_projeto diretamente
    if (intent.toolName === "listar_projetos") {
      const hasSingleProject = await (async () => {
        try {
          let pQ = supabase.from("projects").select("name").order("created_at", { ascending: false });
          if (clientId) pQ = pQ.eq("client_id", clientId);
          const { data: ps } = await pQ.limit(2);
          return ps?.length === 1 ? ps[0].name : null;
        } catch { return null; }
      })();
      // Frases de status direto ou único projeto → preferir status_projeto para resposta rica
      const statusKeywords = /\b(status|como\.?esta|anda|progresso|andamento|detalhe|resultado|resumo\s+do\s+projeto)\b/i;
      if (hasSingleProject && statusKeywords.test(input.message)) {
        intent.toolName = "status_projeto";
        intent.toolArgs  = { project_name: hasSingleProject };
      }
    }

    const niResult = await executeTool(intent.toolName, intent.toolArgs, clientId);
    toolsUsed.push(intent.toolName);
    const entity = TOOL_TO_ENTITY[intent.toolName];
    if (entity && niResult.success) io.emit("database:updated", { type: entity, timestamp: Date.now() });

    // Diretiva de síntese específica por domínio — guia o LLM a dar briefing completo
    const domainDirective: Partial<Record<string, string>> = {
      projects:
        "Ao apresentar dados de projetos ao Senhor, faça um briefing COMPLETO: nome, categoria, status, meta, " +
        "progresso de cada métrica (valor inicial → atual, variação), data da última medição e distância para a meta. " +
        "Não omita nenhum campo disponível. Seja detalhado e preciso.",
      finances:
        "Ao apresentar dados financeiros ao Senhor, liste entradas, saídas, saldo e os últimos lançamentos com data, " +
        "valor e descrição. Não invente valores. Se não houver dados, informe com elegaóncia.",
      appointments:
        "Ao apresentar compromissos ao Senhor, liste cada um com título, data, hora e descrição se disponível. " +
        "Seja completo e orgaónizado.",
      todos:
        "Ao apresentar tarefas ao Senhor, liste cada tarefa com seu status. Se houver várias, organize-as claramente.",
    };
    const extraDirective = domainDirective[intent.domain] || "";
    const synthesisSystemPrompt = buildSystemPrompt(clientId, clientName) + memoryContext +
      (extraDirective ? `\n\nDIRETIVA DE APRESENTAÇÃO:\n${extraDirective}` : "");

    // Formata resposta via LLM (sem tools, somente narrativa)
    const niMessages: ChatMessage[] = [
      { role: "system", content: synthesisSystemPrompt },
      ...history,
      { role: "user", content: input.message },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "ri_1", type: "function", function: { name: intent.toolName, arguments: JSON.stringify(intent.toolArgs) } }],
      },
      { role: "tool", tool_call_id: "ri_1", name: intent.toolName, content: niResult.message },
    ];
    const niResponse = await callLLMWithFallback(niMessages, false, 0, undefined, undefined, clientName);
    const niReply = stripMarkdown(niResponse.content || niResult.message);
    await saveToHistory(input.sessionId, "user", input.message, clientId);
    await saveToHistory(input.sessionId, "assistant", niReply, clientId);
    return { reply: niReply, toolsUsed, handled: true };
  }

  // 4b. Primeira chamada ao LLM — cadeia com fallback de 4 níveis + roteamento visão
  const firstResponse = await callLLMWithFallback(messages, true, 0, imageBase64, imageMime);
  const levelUsed = firstResponse.levelUsed;

  console.log(`[jarvisCore] LLM usado: ${LLM_CHAIN[levelUsed]?.label} | tool_calls: ${firstResponse.tool_calls?.length || 0} | vision: ${!!imageBase64}`);

  let finalReply: string;

  // 5. Se o LLM chamou tools, executa e faz segunda chamada para resposta final
  if (firstResponse.tool_calls?.length) {
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: firstResponse.content,
      tool_calls: firstResponse.tool_calls,
    };
    messages.push(assistantMsg);

    const entitiesUpdated = new Set<string>();

    // Executa cada tool call
    for (const call of firstResponse.tool_calls) {
      toolsUsed.push(call.function.name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        // args já é {}
      }

      console.log(`[jarvisCore] Tool: ${call.function.name}`, args);
      const result = await executeTool(call.function.name, args, clientId);
      console.log(`[jarvisCore] Result:`, result.message);

      // Registra entidade para emitir evento de atualização
      const entity = TOOL_TO_ENTITY[call.function.name];
      if (entity && result.success) entitiesUpdated.add(entity);

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: result.message,
      });
    }

    // Segunda chamada: gera resposta final em linguagem natural
    // Usa o mesmo nível que funcionou, com fallback a partir daí
    const finalResponse = await callLLMWithFallback(messages, false, levelUsed, imageBase64, imageMime);
    finalReply = stripMarkdown(finalResponse.content || "Ação executada, Senhor.");

    // Emite database:updated para cada entidade modificada com sucesso
    if (entitiesUpdated.size > 0) {
      for (const entity of entitiesUpdated) {
        io.emit("database:updated", { type: entity, timestamp: Date.now() });
        console.log(`\x1b[36m[Socket.io] database:updated → ${entity}\x1b[0m`);
      }
    }
  } else {
    // Sem tool calls — resposta direta
    finalReply = stripMarkdown(firstResponse.content || "Sem resposta disponível.");
  }

  // 6. Persiste histórico com client_id
  await saveToHistory(input.sessionId, "user", input.message, clientId);
  await saveToHistory(input.sessionId, "assistant", finalReply, clientId);

  return { reply: finalReply, toolsUsed, handled: true };
}

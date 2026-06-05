// ─── intentRouter.ts ─────────────────────────────────────────────────────────
// Roteador central de intenção para dados pessoais do J.A.R.V.I.S.
// Intercepta frases naturais em português ANTES do LLM.
// Retorna null → fluxo LLM normal continua.
// ─────────────────────────────────────────────────────────────────────────────

export type IntentDomain =
  | "memory"
  | "contacts"
  | "appointments"
  | "todos"
  | "finances"
  | "projects"
  | "web"
  | "general_chat";

export type IntentAction =
  | "list"
  | "list_future"
  | "list_past"
  | "list_all"
  | "search"
  | "summary"
  | "status"
  | "create"
  | "update"
  | "delete"
  | "add_measurement";

export interface DetectedIntent {
  domain: IntentDomain;
  action: IntentAction;
  entityName?: string;
  amount?: number;
  unit?: string;
  timeRange?: string;
  confidence: number;   // 0.0 – 1.0
  needsTool: boolean;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

type MsgLike = { role: string; content: string | null };

// ─── Normalização ─────────────────────────────────────────────────────────────

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // remove acentos
    .replace(/[^\w\s]/g, " ")         // pontuação → espaço
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Extração de contexto do histórico ───────────────────────────────────────

function lastProjectFromHistory(history: MsgLike[]): string {
  const patterns = [
    /projeto\s+([a-z][a-z\s]{1,30})/,
    /\bperda\s+de\s+peso\b/,
  ];
  for (let i = history.length - 1; i >= 0; i--) {
    const c = norm(history[i]?.content || "");
    for (const pat of patterns) {
      const m = c.match(pat);
      if (m) return m[1]?.trim() || "Perda de Peso";
    }
  }
  return "";
}

// ─── Detector principal ───────────────────────────────────────────────────────

export function detectIntentForTools(
  message: string,
  history: MsgLike[] = []
): DetectedIntent | null {
  const n = norm(message);

  // ══ 1. MEDIÇÃO DE PROJETO (ex: "Perdi 2 kg", "Estou com 120 kg") ══════════
  const measurePats: Array<{ re: RegExp }> = [
    { re: /(?:perdi|emagreci|reduzi|baixei)\s+(\d+[,.]?\d*)\s*(kg|g|quilos?|gramas?)/  },
    { re: /(?:ganhei|aumentei|engordei)\s+(\d+[,.]?\d*)\s*(kg|g|quilos?|gramas?)/ },
    { re: /(?:estou\s+com|to\s+com|peso(?:ndo)?|tou\s+com)\s+(\d+[,.]?\d*)\s*(kg|g|quilos?)/ },
    { re: /meu\s+peso\s+(?:e|eh|agora|hoje|atual)\s+(\d+[,.]?\d*)\s*(kg|g|quilos?)/ },
    { re: /(\d+[,.]?\d*)\s*(kg|quilos?)\s+(?:agora|hoje|no momento)/ },
    { re: /medindo\s+(\d+[,.]?\d*)\s*(cm|metros?|m)\b/ },
  ];
  for (const { re } of measurePats) {
    const m = n.match(re);
    if (m) {
      const value = parseFloat(m[1].replace(",", "."));
      const rawUnit = m[2];
      const unit = rawUnit.startsWith("g") && rawUnit.length === 1 ? "g"
        : rawUnit.startsWith("cm") || rawUnit.startsWith("m") ? rawUnit
        : "kg";
      const metric = (rawUnit.startsWith("cm") || rawUnit.startsWith("m")) ? "altura" : "peso";
      const projectName = lastProjectFromHistory(history); // pode ser "" → jarvisCore faz lookup
      return {
        domain: "projects",
        action: "add_measurement",
        entityName: projectName || undefined,
        amount: value,
        unit,
        confidence: 0.92,
        needsTool: true,
        toolName: "registrar_medicao_projeto",
        toolArgs: { project_name: projectName, metric_name: metric, value, unit },
      };
    }
  }

  // ══ 2. CONTATOS ═══════════════════════════════════════════════════════════

  // Busca específica: "telefone do Pedro", "número da Campo Verde"
  const phoneLookup = n.match(
    /(?:telefone|numero|whatsapp|celular|fone|contato|zap|wpp)\s+(?:do?|da|de|d[ao])\s+(.{2,30})/
  );
  if (phoneLookup && !/\b(?:salvar|adicionar|criar|anotar|guardar)\b/.test(n)) {
    const name = phoneLookup[1].trim();
    return {
      domain: "contacts", action: "search", entityName: name,
      confidence: 0.92, needsTool: true,
      toolName: "buscar_contato", toolArgs: { query: name },
    };
  }

  // Salvar contato
  const saveContactMatch = n.match(/\b(?:salvar|adicionar|criar|anotar|guardar)\s+(?:contato|numero|telefone)?\s*([a-z0-9\s]+?)(?:[-:,\s]+(?:numero|telefone|celular|whatsapp|zap|wpp)?\s*(\d+))?$/);
  if (saveContactMatch) {
    const cName = saveContactMatch[1].trim();
    const cPhone = saveContactMatch[2] ? saveContactMatch[2].trim() : "";
    return {
      domain: "contacts", action: "create", entityName: cName,
      confidence: 0.95, needsTool: true,
      toolName: "salvar_contato", toolArgs: { name: cName, phone: cPhone },
    };
  }

  // Listagem geral de contatos
  if (
    /\b(contato|contatos|telefone|telefones|agenda|numeros)\b/.test(n) &&
    /\b(meu|meus|salvo|salvos|quais|listar?|ver|mostrar|tem|tenho|lista)\b/.test(n)
  ) {
    return {
      domain: "contacts", action: "list",
      confidence: 0.88, needsTool: true,
      toolName: "listar_contatos", toolArgs: {},
    };
  }

  // ══ 3. TAREFAS ════════════════════════════════════════════════════════════
  const createTodoMatch = n.match(/\b(?:tarefa|lembrete|adicionar\s+(?:tarefa|lembrete)|criar\s+(?:tarefa|lembrete)|salvar\s+(?:tarefa|lembrete)|preciso\s+(?:fazer|comprar))\s*[:\-]?\s+(.+)/);
  if (createTodoMatch) {
    const taskContent = createTodoMatch[1].trim();
    return {
      domain: "todos", action: "create",
      confidence: 0.95, needsTool: true,
      toolName: "criar_tarefa", toolArgs: { tasks: [taskContent] },
    };
  }

  const isTodo =
    /\b(tarefa|tarefas|pendencia|pendencias|afazer|afazeres|to.?do|lista\s+de\s+tarefas|checklist)\b/.test(n);
  const todoCtx =
    /\b(minha|minhas|meu|meus|salva|salvas|quais|listar?|tenho|preciso|o\s+que|ver|mostrar)\b/.test(n);
  const todoAlt = /\bo\s+que\s+(tenho|preciso)\s+(fazer|executar|concluir)\b/.test(n);

  if (isTodo || todoAlt) {
    return {
      domain: "todos", action: "list",
      confidence: isTodo && todoCtx ? 0.9 : todoAlt ? 0.85 : 0.72,
      needsTool: true,
      toolName: "listar_tarefas", toolArgs: { status: "pendente" },
    };
  }

  // ══ 4. PROJETOS ═══════════════════════════════════════════════════════════
  const createProjMatch = n.match(/\b(?:criar|salvar|novo|iniciar)\s+projeto\s+([a-z0-9\s]{1,40})/);
  if (createProjMatch) {
    const pName = createProjMatch[1].trim();
    return {
      domain: "projects", action: "create", entityName: pName,
      confidence: 0.95, needsTool: true,
      toolName: "criar_projeto", toolArgs: { name: pName, category: "geral" },
    };
  }

  // Status de projeto com nome explícito
  const projStatusWithName = n.match(
    /\b(?:status|como\s+(?:esta|anda|vai)|progresso|andamento|detalhe[s]?)\b.*?\bprojeto\s+([a-z][a-z\s]{1,40})/
  );
  if (projStatusWithName) {
    const pName = projStatusWithName[1].trim();
    return {
      domain: "projects", action: "status", entityName: pName,
      confidence: 0.93, needsTool: true,
      toolName: "status_projeto", toolArgs: { project_name: pName },
    };
  }

  // "projeto X" com nome explícito (não é listagem)
  const projNamedMatch = n.match(/\bprojeto\s+([a-z][a-z\s]{1,40})/);
  if (projNamedMatch && !/\b(meus|listar|lista|todos|salvo|salvos|quais)\b/.test(n)) {
    const pName = projNamedMatch[1].trim();
    return {
      domain: "projects", action: "status", entityName: pName,
      confidence: 0.88, needsTool: true,
      toolName: "status_projeto", toolArgs: { project_name: pName },
    };
  }

  // "fala sobre o projeto", "detalhes do projeto" → usa histórico ou lista
  if (
    /\b(?:fala|conta|me\s+fala|detalhe[s]?|detalhado|informacao|info)\b.*\bprojeto\b/.test(n) ||
    /\bprojeto\b.*\b(?:fala|detalhe[s]?|conta)\b/.test(n)
  ) {
    const lastProj = lastProjectFromHistory(history);
    if (lastProj) {
      return {
        domain: "projects", action: "status", entityName: lastProj,
        confidence: 0.82, needsTool: true,
        toolName: "status_projeto", toolArgs: { project_name: lastProj },
      };
    }
    return {
      domain: "projects", action: "list",
      confidence: 0.78, needsTool: true,
      toolName: "listar_projetos", toolArgs: {},
    };
  }

  // Listagem geral de projetos
  if (
    /\b(projetos?|metas?)\b/.test(n) &&
    /\b(meu|meus|quais|listar?|tenho|qual|ver|mostrar|salvo|salvos|lista)\b/.test(n)
  ) {
    return {
      domain: "projects", action: "list",
      confidence: 0.85, needsTool: true,
      toolName: "listar_projetos", toolArgs: {},
    };
  }

  // ══ 5. FINANÇAS ═══════════════════════════════════════════════════════════
  const finSignal =
    /\b(financeiro|financeira|financa|financas|gasto|gastos|despesa|despesas|receita|receitas|dinheiro|saldo|orcamento|extrato|lancamento|lancamentos|relatorio|balanco|balanço|contas)\b/.test(n);
  const finCtx =
    /\b(meu|minha|meus|minhas|ver|mostrar|quais|resumo|historico|como\s+(?:esta|estao)|tenho|minha\s+situacao|mande|envie|gerar|detalhe[s]?|detalhado|completo)\b/.test(n);
  const finList =
    /\b(lancamento|lancamentos|extrato|historico|listar?|detalhar|detalhes|lista)\b/.test(n) &&
    (finSignal || /\bfinanceiro\b/.test(n));

  if (finList) {
    return {
      domain: "finances", action: "list",
      confidence: 0.9, needsTool: true,
      toolName: "listar_financas", toolArgs: {},
    };
  }
  if (finSignal && finCtx) {
    return {
      domain: "finances", action: "summary",
      confidence: 0.88, needsTool: true,
      toolName: "resumo_financeiro", toolArgs: { periodo: "mes_atual" },
    };
  }
  // "como estão/está minhas finanças"
  if (/\bcomo\s+(?:estao|esta[o]?)\s+(?:minha[s]?\s+)?financ/.test(n)) {
    return {
      domain: "finances", action: "summary",
      confidence: 0.92, needsTool: true,
      toolName: "resumo_financeiro", toolArgs: { periodo: "mes_atual" },
    };
  }

  // ══ 6. AGENDA ════════════════════════════════════════════════════════════
  const createApptMatch = n.match(/\b(?:reuniao|compromisso|agendar|marcar|lembrete|alerta|lembrar|avisar)\s+(.*?)\s*(?:para|dia|em|sobre)?\s*(hoje|amanha|\d{1,2}\/\d{1,2}|\d{1,2}\s+de\s+[a-z]+)\s*(?:as|às|as|h|hrs)?\s*(\d{1,2}[:h]\d{2}|\d{1,2}h|\d{1,2}\s*horas?)/);
  if (createApptMatch) {
    const title = createApptMatch[1].trim() || "Reunião";
    const dateStr = createApptMatch[2].trim();
    const timeStr = createApptMatch[3].trim().replace("h", ":").replace("oras", "").trim();
    
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let day = now.getDate();

    if (dateStr === "amanha") {
      day += 1;
    } else if (dateStr.includes("/")) {
      const parts = dateStr.split("/");
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1;
    }

    let hour = 12;
    let min = 0;
    if (timeStr.includes(":")) {
      const tParts = timeStr.split(":");
      hour = parseInt(tParts[0], 10);
      min = parseInt(tParts[1], 10) || 0;
    } else {
      hour = parseInt(timeStr, 10);
    }

    const isoDate = new Date(year, month, day, hour, min, 0).toISOString();

    return {
      domain: "appointments", action: "create", entityName: title,
      confidence: 0.95, needsTool: true,
      toolName: "criar_compromisso", toolArgs: { title: title, scheduled_at: isoDate },
    };
  }

  // Fallback simples para marcar hoje se só passar a hora
  const createApptTimeMatch = n.match(/\b(?:reuniao|compromisso|agendar|marcar)\s+(.*?)\s*(?:as|às|as|h|hrs)\s*(\d{1,2}[:h]\d{2}|\d{1,2}h)/);
  if (createApptTimeMatch && !createApptMatch) {
    const title = createApptTimeMatch[1].trim() || "Reunião";
    const timeStr = createApptTimeMatch[2].trim().replace("h", ":").trim();
    const now = new Date();
    let hour = 12; let min = 0;
    if (timeStr.includes(":")) {
      const tParts = timeStr.split(":");
      hour = parseInt(tParts[0], 10);
      min = parseInt(tParts[1], 10) || 0;
    } else {
      hour = parseInt(timeStr, 10);
    }
    const isoDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0).toISOString();
    return {
      domain: "appointments", action: "create", entityName: title,
      confidence: 0.90, needsTool: true,
      toolName: "criar_compromisso", toolArgs: { title: title, scheduled_at: isoDate },
    };
  }

  const isAppt =
    /\b(agenda|compromisso|compromissos|reuniao|reunioes|agendado|agendados|evento[s]?|calendario|calendário)\b/.test(n);

  if (isAppt || /\btenho\s+(reuniao|compromisso|agenda)\b/.test(n)) {
    if (/\b(antiga|antigas|passad|todas|incluindo|historico)\b/.test(n)) {
      return {
        domain: "appointments", action: "list_all",
        confidence: 0.88, needsTool: true,
        toolName: "listar_agenda", toolArgs: { periodo: "todas" },
      };
    }
    return {
      domain: "appointments", action: "list_future",
      confidence: 0.85, needsTool: true,
      toolName: "listar_agenda", toolArgs: { periodo: "futuras" },
    };
  }

  // ══ 7. MEMÓRIA ════════════════════════════════════════════════════════════

  // "O que você lembra de mim", "o que está salvo na minha memória"
  if (
    /\bo\s+que\s+(?:voce|vc|jarvis)\s+(?:lembra|sabe|tem\s+salvo)\b/.test(n) ||
    /\bo\s+que\s+(?:ta|esta|esta\s+salvo|tenho)\s+(?:na\s+)?(?:minha\s+)?(?:base|memoria|sistema)\b/.test(n) ||
    /\bmostra\s+(?:minhas?|meus?)\s+(?:coisas?|dados?|informacoes?)\b/.test(n)
  ) {
    return {
      domain: "memory", action: "list",
      confidence: 0.82, needsTool: true,
      toolName: "buscar_memoria", toolArgs: { query: "preferencias perfil" },
    };
  }

  // Tópicos específicos de memória: "Qual meu carro?", "Meu time?"
  const memTopicMatch = n.match(
    /\b(?:meu|minha)\s+(carro|veiculo|celular|telefone|iphone|samsung|time|clube|notebook|pc|computador|apartamento|casa|endereco|cpf|empresa|trabalho|salario|aniversario)\b/
  );
  if (memTopicMatch) {
    const topic = memTopicMatch[1];
    return {
      domain: "memory", action: "search", entityName: topic,
      confidence: 0.88, needsTool: true,
      toolName: "buscar_memoria", toolArgs: { query: topic },
    };
  }

  // Sem intenção reconhecida → LLM normal
  return null;
}

# 📋 J.A.R.V.I.S. v1.2 — Documentação Completa de Funcionalidades

## Visão Geral

O J.A.R.V.I.S. é um assistente executivo de IA multi-tenant acessível via WhatsApp e painel web administrativo. Utiliza inteligência artificial para gerenciar a rotina do usuário com agenda, finanças, contatos, projetos, tarefas e memórias.

---

## Arquitetura

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│   WhatsApp      │────▶│   Backend (Node.js)  │────▶│  Supabase   │
│   (Baileys)     │◀────│   Express + Socket.io│◀────│  PostgreSQL │
└─────────────────┘     └──────────────────────┘     └─────────────┘
                               │     ▲
                               ▼     │
                        ┌──────────────────┐
                        │  Painel Web      │
                        │  (React + Vite)  │
                        └──────────────────┘
```

**Stack:**
- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React + Vite + Framer Motion
- **IA:** Gemini, OpenRouter, Groq, Mistral, Cerebras, SambaNova, DeepSeek (cascata)
- **WhatsApp:** Baileys (multi-device)
- **Banco:** Supabase (PostgreSQL)
- **Voz:** OpenAI TTS (premium) ou Edge TTS (gratuito)
- **Deploy:** Docker + Nginx

---

## Funcionalidades por Módulo

### 1. 🤖 Motor de IA (jarvisCore.ts)

O cérebro do sistema. Recebe mensagens, interpreta com IA e executa ações via function-calling.

**17 Tools disponíveis:**

| Tool | Função | Exemplo de uso |
|------|--------|----------------|
| `registrar_financeiro` | Registra entrada/saída financeira | "Recebi R$500 do cliente José" |
| `listar_financas` | Lista transações do período | "Quanto gastei essa semana?" |
| `resumo_financeiro` | Resumo com totais e saldo | "Como estão minhas finanças?" |
| `criar_tarefa` | Cria uma tarefa/to-do | "Lembrar de comprar ração" |
| `listar_tarefas` | Lista tarefas pendentes | "O que tenho para fazer?" |
| `concluir_tarefa` | Marca tarefa como feita | "Já comprei a ração" |
| `salvar_contato` | Salva contato no banco | "Salve o número do Pedro: 61999..." |
| `buscar_contato` | Busca contato por nome | "Qual o número do Pedro?" |
| `listar_contatos` | Lista todos os contatos | "Quem são meus contatos?" |
| `salvar_memoria` | Salva informação importante | "Meu carro é um Tiggo 8" |
| `buscar_memoria` | Busca memória por contexto | "Qual é meu carro?" |
| `criar_compromisso` | Agenda compromisso | "Marcar reunião amanhã às 15h" |
| `listar_agenda` | Lista compromissos futuros | "O que tenho na agenda?" |
| `criar_projeto` | Cria projeto com metas | "Criar projeto de emagrecimento" |
| `registrar_medicao_projeto` | Registra medição/progresso | "Peso hoje: 118kg" |
| `status_projeto` | Mostra progresso do projeto | "Como está meu projeto?" |
| `listar_projetos` | Lista todos os projetos | "Quais são meus projetos?" |

**Cascata de IA:**
Gemini → OpenRouter → Groq → Mistral → Cerebras → SambaNova → DeepSeek

Se o primeiro falhar, tenta o próximo automaticamente.

---

### 2. 📱 WhatsApp (whatsapp.ts)

| Funcionalidade | Descrição |
|----------------|-----------|
| Conexão via QR Code | Scaneia QR uma vez, sessão fica salva |
| Recepção de texto | Processa mensagens e responde via IA |
| Recepção de áudio | Transcreve com Whisper (Groq) e responde |
| Envio de áudio PTT | Respostas em voz (OpenAI TTS ou Edge TTS) |
| Catraca de segurança | Só responde a JIDs cadastrados na tabela `clients` |
| Auto-start | Conecta automaticamente ao iniciar o servidor |

---

### 3. 📅 Briefing Diário (dailyBriefing.ts)

Toda manhã (configurável, padrão 07:00 horário de São Paulo):

1. Busca TODOS os clientes ativos no banco
2. Para CADA cliente individualmente:
   - Busca compromissos do dia e do dia seguinte
   - Busca resumo financeiro
   - Busca progresso dos projetos
   - Busca tarefas pendentes
3. Gera texto personalizado com IA
4. Envia via WhatsApp (texto + áudio PTT)

**Multi-tenant:** Cada cliente recebe SÓ seus próprios dados.

---

### 4. ⏰ Alertas de Compromisso (appointmentAlerts.ts)

- Verifica a cada minuto se algum compromisso está próximo (30 min antes)
- Envia lembrete via WhatsApp para o cliente correto
- Multi-tenant: usa `client_id` para encontrar o JID do dono

---

### 5. ⏱️ Expiração de Trial (trialExpiration.ts)

- Verifica periodicamente se algum trial expirou
- Bloqueia automaticamente clientes com trial vencido
- Envia mensagem de despedida via WhatsApp

---

### 6. 🧠 Memórias (memoryBrain.ts)

| Função | Descrição |
|--------|-----------|
| `saveMemory` | Salva fato/preferência com categoria e importância |
| `findMemories` | Busca memórias por texto (match parcial) |
| `listMemories` | Lista todas as memórias do cliente |
| `deleteMatchingMemories` | Remove memórias desatualizadas |
| `getRelevantContext` | Carrega contexto para enriquecer respostas da IA |

**Isolamento:** Todas as funções filtram por `client_id`.

---

### 7. 👥 Contatos (contactBrain.ts)

| Função | Descrição |
|--------|-----------|
| `saveContact` | Salva contato com nome e telefone |
| `findContactsByName` | Busca por nome (parcial) |
| `findContactByPhone` | Busca por número |
| `listContacts` | Lista todos os contatos |

---

### 8. 🖥️ Painel Web Administrativo

Interface estilo Stark/HUD com 3 modos principais:

**Modo HUD (J.A.R.V.I.S. HUD):**
- Arc Reactor Dashboard visual
- Status do sistema em tempo real

**Modo Chat:**
- Chat direto com o Jarvis pelo navegador
- Respostas em texto e áudio
- Reconhecimento de voz (browser)

**Modo Dashboard (5 abas):**

| Aba | Conteúdo |
|-----|----------|
| **CLIENTES** | Cadastro, busca, bloqueio, trial, conversão, exclusão |
| **CONTATOS** | Lista de contatos do admin |
| **AGENDA** | Compromissos futuros com data/hora |
| **PROJETOS** | Projetos com barra de progresso e medições |
| **SISTEMA** | WhatsApp (QR/Status/Controles), Memórias, Módulos ativos |

---

### 9. 🔐 Segurança Multi-Tenant

| Camada | Proteção |
|--------|----------|
| WhatsApp | Catraca por JID — ignora silenciosamente números desconhecidos |
| jarvisCore | Todas as 17 tools filtram por `client_id` |
| Rotas REST | Filtram por `getAdminClientId()` — admin só vê seus dados |
| Chat do painel | Auto-resolve `clientId` do admin |
| Briefing | Itera clientes individualmente — dados nunca se misturam |
| Login | Token dinâmico + senha `ADMIN_PASSWORD` |

---

### 10. 🔄 Tempo Real (Socket.io)

| Evento | Função |
|--------|--------|
| `whatsapp:qr` | QR Code para escanear |
| `whatsapp:status` | Status da conexão WhatsApp |
| `database:updated` | Notifica frontend quando dados mudam |

Quando o Jarvis cria/modifica algo via WhatsApp, o painel recarrega automaticamente.

---

## Estrutura de Arquivos (Pós-Limpeza)

```
javis-v1.2/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Entrada do servidor
│   │   ├── lib/
│   │   │   ├── supabase.ts       # Cliente Supabase
│   │   │   └── adminClient.ts    # Resolve client_id do admin
│   │   ├── middleware/
│   │   │   └── auth.ts           # Autenticação Bearer token
│   │   ├── routes/
│   │   │   ├── auth.ts           # Login
│   │   │   ├── chat.ts           # Chat do painel web
│   │   │   ├── clients.ts        # CRUD de clientes
│   │   │   ├── contacts.ts       # Contatos (filtrado por admin)
│   │   │   ├── appointments.ts   # Agenda (filtrado por admin)
│   │   │   ├── memories.ts       # Memórias (filtrado por admin)
│   │   │   ├── projects.ts       # Projetos (filtrado por admin)
│   │   │   ├── onboarding.ts     # Cadastro + boas-vindas
│   │   │   └── system.ts         # Config do sistema
│   │   └── services/
│   │       ├── jarvisCore.ts     # Motor de IA (17 tools)
│   │       ├── whatsapp.ts       # Conexão WhatsApp (Baileys)
│   │       ├── contactBrain.ts   # Lógica de contatos
│   │       ├── memoryBrain.ts    # Lógica de memórias
│   │       ├── dailyBriefing.ts  # Briefing diário (cron)
│   │       ├── appointmentAlerts.ts # Alertas de agenda
│   │       ├── trialExpiration.ts   # Expiração de trials
│   │       └── ttsBrain.ts       # Text-to-Speech
│   ├── scripts/                  # SQL migrations + reset
│   ├── Dockerfile                # Build multi-stage
│   ├── .env                      # Variáveis de ambiente
│   └── .env.example              # Template das variáveis
├── src/                          # Frontend React
│   ├── App.tsx                   # Componente principal
│   ├── components/
│   │   ├── DashboardTabs.tsx     # 5 abas do dashboard
│   │   ├── ArcReactorCenter.tsx  # HUD visual
│   │   ├── JarvisChat.tsx        # Interface de chat
│   │   ├── LoginBoot.tsx         # Login + boot sequence
│   │   ├── HUD.tsx               # Módulo HUD reutilizável
│   │   └── TechDecor.tsx         # Partículas decorativas
│   ├── services/
│   │   ├── api.ts                # Chamadas REST ao backend
│   │   └── jarvisVoice.ts        # TTS no frontend
│   └── config/themes.ts          # Temas e i18n
├── docker-compose.yml            # Orquestração Docker
├── DEPLOY_VPS.md                 # Guia de deploy
├── MANUTENCAO.md                 # Guia de manutenção
└── FUNCIONALIDADES.md            # Este documento
```

---

## Tabelas do Banco (Supabase)

| Tabela | Campos principais | Isolamento |
|--------|-------------------|------------|
| `clients` | id, name, phone_number, whatsapp_jid, status, plan, trial_ends_at | Tabela mãe |
| `contacts` | id, name, phone, client_id | ✅ client_id |
| `appointments` | id, title, description, scheduled_at, status, client_id | ✅ client_id |
| `memories` | id, content, category, importance, client_id | ✅ client_id |
| `finances` | id, type, amount, description, category, client_id | ✅ client_id |
| `todos` | id, task, status, client_id | ✅ client_id |
| `projects` | id, name, description, goal, status, client_id | ✅ client_id |
| `project_measurements` | id, project_id, metric_name, value, unit | Via project_id |
| `conversations` | id, session_id, role, content, client_id | ✅ client_id |

# ══════════════════════════════════════════════════════════════════════════════
# J.A.R.V.I.S. Backend — Dockerfile Multi-stage (Produção)
# Base: node:20-alpine (imagem mínima ~170MB vs ~1GB do Ubuntu)
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: deps ─────────────────────────────────────────────────────────────
# Instala APENAS as dependências de produção num layer separado.
# Isso garante que rebuild de código não reinstala node_modules.
FROM node:20-alpine AS deps

WORKDIR /app

# Instala dependências nativas necessárias para compilação
# - ffmpeg: conversão de áudio MP3 → OGG Opus (WhatsApp PTT)
# - python3 + make + g++: compilar módulos nativos (ex: sharp, canvas)
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++

COPY package.json package-lock.json ./

# npm ci é mais rápido e determinístico que npm install (usa lock file)
RUN npm ci --omit=dev


# ── Stage 2: builder ──────────────────────────────────────────────────────────
# Compila o TypeScript para JavaScript (dist/)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci                          # Instala devDependencies (tsc)

COPY tsconfig.json ./
COPY src ./src

RUN npm run build                   # npx tsc → gera /app/dist


# ── Stage 3: runner (imagem final) ────────────────────────────────────────────
# Copia apenas os artefatos compilados + deps de produção.
# Resultado: imagem final leve, sem código-fonte TypeScript exposto.
FROM node:20-alpine AS runner

WORKDIR /app

# Ferramentas de runtime (ffmpeg obrigatório para áudio WhatsApp)
RUN apk add --no-cache ffmpeg

# Copia dependências de produção do stage deps
COPY --from=deps    /app/node_modules ./node_modules

# Copia JavaScript compilado do stage builder
COPY --from=builder /app/dist        ./dist

# Copia package.json (necessário para resolver module paths)
COPY package.json ./

# ── Diretórios persistidos via volume (não devem estar na imagem) ──
# São criados aqui apenas para garantir permissões corretas no container.
RUN mkdir -p \
    storage/whatsapp-auth \
    storage/whatsapp-media \
    storage/audio

# ── Usuário não-root (segurança) ──────────────────────────────────────────────
# Evita que o processo rode como root dentro do container
RUN addgroup -S javis && adduser -S javis -G javis
RUN chown -R javis:javis /app
USER javis

# ── Porta exposta ─────────────────────────────────────────────────────────────
# Backend REST + Socket.io escutam na mesma porta (3001 por padrão)
EXPOSE 3001

# ── Health check ──────────────────────────────────────────────────────────────
# Docker verifica se o backend está respondendo a cada 30s.
# /api/health deve retornar 200 — se falhar 3x, container é marcado unhealthy.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget -qO- "http://localhost:${PORT:-3001}/api/health" || exit 1

# ── Comando de inicialização ──────────────────────────────────────────────────
# Roda o JavaScript compilado em modo produção (sem tsx, sem hot-reload)
CMD ["node", "dist/index.js"]

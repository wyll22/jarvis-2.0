# J.A.R.V.I.S. v1.2 — Assistente Executivo de IA

Assistente pessoal multi-tenant via WhatsApp com painel administrativo web.

## Documentação

| Documento | Conteúdo |
|-----------|----------|
| [FUNCIONALIDADES.md](FUNCIONALIDADES.md) | Todas as funções, módulos, tabelas e arquitetura |
| [DEPLOY_VPS.md](DEPLOY_VPS.md) | Passo a passo para subir na VPS com Docker + Nginx |
| [MANUTENCAO.md](MANUTENCAO.md) | Atualizações, backups, segurança e evolução futura |

## Quick Start (Desenvolvimento)

```bash
# Frontend
npm install && npm run dev

# Backend
cd backend && npm install && npm run dev
```

## Deploy (Produção)

```bash
# 1. Build frontend
npm run build

# 2. Copiar para VPS
scp -r . user@VPS:/home/user/javis

# 3. Na VPS
docker compose up -d --build
```

Consulte [DEPLOY_VPS.md](DEPLOY_VPS.md) para o guia completo.

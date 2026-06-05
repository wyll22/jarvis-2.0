# 🚀 J.A.R.V.I.S. — Guia de Deploy na VPS

## Pré-requisitos na VPS

| Item | Versão mínima |
|------|---------------|
| Docker | 24+ |
| Docker Compose | v2+ |
| Nginx | 1.24+ |
| Domínio (opcional) | Para HTTPS |

---

## 1. Preparar os Arquivos

Na sua máquina local, faça o build do frontend:
```bash
npm run build
```
Isso gera a pasta `dist/` com o frontend estático.

Copie o projeto para a VPS:
```bash
scp -r javis-v1.2/ user@SEU_IP:/home/user/javis
```

**Importante:** O `.env` vai junto (está no `.gitignore`, mas precisa ser copiado manualmente).

---

## 2. Configurar o .env na VPS

Edite o arquivo `backend/.env` na VPS:
```bash
nano /home/user/javis/backend/.env
```

**Variáveis OBRIGATÓRIAS:**
```env
PORT=3001
ADMIN_PASSWORD=SUA_SENHA_FORTE_AQUI

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# WhatsApp
JAVIS_ALLOWED_JID=556198705105@s.whatsapp.net
ALLOWED_JID=556198705105
WHATSAPP_AUTO_START=true
WHATSAPP_AUDIO_ENABLED=true

# IA (pelo menos um obrigatório)
GEMINI_API_KEY=xxx
```

---

## 3. Subir o Backend com Docker

```bash
cd /home/user/javis
docker compose up -d --build
```

Verificar se está rodando:
```bash
docker ps
# Deve mostrar: javis-backend | Up | (healthy)

docker logs javis-backend --tail 30
# Deve mostrar: "Javis backend rodando na porta 3001"
# Deve mostrar: "WhatsApp auto-start iniciado"
# Deve mostrar: "JAVIS Briefing: ✅ Agendado para 07:00"
```

Testar health check:
```bash
curl http://localhost:3001/api/health
# Deve retornar: {"status":"ok",...}
```

---

## 4. Configurar o Nginx

```bash
sudo nano /etc/nginx/sites-available/javis
```

```nginx
server {
    listen 80;
    server_name seu-dominio.com;  # ou IP da VPS

    # Frontend (SPA)
    root /home/user/javis/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Socket.io (tempo real)
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Rotas REST sem prefixo /api
    location ~ ^/(contacts|appointments|memories|projects|chat|health) {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Ativar e reiniciar:
```bash
sudo ln -s /etc/nginx/sites-available/javis /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. HTTPS com Certbot (Opcional mas Recomendado)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

---

## 6. Primeiro Acesso

1. Acesse `http://SEU_IP` ou `http://seu-dominio.com`
2. Tela de login → digite a senha definida em `ADMIN_PASSWORD`
3. Escaneie o QR Code na aba **SISTEMA** para conectar o WhatsApp
4. Pronto! O Jarvis começa a responder mensagens

---

## Comandos Úteis

| Ação | Comando |
|------|---------|
| Ver logs ao vivo | `docker logs -f javis-backend` |
| Reiniciar backend | `docker compose restart` |
| Atualizar código | `docker compose up -d --build` |
| Parar tudo | `docker compose stop` |
| Ver status | `docker ps` |
| Backup WhatsApp | `docker run --rm -v javis_whatsapp_auth:/data -v $(pwd):/backup alpine tar czf /backup/wa-backup.tar.gz /data` |

---

## Solução de Problemas

| Problema | Solução |
|----------|---------|
| Container reiniciando em loop | `docker logs javis-backend --tail 50` para ver o erro |
| QR Code não aparece | Verificar se `WHATSAPP_AUTO_START=true` e reiniciar |
| Painel mostra "Credenciais inválidas" | Verificar `ADMIN_PASSWORD` no `.env` |
| Frontend não carrega | Verificar se `dist/` existe e Nginx está apontando corretamente |
| Dados misturados entre clientes | Nunca deve acontecer — todas as queries filtram por `client_id` |

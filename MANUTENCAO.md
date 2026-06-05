# 🔧 J.A.R.V.I.S. — Manutenção e Futuros Ajustes

## Manutenção de Rotina

### Atualizar o Código
```bash
# 1. Copie os novos arquivos para a VPS
scp -r javis-v1.2/ user@VPS:/home/user/javis

# 2. Rebuild do frontend (na VPS ou local)
cd /home/user/javis && npm run build

# 3. Rebuild do backend Docker
docker compose up -d --build

# 4. Verificar se subiu corretamente
docker logs javis-backend --tail 20
```

### Backup da Sessão WhatsApp
Se perder o volume Docker, precisará escanear QR de novo.
```bash
# Backup
docker run --rm -v javis_whatsapp_auth:/data -v $(pwd):/backup \
  alpine tar czf /backup/whatsapp-session-$(date +%Y%m%d).tar.gz /data

# Restaurar
docker run --rm -v javis_whatsapp_auth:/data -v $(pwd):/backup \
  alpine tar xzf /backup/whatsapp-session-XXXXXXXX.tar.gz -C /
```

### Monitoramento
```bash
# Logs em tempo real
docker logs -f javis-backend

# Verificar saúde do container
docker ps   # Deve estar (healthy)

# Verificar agendamentos
docker logs javis-backend 2>&1 | grep "Briefing"
docker logs javis-backend 2>&1 | grep "Alert"
```

---

## Adicionar Novas Funcionalidades

### Adicionar uma Nova Tool ao Jarvis

1. Abra `backend/src/services/jarvisCore.ts`
2. Adicione a tool na lista `tools` (seção de definição de tools)
3. Adicione o handler na função `executeTool`
4. **IMPORTANTE:** Sempre filtre por `client_id`:
   ```typescript
   // INSERT
   .insert([{ ...dados, client_id: cid }])
   
   // SELECT
   .from('tabela').select('*').eq('client_id', cid)
   ```

### Adicionar Nova Rota REST ao Painel

1. Crie o arquivo em `backend/src/routes/novaRota.ts`
2. **IMPORTANTE:** Use `getAdminClientId()` para filtrar:
   ```typescript
   import { getAdminClientId } from '../lib/adminClient.js';
   
   router.get('/dados', async (_req, res) => {
     const adminClientId = await getAdminClientId();
     let q = supabase.from('tabela').select('*');
     if (adminClientId) q = q.eq('client_id', adminClientId);
     // ...
   });
   ```
3. Registre a rota em `backend/src/index.ts`

### Adicionar Novo Provedor de IA

1. Abra `backend/src/services/jarvisCore.ts`
2. Procure a seção da cascata de provedores
3. Adicione o novo provider seguindo o padrão existente
4. Atualize `AI_PROVIDER_ORDER` no `.env`

---

## Gerenciamento de Clientes

### Via Painel Web
- Aba **CLIENTES** → Cadastrar, bloquear, converter trial, excluir

### Via Script (Admin)
```bash
# Resetar dados de um cliente (mantém cadastro)
cd backend && npx tsx scripts/reset_client.ts CLIENT_ID
```

### Via Banco de Dados
Os scripts SQL em `backend/scripts/` servem para:
- `create_clients_table.sql` — estrutura da tabela de clientes
- `create-conversations-table.sql` — tabela de conversas
- `migrate_add_client_id.sql` — migração de client_id
- `fix-all-rls.sql` — aplicar Row Level Security

---

## Segurança — Regras de Ouro

1. **Nunca** faça query sem `.eq('client_id', ...)` em dados de usuário
2. **Nunca** exponha `SUPABASE_SERVICE_ROLE_KEY` no frontend
3. **Sempre** use `getAdminClientId()` nas rotas REST do painel
4. **Troque** a `ADMIN_PASSWORD` periodicamente
5. **Monitore** logs `[Auth]` para tentativas de acesso não autorizado

---

## Problemas Conhecidos

| Problema | Status | Solução |
|----------|--------|---------|
| `onboarding.ts:29` TS error | ⚠️ Não afeta execução | Ignorar — funciona em runtime |
| `appointmentAlerts.ts:213` TS error | ⚠️ Não afeta execução | Ignorar — funciona em runtime |
| Frontend chunk > 500kb | ⚠️ Warning apenas | Considerar code-splitting futuro |

---

## Ideias para Evolução Futura

- [ ] **Painel por cliente**: Cada cliente ter seu próprio login web
- [ ] **Dashboard financeiro**: Gráficos de entradas/saídas por mês
- [ ] **Relatórios PDF**: Exportar briefings em PDF
- [ ] **Multi-idioma no WhatsApp**: Detectar idioma do cliente
- [ ] **Webhook de pagamento**: Integrar com Stripe/Pix para ativar planos
- [ ] **Rate limiting**: Limitar mensagens por minuto por cliente
- [ ] **Auditoria de logs**: Salvar todas as ações admin no banco

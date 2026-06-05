-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Adicionar client_id na tabela conversations
-- Execute no SQL Editor do Supabase Dashboard
-- Faça backup antes: Settings → Backups → Create backup
-- ══════════════════════════════════════════════════════════════════════════════

-- PASSO 1: Adicionar coluna (idempotente — IF NOT EXISTS)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;

-- PASSO 2: Índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_client_id
  ON conversations(client_id);

CREATE INDEX IF NOT EXISTS idx_conversations_session_client
  ON conversations(session_id, client_id);

-- PASSO 3: Vincular histórico existente ao dono
-- Substitua o UUID se necessário (este é o client_id confirmado do dono)
UPDATE conversations
  SET client_id = 'e45592b1-aa7b-43cc-8647-160d5edb85b4'
  WHERE session_id = '86938795122924@lid'
    AND client_id IS NULL;

-- PASSO 4: Verificar resultado
SELECT
  COUNT(*) FILTER (WHERE client_id IS NOT NULL) AS com_client_id,
  COUNT(*) FILTER (WHERE client_id IS NULL)     AS sem_client_id,
  COUNT(*)                                       AS total
FROM conversations;

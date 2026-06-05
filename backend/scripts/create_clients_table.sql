-- ══════════════════════════════════════════════════════════════════════════════
-- J.A.R.V.I.S. SaaS — Tabela de Clientes Multi-tenant
-- Execute este script no SQL Editor do Supabase Dashboard
-- ══════════════════════════════════════════════════════════════════════════════

-- Tabela principal de clientes/assinantes
CREATE TABLE IF NOT EXISTS clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação do cliente
  name            TEXT NOT NULL,
  email           TEXT UNIQUE,

  -- Autenticação WhatsApp (dupla chave para compatibilidade de JID format)
  whatsapp_jid    TEXT UNIQUE,        -- Ex: '5561999999999@s.whatsapp.net' ou '@lid'
  phone_number    TEXT UNIQUE,        -- Apenas dígitos: '5561999999999'

  -- Controle de assinatura
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'suspended', 'trial')),

  plan            TEXT NOT NULL DEFAULT 'basic'
                  CHECK (plan IN ('basic', 'pro', 'enterprise')),

  -- Datas de controle
  trial_ends_at   TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para a catraca de autenticação (hot path em toda mensagem recebida)
CREATE INDEX IF NOT EXISTS idx_clients_whatsapp_jid    ON clients (whatsapp_jid) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_clients_phone_number    ON clients (phone_number)  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_clients_status          ON clients (status);

-- Trigger: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- ADICIONE O SEU NÚMERO COMO PRIMEIRO CLIENTE (substitua os valores)
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO clients (name, whatsapp_jid, phone_number, status, plan)
VALUES (
  'Administrador',                          -- Seu nome
  '86938795122924@lid',                     -- Seu JID atual (do .env JAVIS_ALLOWED_JID)
  '5586938795122924',                       -- Seu número só com dígitos (DDI+DDD+número)
  'active',
  'enterprise'
)
ON CONFLICT (whatsapp_jid) DO NOTHING;     -- Seguro para rodar mais de uma vez

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS (Row Level Security) — opcional mas recomendado em produção
-- Permite que o backend (service_role) leia tudo, mas usuários anônimos não.
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Permite leitura apenas pelo service_role (backend usa SUPABASE_SERVICE_ROLE_KEY)
CREATE POLICY "service_role_full_access" ON clients
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- View utilitária: clientes ativos com JID preenchido (para debugging)
CREATE OR REPLACE VIEW active_clients AS
  SELECT id, name, whatsapp_jid, phone_number, plan, created_at
  FROM clients
  WHERE status = 'active'
    AND (whatsapp_jid IS NOT NULL OR phone_number IS NOT NULL)
  ORDER BY created_at DESC;

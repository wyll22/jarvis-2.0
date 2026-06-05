-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: Adiciona coluna client_id em todas as tabelas de dados
-- Execute no SQL Editor do Supabase Dashboard
-- ══════════════════════════════════════════════════════════════════════════════

-- finances
ALTER TABLE finances ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_finances_client_id ON finances(client_id);

-- todos
ALTER TABLE todos ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_todos_client_id ON todos(client_id);

-- contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_contacts_client_id ON contacts(client_id);

-- memories
ALTER TABLE memories ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_memories_client_id ON memories(client_id);

-- appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments(client_id);

-- projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- OPCIONAL: Associar dados legados (sem client_id) ao administrador
-- Substitua o UUID abaixo pelo id do seu registro na tabela clients
-- ══════════════════════════════════════════════════════════════════════════════
-- DO $$ DECLARE admin_id UUID;
-- BEGIN
--   SELECT id INTO admin_id FROM clients WHERE status = 'active' ORDER BY created_at LIMIT 1;
--   UPDATE finances    SET client_id = admin_id WHERE client_id IS NULL;
--   UPDATE todos       SET client_id = admin_id WHERE client_id IS NULL;
--   UPDATE contacts    SET client_id = admin_id WHERE client_id IS NULL;
--   UPDATE memories    SET client_id = admin_id WHERE client_id IS NULL;
--   UPDATE appointments SET client_id = admin_id WHERE client_id IS NULL;
--   UPDATE projects    SET client_id = admin_id WHERE client_id IS NULL;
-- END $$;

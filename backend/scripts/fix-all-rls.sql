-- ============================================================
-- JAVIS: Fix de Permissões (SEGURO para SaaS)
-- Execute este script UMA VEZ no SQL Editor do Supabase.
-- Resolve o erro 42501 "permission denied" nas tabelas.
--
-- NOTA: O backend usa service_role key, que ignora RLS.
-- As permissões de 'anon' e 'authenticated' são restritas
-- para prevenir acesso direto via Supabase API pública.
-- ============================================================

-- TABELA: finances
GRANT ALL PRIVILEGES ON TABLE public.finances TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.finances TO service_role;
GRANT SELECT ON TABLE public.finances TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.finances FROM anon;
ALTER TABLE public.finances ENABLE ROW LEVEL SECURITY;

-- TABELA: todos
GRANT ALL PRIVILEGES ON TABLE public.todos TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.todos TO service_role;
GRANT SELECT ON TABLE public.todos TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.todos FROM anon;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- TABELA: appointments
GRANT ALL PRIVILEGES ON TABLE public.appointments TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.appointments TO service_role;
GRANT SELECT ON TABLE public.appointments TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.appointments FROM anon;

-- TABELA: contacts
GRANT ALL PRIVILEGES ON TABLE public.contacts TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.contacts TO service_role;
GRANT SELECT ON TABLE public.contacts TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.contacts FROM anon;

-- TABELA: memories
GRANT ALL PRIVILEGES ON TABLE public.memories TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.memories TO service_role;
GRANT SELECT ON TABLE public.memories TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.memories FROM anon;

-- TABELA: projects
GRANT ALL PRIVILEGES ON TABLE public.projects TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.projects TO service_role;
GRANT SELECT ON TABLE public.projects TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.projects FROM anon;

-- TABELA: project_entries
GRANT ALL PRIVILEGES ON TABLE public.project_entries TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.project_entries TO service_role;
GRANT SELECT ON TABLE public.project_entries TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.project_entries FROM anon;

-- TABELA: project_measurements
GRANT ALL PRIVILEGES ON TABLE public.project_measurements TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.project_measurements TO service_role;
GRANT SELECT ON TABLE public.project_measurements TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.project_measurements FROM anon;

-- TABELA: clients
GRANT ALL PRIVILEGES ON TABLE public.clients TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.clients TO service_role;
REVOKE ALL PRIVILEGES ON TABLE public.clients FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.clients FROM authenticated;

-- TABELA: conversations
GRANT ALL PRIVILEGES ON TABLE public.conversations TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.conversations TO service_role;
REVOKE ALL PRIVILEGES ON TABLE public.conversations FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.conversations FROM authenticated;

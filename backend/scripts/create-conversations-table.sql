-- ============================================================
-- JAVIS: Tabela de Histórico de Conversas
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/dsiyxnndlxikipmrxnzn/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content     text        NOT NULL,
  tool_name   text        NULL,       -- preenchido quando role = 'tool'
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversations_session_created
  ON public.conversations(session_id, created_at DESC);

ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;

GRANT ALL PRIVILEGES ON TABLE public.conversations TO postgres;
GRANT ALL PRIVILEGES ON TABLE public.conversations TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.conversations TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.conversations TO anon;

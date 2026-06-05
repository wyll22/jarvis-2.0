-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: Vincular dados legados ao client_id do administrador
-- Execute no SQL Editor do Supabase Dashboard
-- ══════════════════════════════════════════════════════════════════════════════

-- Substituir os registros que estão com client_id NULL pelo seu client_id
-- UUID: e45592b1-aa7b-43cc-8647-160d5edb85b4

UPDATE finances    SET client_id = 'e45592b1-aa7b-43cc-8647-160d5edb85b4' WHERE client_id IS NULL;
UPDATE todos       SET client_id = 'e45592b1-aa7b-43cc-8647-160d5edb85b4' WHERE client_id IS NULL;
UPDATE contacts    SET client_id = 'e45592b1-aa7b-43cc-8647-160d5edb85b4' WHERE client_id IS NULL;
UPDATE memories    SET client_id = 'e45592b1-aa7b-43cc-8647-160d5edb85b4' WHERE client_id IS NULL;
UPDATE appointments SET client_id = 'e45592b1-aa7b-43cc-8647-160d5edb85b4' WHERE client_id IS NULL;
UPDATE projects    SET client_id = 'e45592b1-aa7b-43cc-8647-160d5edb85b4' WHERE client_id IS NULL;

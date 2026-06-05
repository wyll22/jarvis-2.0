/**
 * adminClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Helper para resolver o client_id do administrador (dono do painel).
 * 
 * O admin é o número configurado via ALLOWED_JID (556198705105).
 * Este módulo resolve o client_id consultando o Supabase uma vez
 * e cacheia para evitar queries repetidas.
 * 
 * Se ADMIN_CLIENT_ID for definido no .env, usa direto sem consulta.
 */

import { supabase } from "./supabase.js";

let cachedAdminClientId: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Resolve o client_id do admin do painel.
 * 
 * Prioridade:
 * 1. Variável ADMIN_CLIENT_ID no .env (explícita)
 * 2. Busca no banco por ALLOWED_JID (556198705105@s.whatsapp.net)
 * 3. null (fallback — retorna tudo, legado)
 */
export async function getAdminClientId(): Promise<string | null> {
  // 1. Variável explícita
  const envId = process.env.ADMIN_CLIENT_ID?.trim();
  if (envId) return envId;

  // 2. Cache válido
  if (cachedAdminClientId && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedAdminClientId;
  }

  // 3. Resolve via ALLOWED_JID
  const allowedJid = process.env.ALLOWED_JID?.trim() || process.env.JAVIS_ALLOWED_JID?.trim();
  if (!allowedJid) {
    console.warn("[adminClient] Nenhum ALLOWED_JID configurado — painel mostrará dados globais.");
    return null;
  }

  // Normaliza para JID completo
  const jid = allowedJid.includes("@") ? allowedJid : `${allowedJid.replace(/\D/g, "")}@s.whatsapp.net`;
  const digits = jid.replace(/[^\d]/g, "");

  try {
    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .or(`whatsapp_jid.eq.${jid},phone_number.eq.${digits}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[adminClient] Erro ao buscar admin:", error.message);
      return null;
    }

    if (data?.id) {
      cachedAdminClientId = data.id;
      cacheTimestamp = Date.now();
      console.log(`[adminClient] Admin resolvido: client_id=${data.id} (JID=${jid})`);
      return data.id;
    }

    console.warn(`[adminClient] Admin JID ${jid} não encontrado na tabela clients.`);
    return null;
  } catch (err: any) {
    console.error("[adminClient] Erro ao resolver admin:", err?.message);
    return null;
  }
}

/** Invalida o cache (útil quando um novo cliente é registrado) */
export function invalidateAdminCache(): void {
  cachedAdminClientId = null;
  cacheTimestamp = 0;
}

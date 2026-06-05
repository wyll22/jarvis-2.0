/**
 * =================================================================
 * JAVIS SaaS — ADMIN RESET SCRIPT
 * =================================================================
 * ATENÇÃO: Este script é de USO EXCLUSIVO DO ADMINISTRADOR.
 * Ele NÃO está exposto na interface do usuário final.
 *
 * Uso:
 *   npx ts-node scripts/reset_client.ts
 *   (ou: npx tsx scripts/reset_client.ts)
 *
 * O que faz:
 *   1. Apaga todos os dados pessoais do cliente no Supabase
 *      (memories, contacts, appointments, todos, finances, notes)
 *   2. Remove a sessão do WhatsApp (força novo QR Code)
 *   3. Limpa áudios temporários do storage
 *
 * O que NÃO faz:
 *   - Não apaga o código-fonte
 *   - Não altera variáveis de ambiente
 *   - Não desinstala dependências
 * =================================================================
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../");
const authDir = path.join(backendRoot, "storage", "whatsapp-auth");
const audioDir = path.join(backendRoot, "storage", "audio");

// ── Supabase ──────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "❌ ERRO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidos no .env"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Confirmação interativa ────────────────────────────────────────
async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "sim");
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   J.A.R.V.I.S. SaaS — ADMIN RESET SCRIPT   ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  console.log("⚠️  Este script irá APAGAR todos os dados pessoais do cliente:");
  console.log("   • Memórias, Contatos, Agenda, Tarefas, Finanças, Notas");
  console.log("   • Sessão do WhatsApp (novo QR Code será gerado)");
  console.log("   • Arquivos de áudio temporários\n");

  const ok = await confirm('Digite "sim" para confirmar o reset: ');

  if (!ok) {
    console.log("\n🔵 Reset cancelado. Nenhum dado foi alterado.\n");
    process.exit(0);
  }

  console.log("\n🔴 Iniciando reset do sistema...\n");

  const errors: string[] = [];

  // 1. Limpar tabelas do Supabase
  const tables = [
    "memories",
    "contacts",
    "appointments",
    "todos",
    "finances",
    "notes",
    "conversations",
  ];

  for (const table of tables) {
    try {
      const { error } = await supabase
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) {
        console.warn(`  ⚠️  Aviso ao limpar tabela "${table}": ${error.message}`);
        errors.push(`${table}: ${error.message}`);
      } else {
        console.log(`  ✅ Tabela "${table}" limpa.`);
      }
    } catch (e: any) {
      console.warn(
        `  ⚠️  Tabela "${table}" pode não existir: ${e?.message || e}`
      );
      errors.push(`${table}: ${e?.message}`);
    }
  }

  // 2. Remover sessão do WhatsApp
  try {
    await fs.rm(authDir, { recursive: true, force: true });
    console.log(`  ✅ Sessão do WhatsApp removida (${authDir})`);
  } catch (e: any) {
    console.warn(`  ⚠️  Erro ao remover sessão WhatsApp: ${e?.message || e}`);
    errors.push(`whatsapp-auth: ${e?.message}`);
  }

  // 3. Limpar áudios temporários
  try {
    await fs.rm(audioDir, { recursive: true, force: true });
    console.log(`  ✅ Áudios temporários removidos (${audioDir})`);
  } catch {
    // Diretório pode não existir — ok
    console.log(`  ℹ️  Pasta de áudio não encontrada (ignorado).`);
  }

  // ── Relatório final ───────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════╗");
  if (errors.length === 0) {
    console.log("║  ✅ RESET CONCLUÍDO SEM ERROS                ║");
  } else {
    console.log(`║  ⚠️  RESET CONCLUÍDO COM ${errors.length} AVISO(S)             ║`);
  }
  console.log("╚══════════════════════════════════════════════╝\n");

  if (errors.length > 0) {
    console.log("Avisos encontrados:");
    errors.forEach((e) => console.log(`  • ${e}`));
    console.log();
  }

  console.log("ℹ️  Reinicie o backend para aplicar todas as mudanças.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Erro fatal no script de reset:", err);
  process.exit(1);
});
